from domain.exceptions import AssistantQueryError
from application.ports.query_executor import QueryExecutionError


MAX_SQL_ATTEMPTS = 2


class AskAssistantUseCase:
    def __init__(self, model, query_executor):
        self.model = model
        self.query_executor = query_executor

    def execute(
        self,
        prompt: str,
        mode: str = "read",
        scope: dict | None = None,
        confirmed: bool = False,
        sql: str | None = None,
    ) -> dict:
        if not isinstance(prompt, str) or not prompt.strip():
            raise AssistantQueryError("La petición del asistente está vacía")
        if mode not in {"read", "write"}:
            raise AssistantQueryError("El modo debe ser 'read' o 'write'")
        if not isinstance(confirmed, bool):
            raise AssistantQueryError("confirmed debe ser booleano")
        if scope is not None and not isinstance(scope, dict):
            raise AssistantQueryError("El scope debe ser un objeto JSON")
        if sql is not None and not (mode == "write" and confirmed):
            raise AssistantQueryError("Solo se puede ejecutar SQL explícito en una escritura confirmada")

        scope = scope or {}
        last_error = None
        last_sql = sql
        last_attempted_sql = sql
        for attempt in range(1, MAX_SQL_ATTEMPTS + 1):
            if last_sql is None:
                last_sql = self.model.generate_sql(prompt, mode, scope, last_error)
            last_attempted_sql = last_sql
            try:
                if mode == "write" and not confirmed:
                    self.query_executor.validate(last_sql, mode)
                    return {
                        "ok": True,
                        "requiresConfirmation": True,
                        "sql": last_sql,
                        "attempts": attempt,
                    }
                result = self.query_executor.execute(last_sql, mode)
            except QueryExecutionError as exc:
                last_error = str(exc)
                if sql is not None:
                    raise AssistantQueryError(last_error, attempts=attempt, sql=last_attempted_sql) from exc
                last_sql = None
                continue

            answer = self.model.generate_answer(prompt, scope, last_sql, result.as_dict())
            return {
                "ok": True,
                "answer": answer,
                "sql": last_sql,
                "attempts": attempt,
                "result": result.as_dict(),
            }

        raise AssistantQueryError(
            f"La consulta no se pudo ejecutar tras {MAX_SQL_ATTEMPTS} intentos: {last_error}",
            attempts=MAX_SQL_ATTEMPTS,
            sql=last_attempted_sql,
        )
