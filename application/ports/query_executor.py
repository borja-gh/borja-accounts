from dataclasses import dataclass
from typing import Protocol


class QueryExecutionError(Exception):
    pass


@dataclass(frozen=True)
class QueryResult:
    columns: list[str]
    rows: list[dict]
    row_count: int
    affected_rows: int | None = None
    last_insert_id: int | None = None

    def as_dict(self) -> dict:
        result = {
            "columns": self.columns,
            "rows": self.rows,
            "rowCount": self.row_count,
        }
        if self.affected_rows is not None:
            result["affectedRows"] = self.affected_rows
        if self.last_insert_id is not None:
            result["lastInsertId"] = self.last_insert_id
        return result


class QueryExecutor(Protocol):
    def validate(self, sql: str, mode: str) -> None:
        ...

    def execute(self, sql: str, mode: str) -> QueryResult:
        ...
