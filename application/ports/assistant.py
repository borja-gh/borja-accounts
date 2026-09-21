from typing import Protocol


class AssistantModel(Protocol):
    def generate_sql(self, prompt: str, mode: str, scope: dict, db_error: str | None = None) -> str:
        ...

    def generate_answer(self, prompt: str, scope: dict, sql: str, db_input: dict) -> str:
        ...
