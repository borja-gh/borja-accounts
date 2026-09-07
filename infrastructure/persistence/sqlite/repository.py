"""
Adapter SQLite del puerto MovementRepository (mismo puerto que
infrastructure/persistence/csv/repository.py). Reemplaza el CSV como store
activo -- ver docs/ARCHITECTURE.md Bloque 3.

`db_path` es un argumento obligatorio, sin default: un valor por defecto
aquí facilitaría que un harness o script mal configurado abriera sin
darse cuenta la base de datos real en vez de una de prueba.
"""
import sqlite3
import uuid

import pandas as pd

from domain.entities import Account, Movement, PortfolioHolding
from domain.exceptions import AccountNotFoundError
from domain.value_objects import AccountKind

from .schema import ensure_schema

_DATE_FORMAT = "%Y-%m-%d %H:%M:%S.%f"


class SQLiteMovementRepository:
    def __init__(self, db_path: str):
        self.db_path = db_path
        with self._connect() as conn:
            ensure_schema(conn)

    def _connect(self):
        conn = sqlite3.connect(self.db_path, isolation_level=None)
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def load(self, account_id: str) -> list[Movement]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, account_id, occurred_at, type, concept, amount, balance, exchange_rate, rowid "
                "FROM movements WHERE account_id = ? ORDER BY occurred_at, rowid",
                (account_id,),
            ).fetchall()
        return [
            Movement(
                id=uuid.UUID(r[0]),
                account_id=r[1],
                occurred_at=pd.Timestamp(r[2]),
                type=r[3],
                concept=r[4],
                amount=r[5],
                balance=r[6],
                exchange_rate=r[7],
            )
            for r in rows
        ]

    def save(self, account_id: str, movements: list[Movement]) -> None:
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute("DELETE FROM movements WHERE account_id = ?", (account_id,))
                conn.executemany(
                    "INSERT INTO movements (id, account_id, occurred_at, type, concept, amount, balance, exchange_rate) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        (
                            str(m.id), m.account_id, m.occurred_at.strftime(_DATE_FORMAT),
                            m.type, m.concept, m.amount, m.balance, m.exchange_rate,
                        )
                        for m in movements
                    ],
                )
            except Exception:
                conn.execute("ROLLBACK")
                raise
            else:
                conn.execute("COMMIT")

    def list_accounts(self) -> list[Account]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, name, kind, currency, cash_override, theme FROM accounts ORDER BY rowid"
            ).fetchall()
        return [
            Account(id=r[0], name=r[1], kind=AccountKind(r[2]), currency=r[3], cash_override=r[4], theme=r[5])
            for r in rows
        ]

    def get_account(self, account_id: str) -> Account:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, name, kind, currency, cash_override, theme FROM accounts WHERE id = ?", (account_id,)
            ).fetchone()
        if row is None:
            raise AccountNotFoundError(f"Cuenta '{account_id}' no encontrada")
        return Account(id=row[0], name=row[1], kind=AccountKind(row[2]), currency=row[3], cash_override=row[4], theme=row[5])

    def list_portfolio_holdings(self, account_id: str) -> list[PortfolioHolding]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, account_id, portfolio, ticker, company, shares, price_usd, "
                "capital_usd, fee_usd, contributed_at, source_file, close_price_usd, note "
                "FROM portfolio_holdings WHERE account_id = ? ORDER BY contributed_at, id",
                (account_id,),
            ).fetchall()
        return [
            PortfolioHolding(
                id=r[0], account_id=r[1], portfolio=r[2], ticker=r[3], company=r[4],
                shares=r[5], price_usd=r[6], capital_usd=r[7], fee_usd=r[8],
                contributed_at=r[9], source_file=r[10], close_price_usd=r[11], note=r[12],
            )
            for r in rows
        ]

    def replace_portfolio_holdings(self, account_id: str, holdings: list[PortfolioHolding]) -> None:
        """Reimporta las holdings de una cuenta (p.ej. tras actualizar los
        CSV de origen). close_price_usd/note son datos editados a mano
        desde la UI -- no vienen del CSV -- así que se preservan por
        (portfolio, ticker, contributed_at) entre el borrado y la
        reinserción, para que un reimport no los destruya."""
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                existing = conn.execute(
                    "SELECT portfolio, ticker, contributed_at, close_price_usd, note "
                    "FROM portfolio_holdings WHERE account_id = ?",
                    (account_id,),
                ).fetchall()
                preserved = {(r[0], r[1], r[2]): (r[3], r[4]) for r in existing}
                conn.execute("DELETE FROM portfolio_holdings WHERE account_id = ?", (account_id,))
                conn.executemany(
                    "INSERT INTO portfolio_holdings "
                    "(account_id, portfolio, ticker, company, shares, price_usd, capital_usd, fee_usd, "
                    "contributed_at, source_file, close_price_usd, note) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        (
                            h.account_id, h.portfolio, h.ticker, h.company, h.shares,
                            h.price_usd, h.capital_usd, h.fee_usd, h.contributed_at, h.source_file,
                            *preserved.get((h.portfolio, h.ticker, h.contributed_at), (h.close_price_usd, h.note)),
                        )
                        for h in holdings
                    ],
                )
            except Exception:
                conn.execute("ROLLBACK")
                raise
            else:
                conn.execute("COMMIT")

    def update_portfolio_holding(self, holding_id: int, close_price_usd: float | None, note: str | None) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE portfolio_holdings SET close_price_usd = ?, note = ? WHERE id = ?",
                (close_price_usd, note, holding_id),
            )

    def update_account(self, account: Account) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE accounts SET currency = ?, cash_override = ?, theme = ? WHERE id = ?",
                (account.currency, account.cash_override, account.theme, account.id),
            )

    def create_account(self, account: Account, initial_movement: Movement | None = None) -> None:
        """Da de alta la cuenta y, si se pasa, su movimiento de saldo
        inicial -- en una única transacción, para no dejar una cuenta
        huérfana sin su Saldo Inicial si algo falla a mitad de camino."""
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute(
                    "INSERT INTO accounts (id, name, kind, currency, theme) VALUES (?, ?, ?, ?, ?)",
                    (account.id, account.name, account.kind.value, account.currency, account.theme),
                )
                if initial_movement is not None:
                    m = initial_movement
                    conn.execute(
                        "INSERT INTO movements (id, account_id, occurred_at, type, concept, amount, balance) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (
                            str(m.id), m.account_id, m.occurred_at.strftime(_DATE_FORMAT),
                            m.type, m.concept, m.amount, m.balance,
                        ),
                    )
            except Exception:
                conn.execute("ROLLBACK")
                raise
            else:
                conn.execute("COMMIT")
