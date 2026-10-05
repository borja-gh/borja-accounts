import importlib.util
import os
import sys
import tempfile
from datetime import datetime

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from application.ports.assistant import AssistantToolCall, AssistantTurn
from application.use_cases.ask_assistant import AskAssistantUseCase, MAX_TOOL_CALLS
from application.use_cases.create_account import CreateAccountUseCase
from domain.entities import Movement
from domain.exceptions import AssistantQueryError
from domain.services.ledger import LedgerService
from infrastructure.persistence.sqlite.query_executor import QueryExecutionError, SQLiteQueryExecutor
from infrastructure.persistence.sqlite.repository import SQLiteMovementRepository


class FakeConversation:
    def __init__(self, turns):
        self.turns = iter(turns)
        self.tool_results = []
        self.allow_tools = []

    def next_turn(self, allow_tools=True):
        self.allow_tools.append(allow_tools)
        return next(self.turns)

    def submit_tool_results(self, results):
        self.tool_results.extend(results)


class FakeModel:
    def __init__(self, turns):
        self.conversation = FakeConversation(turns)
        self.requests = []

    def start(self, prompt, mode, scope):
        self.requests.append({"prompt": prompt, "mode": mode, "scope": scope})
        return self.conversation


def tool(name, description, sql, call_id=None):
    return AssistantTurn(
        text=None,
        tool_calls=[AssistantToolCall(
            id=call_id or f"call-{description}",
            name=name,
            arguments={"description": description, "sql": sql},
        )],
    )


def answer(text="Respuesta de prueba"):
    return AssistantTurn(text=text, tool_calls=[])


@pytest.fixture
def database():
    fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.remove(db_path)
    repository = SQLiteMovementRepository(db_path)
    account = CreateAccountUseCase(repository, LedgerService()).execute({"name": "Cash", "kind": "CASH"})
    yield db_path, repository, account
    os.remove(db_path)


def test_executor_read_only_devuelve_filas_y_bloquea_escritura(database):
    db_path, _, account = database
    executor = SQLiteQueryExecutor(db_path)

    result = executor.execute("SELECT id, kind FROM accounts", "read")
    count = executor.execute("SELECT COUNT(*) AS total FROM accounts", "read")

    assert result.as_dict()["rows"] == [{"id": account.id, "kind": "CASH"}]
    assert count.as_dict()["rows"] == [{"total": 1}]
    with pytest.raises(QueryExecutionError):
        executor.execute(f"UPDATE accounts SET theme = 'slate' WHERE id = '{account.id}'", "read")


def test_executor_write_requiere_modo_write_y_persiste(database):
    db_path, repository, account = database
    executor = SQLiteQueryExecutor(db_path)

    executor.execute(f"UPDATE accounts SET theme = 'slate' WHERE id = '{account.id}'", "write")

    assert repository.get_account(account.id).theme == "slate"


def test_assistant_itera_consultas_hasta_responder_y_persiste_cada_una(database):
    db_path, repository, account = database
    model = FakeModel([
        tool("read_sql", "Intento fallido", "SELECT missing FROM accounts"),
        tool("read_sql", "Cuentas por tipo", "SELECT kind, COUNT(*) AS total FROM accounts GROUP BY kind"),
        answer(),
    ])
    use_case = AskAssistantUseCase(model, SQLiteQueryExecutor(db_path), repository)

    result = use_case.execute("¿Qué tipos de cuenta hay?", scope={"accountIds": [account.id]})

    assert result["answerMarkdown"] == "Respuesta de prueba"
    assert result["toolCalls"] == 2
    assert [query["status"] for query in result["queries"]] == ["failed", "executed"]
    assert len({query["id"] for query in result["queries"]}) == 2
    assert "no such column" in model.conversation.tool_results[0]["response"]["error"]
    assert model.conversation.tool_results[1]["response"]["result"]["rows"] == [{"kind": "CASH", "total": 1}]


def test_assistant_aplica_limite_de_tools_y_pide_respuesta_final(database):
    assert MAX_TOOL_CALLS == 20
    db_path, repository, account = database
    turns = [tool("read_sql", f"Consulta {index}", "SELECT id FROM accounts") for index in range(MAX_TOOL_CALLS)]
    turns.append(answer("Respuesta con el máximo de consultas"))
    model = FakeModel(turns)
    use_case = AskAssistantUseCase(model, SQLiteQueryExecutor(db_path), repository)

    result = use_case.execute("Resume mis cuentas", scope={"accountIds": [account.id]})

    assert result["toolCalls"] == MAX_TOOL_CALLS
    assert len(result["queries"]) == MAX_TOOL_CALLS
    assert model.conversation.allow_tools[-1] is False
    assert result["answerMarkdown"] == "Respuesta con el máximo de consultas"


