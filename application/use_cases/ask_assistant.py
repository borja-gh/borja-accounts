from application.ports.query_executor import QueryExecutionError
from domain.exceptions import AssistantQueryError


MAX_TOOL_CALLS = 20
MAX_QUERY_DESCRIPTION_LENGTH = 120


class AskAssistantUseCase:
    def __init__(self, model, query_executor, query_repository):
        self.model = model
        self.query_executor = query_executor
        self.query_repository = query_repository

    def execute(self, prompt: str, mode: str = "read", scope: dict | None = None) -> dict:
        if not isinstance(prompt, str) or not prompt.strip():
            raise AssistantQueryError("La petición del asistente está vacía")
        if mode not in {"read", "write"}:
            raise AssistantQueryError("El modo debe ser 'read' o 'write'")
        if not isinstance(scope, dict):
            raise AssistantQueryError("El scope debe ser un objeto JSON")
        try:
            self.query_executor.validate_scope(scope)
        except QueryExecutionError as exc:
            raise AssistantQueryError(str(exc)) from exc

        conversation = self.model.start(prompt.strip(), mode, scope)
        queries = []
        tool_call_count = 0

        while True:
            allow_tools = tool_call_count < MAX_TOOL_CALLS
            turn = conversation.next_turn(allow_tools=allow_tools)
            if not turn.tool_calls:
                answer = (turn.text or "").strip()
                if not answer:
                    raise AssistantQueryError("Gemini no ha devuelto una respuesta")
                return {
                    "ok": True,
                    "answer": answer,
                    "answerMarkdown": answer,
                    "queries": queries,
                    "toolCalls": tool_call_count,
                }
            if not allow_tools:
                return {
                    "ok": False,
                    "error": f"El asistente ha alcanzado el límite de {MAX_TOOL_CALLS} consultas.",
                    "queries": queries,
                    "toolCalls": tool_call_count,
                }

            tool_results = []
            for call in turn.tool_calls:
                if tool_call_count >= MAX_TOOL_CALLS:
                    tool_results.append({
                        "id": call.id,
                        "name": call.name,
                        "response": {"ok": False, "error": "Se alcanzó el límite de consultas de esta petición."},
                    })
                    continue
                tool_call_count += 1

                try:
                    description, sql = self._tool_arguments(call.arguments)
                except AssistantQueryError as exc:
                    tool_results.append({
                        "id": call.id,
                        "name": call.name,
                        "response": {"ok": False, "error": str(exc)},
                    })
                    continue
                if call.name == "read_sql":
                    query = self.query_repository.record_pending_assistant_query(
                        description, prompt.strip(), sql, scope, "read", "executing"
                    )
                    try:
                        result = self.query_executor.execute(sql, "read", scope)
                    except QueryExecutionError as exc:
                        self.query_repository.update_pending_assistant_query(query["id"], "failed", str(exc))
                        query.update({"status": "failed", "error": str(exc)})
                        tool_results.append({
                            "id": call.id,
                            "name": call.name,
                            "response": {"ok": False, "error": str(exc)},
                        })
                    else:
                        self.query_repository.update_pending_assistant_query(query["id"], "executed")
                        query.update({"status": "executed", "rowCount": result.row_count})
                        tool_results.append({
                            "id": call.id,
                            "name": call.name,
                            "response": {"ok": True, "result": result.as_dict()},
                        })
                    queries.append(self._public_query(query))
                    continue

                if call.name == "write_sql" and mode == "write":
                    query = self.query_repository.record_pending_assistant_query(
                        description, prompt.strip(), sql, scope, "write", "executing"
                    )
                    try:
                        self.query_executor.validate(sql, "write", scope)
                    except QueryExecutionError as exc:
                        self.query_repository.update_pending_assistant_query(query["id"], "failed", str(exc))
                        query.update({"status": "failed", "error": str(exc)})
                        queries.append(self._public_query(query))
                        tool_results.append({
                            "id": call.id,
                            "name": call.name,
                            "response": {"ok": False, "error": str(exc)},
                        })
                        continue
                    self.query_repository.update_pending_assistant_query(query["id"], "confirmation_required")
                    query.update({"status": "confirmation_required"})
                    queries.append(self._public_query(query))
                    return {
                        "ok": True,
                        "requiresConfirmation": True,
                        "query": self._public_query(query),
                        "queries": queries,
                        "toolCalls": tool_call_count,
                    }

                tool_results.append({
                    "id": call.id,
                    "name": call.name,
                    "response": {"ok": False, "error": "La operación solicitada no está disponible en este modo."},
                })

            conversation.submit_tool_results(tool_results)

    def confirm_write(self, query_id: str) -> dict:
        query = self.query_repository.get_pending_assistant_query(query_id)
        if query is None:
            raise AssistantQueryError("La propuesta de escritura no existe o ha caducado")
        if query["mode"] != "write" or query["status"] != "confirmation_required":
            raise AssistantQueryError("La consulta no es una propuesta de escritura pendiente")
        try:
            result = self.query_executor.execute(query["sql"], "write", query["scope"])
        except QueryExecutionError as exc:
            self.query_repository.update_pending_assistant_query(query_id, "failed", str(exc))
            raise AssistantQueryError(str(exc)) from exc
        self.query_repository.update_pending_assistant_query(query_id, "executed")
        return {
            "ok": True,
            "query": {
                **self._public_query(query),
                "status": "executed",
                "rowCount": result.affected_rows if result.affected_rows is not None else result.row_count,
            },
            "result": result.as_dict(),
        }

    @staticmethod
    def _tool_arguments(arguments: dict) -> tuple[str, str]:
        if not isinstance(arguments, dict):
            raise AssistantQueryError("La llamada a la herramienta no contiene argumentos válidos")
        description = arguments.get("description")
        sql = arguments.get("sql")
        if not isinstance(description, str) or not description.strip():
            raise AssistantQueryError("La descripción de la consulta está vacía")
        if not isinstance(sql, str) or not sql.strip():
            raise AssistantQueryError("Gemini no ha devuelto una consulta SQL")
        return description.strip()[:MAX_QUERY_DESCRIPTION_LENGTH], sql

    @staticmethod
    def _public_query(query: dict) -> dict:
        return {
            "id": query["id"],
            "description": query["title"],
            "sql": query["sql"],
            "mode": query["mode"],
            "status": query["status"],
            "error": query.get("error"),
            "rowCount": query.get("rowCount"),
        }
