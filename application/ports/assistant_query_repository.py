from typing import Protocol


class AssistantQueryRepository(Protocol):
    def record_pending_assistant_query(
        self, title: str, prompt: str, sql: str, scope: dict, mode: str, status: str
    ) -> dict:
        ...

    def update_pending_assistant_query(
        self, query_id: str, status: str, error: str | None = None
    ) -> None:
        ...

    def get_pending_assistant_query(self, query_id: str) -> dict | None:
        ...

    def save_pending_assistant_query(self, query_id: str) -> dict | None:
        ...