def test_assistant_write_devuelve_propuesta_y_exige_confirmacion(database):
    db_path, repository, account = database
    sql = f"UPDATE accounts SET theme = 'slate' WHERE id = '{account.id}'"
    model = FakeModel([
        tool("read_sql", "Tema actual", "SELECT theme FROM accounts"),
        tool("write_sql", "Cambiar tema", sql),
    ])
    use_case = AskAssistantUseCase(model, SQLiteQueryExecutor(db_path), repository)

    proposal = use_case.execute("Cambia el tema", mode="write", scope={"accountIds": [account.id]})

    assert proposal["requiresConfirmation"] is True
    assert proposal["query"]["description"] == "Cambiar tema"
    assert proposal["query"]["status"] == "confirmation_required"
    assert [query["status"] for query in proposal["queries"]] == ["executed", "confirmation_required"]
    assert repository.get_account(account.id).theme == "clay"

    executed = use_case.confirm_write(proposal["query"]["id"])

    assert executed["query"]["status"] == "executed"
    assert repository.get_account(account.id).theme == "slate"


def test_read_mode_no_expone_ni_ejecuta_la_tool_de_escritura(database):
    db_path, repository, account = database
    sql = f"UPDATE accounts SET theme = 'slate' WHERE id = '{account.id}'"
    model = FakeModel([tool("write_sql", "Cambiar tema", sql), answer()])
    use_case = AskAssistantUseCase(model, SQLiteQueryExecutor(db_path), repository)

    result = use_case.execute("Cambia el tema", scope={"accountIds": [account.id]})

    assert repository.get_account(account.id).theme == "clay"
    assert result["queries"] == []
    assert "no está disponible" in model.conversation.tool_results[0]["response"]["error"]


def test_asistente_pide_sql_independientes_guardables_por_id(database):
    db_path, repository, account = database
    model = FakeModel([
        tool("read_sql", "Recuento de cuentas", "SELECT COUNT(*) AS total FROM accounts"),
        tool("read_sql", "Tipos de cuenta", "SELECT kind FROM accounts"),
        answer(),
    ])
    use_case = AskAssistantUseCase(model, SQLiteQueryExecutor(db_path), repository)
    result = use_case.execute("Resume", scope={"accountIds": [account.id]})
    assert [query["status"] for query in result["queries"]] == ["executed", "executed"]
    first, second = result["queries"]

    saved = repository.save_pending_assistant_query(first["id"])

    assert saved["id"] == first["id"]
    assert saved["title"] == "Recuento de cuentas"
    assert repository.get_pending_assistant_query(first["id"]) is None
    assert repository.get_pending_assistant_query(second["id"])["title"] == "Tipos de cuenta"


def test_asistente_valida_scope_antes_de_llamar_al_modelo(database):
    db_path, repository, _ = database
    model = FakeModel([answer()])
    use_case = AskAssistantUseCase(model, SQLiteQueryExecutor(db_path), repository)

    with pytest.raises(AssistantQueryError, match="scope"):
        use_case.execute("Pregunta sin cuenta", scope={"accountIds": []})

    assert model.requests == []


