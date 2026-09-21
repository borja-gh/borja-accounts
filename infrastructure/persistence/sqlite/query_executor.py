import json
import re
import sqlite3
import time
from pathlib import Path
from urllib.parse import quote

from application.ports.query_executor import QueryExecutionError, QueryResult


READ_TABLES = {"accounts", "movements", "portfolio_holdings", "cash_budgets"}
WRITE_ACTIONS = {
    sqlite3.SQLITE_DELETE,
    sqlite3.SQLITE_INSERT,
    sqlite3.SQLITE_UPDATE,
}
SAFE_READ_ACTIONS = {
    sqlite3.SQLITE_FUNCTION,
    sqlite3.SQLITE_READ,
    sqlite3.SQLITE_SELECT,
}
SAFE_WRITE_ACTIONS = SAFE_READ_ACTIONS | WRITE_ACTIONS | {sqlite3.SQLITE_TRANSACTION}


class SQLiteQueryExecutor:
    def __init__(self, db_path: str, max_rows: int = 200, max_result_bytes: int = 100_000, timeout_seconds: float = 2.0):
        self.db_path = db_path
        self.max_rows = max_rows
        self.max_result_bytes = max_result_bytes
        self.timeout_seconds = timeout_seconds

    def validate(self, sql: str, mode: str) -> None:
        connection = self._connect(mode)
        try:
            self._install_authorizer(connection, mode)
            self._validate_sql(connection, sql, mode)
        finally:
            connection.close()

    def execute(self, sql: str, mode: str) -> QueryResult:
        connection = self._connect(mode)
        try:
            self._install_authorizer(connection, mode)
            self._validate_sql(connection, sql, mode)
            if mode == "write":
                connection.execute("BEGIN IMMEDIATE")
            started = time.monotonic()
            connection.set_progress_handler(
                lambda: 1 if time.monotonic() - started > self.timeout_seconds else 0,
                1_000,
            )
            try:
                cursor = connection.execute(sql)
                columns = [column[0] for column in cursor.description or []]
                raw_rows = cursor.fetchmany(self.max_rows + 1)
                if len(raw_rows) > self.max_rows:
                    raise QueryExecutionError(
                        f"El resultado supera el límite de {self.max_rows} filas; añade filtros o LIMIT"
                    )
                rows = [dict(zip(columns, (self._json_value(value) for value in row))) for row in raw_rows]
                result = QueryResult(
                    columns=columns,
                    rows=rows,
                    row_count=len(rows),
                    affected_rows=cursor.rowcount if mode == "write" else None,
                    last_insert_id=cursor.lastrowid if mode == "write" else None,
                )
                encoded = json.dumps(result.as_dict(), ensure_ascii=False, separators=(",", ":"))
                if len(encoded.encode("utf-8")) > self.max_result_bytes:
                    raise QueryExecutionError(
                        f"El resultado supera el límite de {self.max_result_bytes} bytes; reduce columnas o filas"
                    )
            except sqlite3.Error as exc:
                raise QueryExecutionError(str(exc)) from exc
            if mode == "write":
                connection.commit()
            return result
        except QueryExecutionError:
            if mode == "write":
                connection.rollback()
            raise
        except sqlite3.Error as exc:
            if mode == "write":
                connection.rollback()
            raise QueryExecutionError(str(exc)) from exc
        finally:
            connection.close()

    def _connect(self, mode: str) -> sqlite3.Connection:
        if mode not in {"read", "write"}:
            raise QueryExecutionError("Modo de base de datos inválido")
        if mode == "read":
            db_uri = f"file:{quote(str(Path(self.db_path).resolve()), safe='/')}?mode=ro"
            try:
                connection = sqlite3.connect(db_uri, uri=True, timeout=self.timeout_seconds)
            except sqlite3.Error as exc:
                raise QueryExecutionError(str(exc)) from exc
            connection.execute("PRAGMA query_only = ON")
            return connection
        try:
            return sqlite3.connect(self.db_path, timeout=self.timeout_seconds)
        except sqlite3.Error as exc:
            raise QueryExecutionError(str(exc)) from exc

    def _install_authorizer(self, connection: sqlite3.Connection, mode: str) -> None:
        allowed_actions = SAFE_READ_ACTIONS if mode == "read" else SAFE_WRITE_ACTIONS

        def authorize(action, arg1, _arg2, _database, _source):
            if action not in allowed_actions:
                return sqlite3.SQLITE_DENY
            if action in {sqlite3.SQLITE_READ, *WRITE_ACTIONS} and arg1 not in READ_TABLES:
                return sqlite3.SQLITE_DENY
            return sqlite3.SQLITE_OK

        connection.set_authorizer(authorize)

    @staticmethod
    def _validate_sql(connection: sqlite3.Connection, sql: str, mode: str) -> None:
        if not isinstance(sql, str) or not sql.strip():
            raise QueryExecutionError("El modelo no ha devuelto una consulta SQL")
        if len(sql) > 20_000:
            raise QueryExecutionError("La consulta SQL supera el límite de longitud")
        statement = re.sub(r"^(?:\s|--[^\n]*\n|/\*.*?\*/)*", "", sql, flags=re.DOTALL).upper()
        match = re.match(r"([A-Z]+)\b", statement)
        keyword = match.group(1) if match else ""
        allowed_prefixes = (
            ("SELECT", "WITH", "EXPLAIN") if mode == "read" else ("INSERT", "UPDATE", "DELETE")
        )
        if keyword not in allowed_prefixes:
            raise QueryExecutionError("La sentencia SQL no está permitida")
        try:
            validation_sql = sql if statement.startswith("EXPLAIN") else "EXPLAIN " + sql
            connection.execute(validation_sql)
        except sqlite3.Error as exc:
            raise QueryExecutionError(str(exc)) from exc

    @staticmethod
    def _json_value(value):
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="replace")
        return value
