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

from domain.entities import Account, Movement
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
                "SELECT id, account_id, occurred_at, type, concept, amount, balance, rowid "
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
            )
            for r in rows
        ]

    def save(self, account_id: str, movements: list[Movement]) -> None:
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute("DELETE FROM movements WHERE account_id = ?", (account_id,))
                conn.executemany(
                    "INSERT INTO movements (id, account_id, occurred_at, type, concept, amount, balance) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [
                        (
                            str(m.id), m.account_id, m.occurred_at.strftime(_DATE_FORMAT),
                            m.type, m.concept, m.amount, m.balance,
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
                "SELECT id, name, kind, currency FROM accounts ORDER BY rowid"
            ).fetchall()
        return [Account(id=r[0], name=r[1], kind=AccountKind(r[2]), currency=r[3]) for r in rows]

    def get_account(self, account_id: str) -> Account:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, name, kind, currency FROM accounts WHERE id = ?", (account_id,)
            ).fetchone()
        if row is None:
            raise AccountNotFoundError(f"Cuenta '{account_id}' no encontrada")
        return Account(id=row[0], name=row[1], kind=AccountKind(row[2]), currency=row[3])

    def create_account(self, account: Account, initial_movement: Movement | None = None) -> None:
        """Da de alta la cuenta y, si se pasa, su movimiento de saldo
        inicial -- en una única transacción, para no dejar una cuenta
        huérfana sin su Saldo Inicial si algo falla a mitad de camino."""
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute(
                    "INSERT INTO accounts (id, name, kind, currency) VALUES (?, ?, ?, ?)",
                    (account.id, account.name, account.kind.value, account.currency),
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