def test_http_assistant_status_refleja_la_configuracion_de_arranque(monkeypatch):
    monkeypatch.setenv("ACCOUNTS_ASSISTANT_ENABLED", "0")
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    spec = importlib.util.spec_from_file_location("app_http_assistant_status_test", os.path.join(repo_root, "app", "main.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    from fastapi.testclient import TestClient

    client = TestClient(module.app)
    assert client.get("/api/assistant/status").json() == {"enabled": False}

    monkeypatch.setenv("ACCOUNTS_ASSISTANT_ENABLED", "1")
    assert client.get("/api/assistant/status").json() == {"enabled": True}


def test_http_assistant_devuelve_respuesta_y_consultas(database, monkeypatch):
    db_path, repository, account = database
    monkeypatch.setenv("BORJA_ACCOUNTS_DB", db_path)
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    spec = importlib.util.spec_from_file_location("app_http_assistant_test", os.path.join(repo_root, "app", "main.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    model = FakeModel([
        tool("read_sql", "Tipos de cuenta", "SELECT kind, COUNT(*) AS total FROM accounts GROUP BY kind"),
        answer(),
    ])
    use_case = AskAssistantUseCase(model, SQLiteQueryExecutor(db_path), repository)
    module._assistant_use_case = lambda: use_case
    from fastapi.testclient import TestClient

    client = TestClient(module.app)
    response = client.post(
        "/api/assistant",
        json={"prompt": "¿Qué tipos de cuenta hay?", "mode": "read", "scope": {"accountIds": [account.id]}},
    )

    assert response.status_code == 200
    assert response.json()["answerMarkdown"] == "Respuesta de prueba"
    assert response.json()["queries"][0]["description"] == "Tipos de cuenta"
    query_id = response.json()["queries"][0]["id"]
    saved = client.post(f"/api/assistant/pending/{query_id}/save")
    assert saved.status_code == 201
    assert saved.json()["query"]["id"] == query_id
    assert saved.json()["query"]["title"] == "Tipos de cuenta"


def test_http_write_confirmation_executes_only_the_pending_query(database, monkeypatch):
    db_path, repository, account = database
    monkeypatch.setenv("BORJA_ACCOUNTS_DB", db_path)
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    spec = importlib.util.spec_from_file_location("app_http_assistant_write_test", os.path.join(repo_root, "app", "main.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    sql = f"UPDATE accounts SET theme = 'slate' WHERE id = '{account.id}'"
    model = FakeModel([tool("write_sql", "Cambiar tema", sql)])
    use_case = AskAssistantUseCase(model, SQLiteQueryExecutor(db_path), repository)
    module._assistant_use_case = lambda: use_case
    from fastapi.testclient import TestClient

    client = TestClient(module.app)
    proposal = client.post("/api/assistant", json={
        "prompt": "Cambia el tema",
        "mode": "write",
        "scope": {"accountIds": [account.id]},
    })

    assert proposal.status_code == 200
    assert proposal.json()["requiresConfirmation"] is True
    assert repository.get_account(account.id).theme == "clay"
    executed = client.post(f"/api/assistant/pending/{proposal.json()['query']['id']}/execute")

    assert executed.status_code == 200
    assert executed.json()["query"]["status"] == "executed"
    assert repository.get_account(account.id).theme == "slate"


def test_executor_read_limita_cuentas_fechas_y_deniega_main(database):
    db_path, repository, account = database
    second = CreateAccountUseCase(repository, LedgerService()).execute({"name": "Other", "kind": "CASH"})
    repository.save(account.id, [
        Movement(account.id, datetime(2025, 1, 10), "Gasto", "pan", 10),
        Movement(account.id, datetime(2024, 12, 31), "Gasto", "pan", 20),
    ])
    repository.save(second.id, [Movement(second.id, datetime(2025, 1, 10), "Gasto", "pan", 100)])
    executor = SQLiteQueryExecutor(db_path)
    scope = {"accountIds": [account.id], "from": "2025-01-01", "to": "2025-12-31"}

    result = executor.execute("SELECT SUM(amount) AS total FROM movements", "read", scope)

    assert result.as_dict()["rows"] == [{"total": 10.0}]
    with pytest.raises(QueryExecutionError, match="prohibited"):
        executor.execute("SELECT SUM(amount) FROM main.movements", "read", scope)


def test_executor_write_no_modifica_filas_fuera_de_scope(database):
    db_path, repository, account = database
    second = CreateAccountUseCase(repository, LedgerService()).execute({"name": "Other", "kind": "CASH"})
    executor = SQLiteQueryExecutor(db_path)
    scope = {"accountIds": [account.id]}

    with pytest.raises(QueryExecutionError, match="outside selected scope"):
        executor.execute(f"UPDATE accounts SET theme = 'slate' WHERE id = '{second.id}'", "write", scope)

    assert repository.get_account(account.id).theme == "clay"
    assert repository.get_account(second.id).theme == "clay"
    executor.execute(f"UPDATE accounts SET theme = 'slate' WHERE id = '{account.id}'", "write", scope)
    assert repository.get_account(account.id).theme == "slate"


def test_executor_write_aplica_rango_de_fechas_a_movimientos(database):
    db_path, repository, account = database
    repository.save(account.id, [Movement(account.id, datetime(2024, 12, 31), "Gasto", "pan", 10)])
    movement = repository.load(account.id)[0]
    executor = SQLiteQueryExecutor(db_path)

    with pytest.raises(QueryExecutionError, match="outside selected scope"):
        executor.execute(
            f"UPDATE movements SET amount = 20 WHERE id = '{movement.id}'",
            "write",
            {"accountIds": [account.id], "from": "2025-01-01"},
        )

    assert repository.load(account.id)[0].amount == 10


def test_executor_write_deniega_subconsultas(database):
    db_path, _, account = database
    executor = SQLiteQueryExecutor(db_path)
    sql = f"UPDATE accounts SET theme = (SELECT theme FROM accounts WHERE id = '{account.id}') WHERE id = '{account.id}'"

    with pytest.raises(QueryExecutionError, match="not authorized"):
        executor.execute(sql, "write", {"accountIds": [account.id]})


def test_saved_query_rename_and_reexecution_enforce_persisted_scope(database, monkeypatch):
    db_path, repository, account = database
    second = CreateAccountUseCase(repository, LedgerService()).execute({"name": "Other", "kind": "CASH"})
    monkeypatch.setenv("BORJA_ACCOUNTS_DB", db_path)
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    spec = importlib.util.spec_from_file_location("app_http_saved_scope_test", os.path.join(repo_root, "app", "main.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    from fastapi.testclient import TestClient

    client = TestClient(module.app)
    saved = client.post("/api/assistant/saved", json={
        "title": "Cuentas visibles",
        "prompt": "Lista las cuentas de scope",
        "sql": "SELECT id FROM accounts",
        "scope": {"accountIds": [account.id]},
    })

    assert saved.status_code == 201
    query_id = saved.json()["query"]["id"]
    renamed = client.put(f"/api/assistant/saved/{query_id}", json={"title": "Solo mi cuenta"})
    executed = client.post(f"/api/assistant/saved/{query_id}/execute")

    assert renamed.status_code == 200
    assert renamed.json()["query"]["title"] == "Solo mi cuenta"
    assert executed.status_code == 200
    assert executed.json()["result"]["rows"] == [{"id": account.id}]
    assert second.id not in [row["id"] for row in executed.json()["result"]["rows"]]
