import os
import sys
import tempfile
import importlib.util
from datetime import datetime

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from application.use_cases.ask_assistant import AskAssistantUseCase
from application.use_cases.create_account import CreateAccountUseCase
from domain.exceptions import AssistantQueryError
from domain.entities import Movement
from domain.services.ledger import LedgerService
from infrastructure.persistence.sqlite.query_executor import QueryExecutionError, SQLiteQueryExecutor
from infrastructure.persistence.sqlite.repository import SQLiteMovementRepository


class FakeModel:
    def __init__(self, sqls):
        self.sqls = iter(sqls)
        self.sql_requests = []
        self.answers = []

    def generate_sql(self, prompt, mode, scope, db_error=None):
        self.sql_requests.append({"prompt": prompt, "mode": mode, "scope": scope, "dbError": db_error})
        return next(self.sqls)

    def generate_answer(self, prompt, scope, sql, db_input):
        self.answers.append({"prompt": prompt, "scope": scope, "sql": sql, "dbInput": db_input})
        return "Respuesta de prueba"


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

    assert result.as_dict()["rows"] == [{"id": account.id, "kind": "CASH"}]
    with pytest.raises(QueryExecutionError):
        executor.execute(f"UPDATE accounts SET theme = 'slate' WHERE id = '{account.id}'", "read")


def test_executor_write_requiere_modo_write_y_persiste(database):
    db_path, repository, account = database
    executor = SQLiteQueryExecutor(db_path)

    executor.execute(f"UPDATE accounts SET theme = 'slate' WHERE id = '{account.id}'", "write")

    assert repository.get_account(account.id).theme == "slate"


def test_assistant_reintenta_con_el_error_de_sql_y_responde(database):
    db_path, _, account = database
    model = FakeModel(["SELECT missing FROM accounts", "SELECT kind, COUNT(*) AS total FROM accounts GROUP BY kind"])
    use_case = AskAssistantUseCase(model, SQLiteQueryExecutor(db_path))

    result = use_case.execute("¿Qué tipos de cuenta hay?", scope={"accountIds": [account.id]})

    assert result["answer"] == "Respuesta de prueba"
    assert result["attempts"] == 2
    assert model.sql_requests[0]["dbError"] is None
    assert "no such column" in model.sql_requests[1]["dbError"]
    assert model.answers[0]["dbInput"]["rows"] == [{"kind": "CASH", "total": 1}]


def test_assistant_devuelve_error_despues_de_dos_intentos(database):
    db_path, _, account = database
    model = FakeModel(["SELECT missing FROM accounts", "SELECT missing_again FROM accounts"])
    use_case = AskAssistantUseCase(model, SQLiteQueryExecutor(db_path))

    with pytest.raises(AssistantQueryError) as error:
        use_case.execute("Consulta inválida", scope={"accountIds": [account.id]})

    assert error.value.attempts == 2
    assert "no such column" in str(error.value)


def test_assistant_write_devuelve_propuesta_antes_de_confirmar(database):
    db_path, repository, account = database
    model = FakeModel([f"UPDATE accounts SET theme = 'slate' WHERE id = '{account.id}'"])
    use_case = AskAssistantUseCase(model, SQLiteQueryExecutor(db_path))

    result = use_case.execute("Cambia el tema", mode="write", scope={"accountIds": [account.id]})

    assert result["requiresConfirmation"] is True
    assert result["sql"].startswith("UPDATE accounts")
    assert repository.get_account(account.id).theme == "clay"


def test_http_assistant_devuelve_respuesta_y_sql(database, monkeypatch):
    db_path, _, account = database
    monkeypatch.setenv("BORJA_ACCOUNTS_DB", db_path)
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    spec = importlib.util.spec_from_file_location("app_http_assistant_test", os.path.join(repo_root, "app", "main.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    model = FakeModel(["SELECT kind, COUNT(*) AS total FROM accounts GROUP BY kind"])
    module._assistant_use_case = lambda: AskAssistantUseCase(model, SQLiteQueryExecutor(db_path))
    from fastapi.testclient import TestClient

    response = TestClient(module.app).post(
        "/api/assistant",
        json={"prompt": "¿Qué tipos de cuenta hay?", "scope": {"accountIds": [account.id]}},
    )

    assert response.status_code == 200
    assert response.json()["answer"] == "Respuesta de prueba"
    assert response.json()["attempts"] == 1


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


def test_assistant_valida_scope_antes_de_llamar_al_modelo(database):
    db_path, _, _ = database
    model = FakeModel(["SELECT 1"])
    use_case = AskAssistantUseCase(model, SQLiteQueryExecutor(db_path))

    with pytest.raises(AssistantQueryError, match="scope"):
        use_case.execute("Pregunta sin cuenta", scope={"accountIds": []})

    assert model.sql_requests == []


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
