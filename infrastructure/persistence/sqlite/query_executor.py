import json
import re
import sqlite3
import time
from datetime import date
from pathlib import Path
from urllib.parse import quote

from application.ports.query_executor import QueryExecutionError, QueryResult


READ_TABLES = {"accounts", "movements", "portfolio_holdings", "cash_budgets"}
WRITE_ACTIONS = {
    sqlite3.SQLITE_DELETE,
    sqlite3.SQLITE_INSERT,
    sqlite3.SQLITE_UPDATE,
}
SCOPED_TABLES = {
    "accounts": ("id", None),
    "movements": ("account_id", "occurred_at"),
    "portfolio_holdings": ("account_id", "contributed_at"),
    "cash_budgets": ("account_id", "budget_month"),
}
SAFE_READ_ACTIONS = {
    sqlite3.SQLITE_FUNCTION,
    sqlite3.SQLITE_READ,
    sqlite3.SQLITE_SELECT,
}
SAFE_WRITE_ACTIONS = (SAFE_READ_ACTIONS - {sqlite3.SQLITE_SELECT}) | WRITE_ACTIONS | {sqlite3.SQLITE_TRANSACTION}


class SQLiteQueryExecutor:
    def __init__(self, db_path: str, max_rows: int = 200, max_result_bytes: int = 100_000, timeout_seconds: float = 2.0):
        self.db_path = db_path
        self.max_rows = max_rows
        self.max_result_bytes = max_result_bytes
        self.timeout_seconds = timeout_seconds

    def validate_scope(self, scope: dict) -> None:
        normalized_scope = self._normalize_scope(scope)
        connection = self._connect("read")
        try:
            self._resolve_account_ids(connection, normalized_scope)
        finally:
            connection.close()

    def validate(self, sql: str, mode: str, scope: dict | None = None) -> None:
        normalized_scope = self._normalize_scope(scope if scope is not None else {"accountIds": ["*"]})
        connection = self._connect(mode)
        try:
            if mode == "read":
                self._install_read_scope(connection, normalized_scope)
            else:
                self._install_write_scope(connection, normalized_scope)
            self._install_authorizer(connection, mode)
            self._validate_sql(connection, sql, mode)
        except sqlite3.Error as exc:
            raise QueryExecutionError(str(exc)) from exc
        finally:
            connection.close()

    def execute(self, sql: str, mode: str, scope: dict | None = None) -> QueryResult:
        normalized_scope = self._normalize_scope(scope if scope is not None else {"accountIds": ["*"]})
        connection = self._connect(mode)
        try:
            if mode == "write":
                connection.execute("BEGIN IMMEDIATE")
                self._install_write_scope(connection, normalized_scope)
            else:
                self._install_read_scope(connection, normalized_scope)
            self._install_authorizer(connection, mode)
            self._validate_sql(connection, sql, mode)
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
                return sqlite3.connect(db_uri, uri=True, timeout=self.timeout_seconds)
            except sqlite3.Error as exc:
                raise QueryExecutionError(str(exc)) from exc
        try:
            return sqlite3.connect(self.db_path, timeout=self.timeout_seconds)
        except sqlite3.Error as exc:
            raise QueryExecutionError(str(exc)) from exc

    @staticmethod
    def _normalize_scope(scope: dict) -> dict:
        if not isinstance(scope, dict):
            raise QueryExecutionError("El scope debe ser un objeto JSON")
        account_ids = scope.get("accountIds")
        if (
            not isinstance(account_ids, list)
            or not account_ids
            or not all(isinstance(account_id, str) and account_id for account_id in account_ids)
            or ("*" in account_ids and account_ids != ["*"])
            or len(set(account_ids)) != len(account_ids)
        ):
            raise QueryExecutionError("El scope debe incluir accountIds válidos o ['*']")
        normalized = {"accountIds": account_ids}
        for key in ("from", "to"):
            value = scope.get(key)
            if value is not None:
                if not isinstance(value, str):
                    raise QueryExecutionError("Las fechas del scope deben ser texto ISO (YYYY-MM-DD)")
                try:
                    parsed = date.fromisoformat(value)
                    if parsed.isoformat() != value:
                        raise ValueError
                except ValueError as exc:
                    raise QueryExecutionError("Las fechas del scope deben tener formato YYYY-MM-DD") from exc
                normalized[key] = value
        if normalized.get("from") and normalized.get("to") and normalized["from"] > normalized["to"]:
            raise QueryExecutionError("La fecha 'Desde' no puede ser posterior a 'Hasta'")
        return normalized

    @staticmethod
    def _resolve_account_ids(connection: sqlite3.Connection, scope: dict) -> list[str]:
        available = {row[0] for row in connection.execute("SELECT id FROM main.accounts")}
        requested = scope["accountIds"]
        if requested == ["*"]:
            return sorted(available)
        unknown = set(requested) - available
        if unknown:
            raise QueryExecutionError("El scope contiene cuentas que no existen")
        return requested

    @classmethod
    def _install_read_scope(cls, connection: sqlite3.Connection, scope: dict) -> None:
        account_ids = cls._resolve_account_ids(connection, scope)
        for table, (account_column, date_column) in SCOPED_TABLES.items():
            clauses = []
            params: list[str] = []
            if account_ids:
                clauses.append(f"{account_column} IN ({','.join('?' for _ in account_ids)})")
                params.extend(account_ids)
            else:
                clauses.append("0")
            if date_column == "budget_month":
                month = "printf('%04d-%02d-01', year, month)"
                if scope.get("from"):
                    clauses.append(f"date({month}, '+1 month', '-1 day') >= date(?)")
                    params.append(scope["from"])
                if scope.get("to"):
                    clauses.append(f"date({month}) <= date(?)")
                    params.append(scope["to"])
            elif date_column:
                if scope.get("from"):
                    clauses.append(f"date({date_column}) >= date(?)")
                    params.append(scope["from"])
                if scope.get("to"):
                    clauses.append(f"date({date_column}) <= date(?)")
                    params.append(scope["to"])
            connection.execute(
                f"CREATE TEMP TABLE {table} AS "
                f"SELECT * FROM main.{table} WHERE {' AND '.join(clauses)}",
                params,
            )
        connection.execute("PRAGMA query_only = ON")

    @staticmethod
    def _quoted(connection: sqlite3.Connection, value: str) -> str:
        return connection.execute("SELECT quote(?)", (value,)).fetchone()[0]

    @classmethod
    def _out_of_scope(cls, connection: sqlite3.Connection, table: str, alias: str, scope: dict) -> str:
        clauses = []
        account_column, date_column = SCOPED_TABLES[table]
        if scope["accountIds"] != ["*"]:
            allowed = ",".join(cls._quoted(connection, item) for item in scope["accountIds"])
            clauses.append(f"({alias}.{account_column} IS NULL OR {alias}.{account_column} NOT IN ({allowed}))")
        if date_column == "budget_month":
            month = f"printf('%04d-%02d-01', {alias}.year, {alias}.month)"
            if scope.get("from"):
                lower = cls._quoted(connection, scope["from"])
                clauses.append(f"date({month}, '+1 month', '-1 day') < date({lower})")
            if scope.get("to"):
                upper = cls._quoted(connection, scope["to"])
                clauses.append(f"date({month}) > date({upper})")
        elif date_column:
            if scope.get("from"):
                lower = cls._quoted(connection, scope["from"])
                clauses.append(f"({alias}.{date_column} IS NULL OR date({alias}.{date_column}) < date({lower}))")
            if scope.get("to"):
                upper = cls._quoted(connection, scope["to"])
                clauses.append(f"({alias}.{date_column} IS NULL OR date({alias}.{date_column}) > date({upper}))")
        return " OR ".join(clauses) or "0"

    @classmethod
    def _install_write_scope(cls, connection: sqlite3.Connection, scope: dict) -> None:
        cls._resolve_account_ids(connection, scope)
        for table in SCOPED_TABLES:
            for operation in ("INSERT", "UPDATE", "DELETE"):
                aliases = {"INSERT": ["NEW"], "UPDATE": ["OLD", "NEW"], "DELETE": ["OLD"]}[operation]
                condition = " OR ".join(
                    f"({cls._out_of_scope(connection, table, alias, scope)})" for alias in aliases
                )
                if all(cls._out_of_scope(connection, table, alias, scope) == "0" for alias in aliases):
                    continue
                connection.execute(
                    f"CREATE TEMP TRIGGER scope_guard_{table}_{operation.lower()} "
                    f"BEFORE {operation} ON main.{table} WHEN {condition} "
                    "BEGIN SELECT RAISE(ABORT, 'SQL write outside selected scope'); END"
                )

    def _install_authorizer(self, connection: sqlite3.Connection, mode: str) -> None:
        allowed_actions = SAFE_READ_ACTIONS if mode == "read" else SAFE_WRITE_ACTIONS

        def authorize(action, arg1, _arg2, database, source):
            if action == sqlite3.SQLITE_SELECT and source and source.startswith("scope_guard_"):
                return sqlite3.SQLITE_OK
            if action not in allowed_actions:
                return sqlite3.SQLITE_DENY
            if action in {sqlite3.SQLITE_READ, *WRITE_ACTIONS} and arg1 not in READ_TABLES:
                return sqlite3.SQLITE_DENY
            if mode == "read" and action == sqlite3.SQLITE_READ and database != "temp":
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
        allowed_prefixes = ("SELECT", "WITH", "EXPLAIN") if mode == "read" else ("INSERT", "UPDATE", "DELETE")
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
