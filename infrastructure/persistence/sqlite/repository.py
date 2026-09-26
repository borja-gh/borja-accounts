"""
Adapter SQLite del puerto MovementRepository (mismo puerto que
infrastructure/persistence/csv/repository.py). Es el store activo de la
app; el adapter CSV queda para import one-off y el harness de tests.

`db_path` es un argumento obligatorio, sin default: un valor por defecto
aquí facilitaría que un harness o script mal configurado abriera sin
darse cuenta la base de datos real en vez de una de prueba.
"""
import json
import sqlite3
import uuid
from datetime import datetime, timezone

import pandas as pd

from domain.entities import Account, CashBudget, Movement, PortfolioHolding
from domain.exceptions import (
    AccountNotFoundError,
    CashBudgetNotFoundError,
    SavedAssistantQueryNotFoundError,
)
from domain.value_objects import AccountKind

from .schema import ensure_schema
from .transfer_links import backfill_transfer_links

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
            backfill_transfer_links(conn)
            conn.commit()
            rows = conn.execute(
                "SELECT id, account_id, occurred_at, type, concept, amount, balance, "
                "exchange_rate, transfer_link_id, rowid "
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
                transfer_link_id=uuid.UUID(r[8]) if r[8] else None,
            )
            for r in rows
        ]

    def save(self, account_id: str, movements: list[Movement]) -> None:
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute("DELETE FROM movements WHERE account_id = ?", (account_id,))
                conn.executemany(
                    "INSERT INTO movements (id, account_id, occurred_at, type, concept, amount, balance, "
                    "exchange_rate, transfer_link_id) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        (
                            str(m.id), m.account_id, m.occurred_at.strftime(_DATE_FORMAT),
                            m.type, m.concept, m.amount, m.balance, m.exchange_rate,
                            str(m.transfer_link_id) if m.transfer_link_id else None,
                        )
                        for m in movements
                    ],
                )
                backfill_transfer_links(conn)
            except Exception:
                conn.execute("ROLLBACK")
                raise
            else:
                conn.execute("COMMIT")

    def list_accounts(self) -> list[Account]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, name, kind, currency, theme FROM accounts ORDER BY rowid"
            ).fetchall()
        return [
            Account(id=r[0], name=r[1], kind=AccountKind(r[2]), currency=r[3], theme=r[4])
            for r in rows
        ]

    def get_account(self, account_id: str) -> Account:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, name, kind, currency, theme FROM accounts WHERE id = ?", (account_id,)
            ).fetchone()
        if row is None:
            raise AccountNotFoundError(f"Cuenta '{account_id}' no encontrada")
        return Account(id=row[0], name=row[1], kind=AccountKind(row[2]), currency=row[3], theme=row[4])

    def list_portfolio_holdings(self, account_id: str) -> list[PortfolioHolding]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, account_id, portfolio, ticker, company, shares, price_usd, "
                "capital_usd, fee_usd, contributed_at, source_file, close_price_usd, note, current_price_usd "
                "FROM portfolio_holdings WHERE account_id = ? ORDER BY contributed_at, id",
                (account_id,),
            ).fetchall()
        return [
            PortfolioHolding(
                id=r[0], account_id=r[1], portfolio=r[2], ticker=r[3], company=r[4],
                shares=r[5], price_usd=r[6], capital_usd=r[7], fee_usd=r[8],
                contributed_at=r[9], source_file=r[10], close_price_usd=r[11], note=r[12],
                current_price_usd=r[13],
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
                    "SELECT portfolio, ticker, contributed_at, close_price_usd, note, current_price_usd "
                    "FROM portfolio_holdings WHERE account_id = ?",
                    (account_id,),
                ).fetchall()
                preserved = {(r[0], r[1], r[2]): (r[3], r[4], r[5]) for r in existing}
                conn.execute("DELETE FROM portfolio_holdings WHERE account_id = ?", (account_id,))
                conn.executemany(
                    "INSERT INTO portfolio_holdings "
                    "(account_id, portfolio, ticker, company, shares, price_usd, capital_usd, fee_usd, "
                    "contributed_at, source_file, close_price_usd, note, current_price_usd) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        (
                            h.account_id, h.portfolio, h.ticker, h.company, h.shares,
                            h.price_usd, h.capital_usd, h.fee_usd, h.contributed_at, h.source_file,
                            *preserved.get(
                                (h.portfolio, h.ticker, h.contributed_at),
                                (h.close_price_usd, h.note, h.current_price_usd),
                            ),
                        )
                        for h in holdings
                    ],
                )
            except Exception:
                conn.execute("ROLLBACK")
                raise
            else:
                conn.execute("COMMIT")

    def add_portfolio_holding(self, holding: PortfolioHolding) -> int:
        """Inserta un lote nuevo (alta desde la UI) y devuelve su id."""
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO portfolio_holdings "
                "(account_id, portfolio, ticker, company, shares, price_usd, capital_usd, fee_usd, "
                "contributed_at, source_file, close_price_usd, note, current_price_usd) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    holding.account_id, holding.portfolio, holding.ticker, holding.company,
                    holding.shares, holding.price_usd, holding.capital_usd, holding.fee_usd,
                    holding.contributed_at, holding.source_file, holding.close_price_usd,
                    holding.note, holding.current_price_usd,
                ),
            )
            return int(cur.lastrowid)

    def update_portfolio_holding(self, holding_id: int, close_price_usd: float | None, note: str | None,
                                  current_price_usd: float | None) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE portfolio_holdings SET close_price_usd = ?, note = ?, current_price_usd = ? WHERE id = ?",
                (close_price_usd, note, current_price_usd, holding_id),
            )

    def update_holdings_current_prices(self, updates: dict[int, float]) -> None:
        """Upsert en batch de current_price_usd -- una única transacción
        (usado por RefreshHoldingPricesUseCase tras consultar yfinance)."""
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.executemany(
                    "UPDATE portfolio_holdings SET current_price_usd = ? WHERE id = ?",
                    [(price, holding_id) for holding_id, price in updates.items()],
                )
            except Exception:
                conn.execute("ROLLBACK")
                raise
            else:
                conn.execute("COMMIT")

    def update_account(self, account: Account) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE accounts SET currency = ?, theme = ? WHERE id = ?",
                (account.currency, account.theme, account.id),
            )

    @staticmethod
    def _cash_budget(row) -> CashBudget:
        return CashBudget(
            id=int(row[0]), account_id=row[1], period_type=row[2], year=int(row[3]),
            month=int(row[4]), amount=float(row[5]),
        )

    def list_cash_budgets(self, account_id: str) -> list[CashBudget]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, account_id, period_type, year, month, amount "
                "FROM cash_budgets WHERE account_id = ? "
                "ORDER BY year DESC, month DESC, period_type, id DESC",
                (account_id,),
            ).fetchall()
        return [self._cash_budget(row) for row in rows]

    def get_cash_budget(self, account_id: str, period_type: str, year: int, month: int) -> CashBudget | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, account_id, period_type, year, month, amount "
                "FROM cash_budgets WHERE account_id = ? AND period_type = ? AND year = ? AND month = ?",
                (account_id, period_type, year, month),
            ).fetchone()
        return None if row is None else self._cash_budget(row)

    def upsert_cash_budget(self, account_id: str, period_type: str, year: int, month: int, amount: float) -> CashBudget:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO cash_budgets (account_id, period_type, year, month, amount) "
                "VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(account_id, period_type, year, month) DO UPDATE SET amount = excluded.amount",
                (account_id, period_type, year, month, amount),
            )
            row = conn.execute(
                "SELECT id, account_id, period_type, year, month, amount "
                "FROM cash_budgets WHERE account_id = ? AND period_type = ? AND year = ? AND month = ?",
                (account_id, period_type, year, month),
            ).fetchone()
        return self._cash_budget(row)

    def delete_cash_budget(self, account_id: str, budget_id: int) -> None:
        with self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM cash_budgets WHERE id = ? AND account_id = ?",
                (budget_id, account_id),
            )
            if cur.rowcount == 0:
                raise CashBudgetNotFoundError(f"Presupuesto {budget_id} no encontrado")

    @staticmethod
    def _saved_assistant_query(row) -> dict:
        return {
            "id": row[0],
            "title": row[1],
            "prompt": row[2],
            "sql": row[3],
            "scope": json.loads(row[4]),
            "createdAt": row[5],
        }

    def list_saved_assistant_queries(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, title, prompt, sql, scope_json, created_at "
                "FROM assistant_saved_queries ORDER BY created_at DESC, rowid DESC"
            ).fetchall()
        return [self._saved_assistant_query(row) for row in rows]

    def get_saved_assistant_query(self, query_id: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, title, prompt, sql, scope_json, created_at "
                "FROM assistant_saved_queries WHERE id = ?",
                (query_id,),
            ).fetchone()
        return None if row is None else self._saved_assistant_query(row)

    def save_assistant_query(self, title: str, prompt: str, sql: str, scope: dict) -> dict:
        query_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO assistant_saved_queries (id, title, prompt, sql, scope_json, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (query_id, title, prompt, sql, json.dumps(scope, ensure_ascii=False), created_at),
            )
        return {
            "id": query_id,
            "title": title,
            "prompt": prompt,
            "sql": sql,
            "scope": scope,
            "createdAt": created_at,
        }

    def delete_saved_assistant_query(self, query_id: str) -> None:
        with self._connect() as conn:
            cursor = conn.execute(
                "DELETE FROM assistant_saved_queries WHERE id = ?", (query_id,)
            )
            if cursor.rowcount == 0:
                raise SavedAssistantQueryNotFoundError(
                    f"Consulta guardada '{query_id}' no encontrada"
                )

    def rename_saved_assistant_query(self, query_id: str, title: str) -> dict:
        with self._connect() as conn:
            cursor = conn.execute(
                "UPDATE assistant_saved_queries SET title = ? WHERE id = ?",
                (title, query_id),
            )
            if cursor.rowcount == 0:
                raise SavedAssistantQueryNotFoundError(
                    f"Consulta guardada '{query_id}' no encontrada"
                )
            row = conn.execute(
                "SELECT id, title, prompt, sql, scope_json, created_at "
                "FROM assistant_saved_queries WHERE id = ?",
                (query_id,),
            ).fetchone()
        return self._saved_assistant_query(row)

    def delete_account(self, account_id: str) -> None:
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute("DELETE FROM portfolio_holdings WHERE account_id = ?", (account_id,))
                conn.execute("DELETE FROM movements WHERE account_id = ?", (account_id,))
                conn.execute("DELETE FROM cash_budgets WHERE account_id = ?", (account_id,))
                conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
            except Exception:
                conn.execute("ROLLBACK")
                raise
            else:
                conn.execute("COMMIT")

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
