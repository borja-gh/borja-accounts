import os
import sys
import tempfile
import importlib.util

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from application.use_cases.ask_assistant import AskAssistantUseCase
from application.use_cases.create_account import CreateAccountUseCase
from domain.exceptions import AssistantQueryError
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
    db_path, _, _ = database
    model = FakeModel(["SELECT missing FROM accounts", "SELECT kind, COUNT(*) AS total FROM accounts GROUP BY kind"])
    use_case = AskAssistantUseCase(model, SQLiteQueryExecutor(db_path))

    result = use_case.execute("¿Qué tipos de cuenta hay?", scope={"accountIds": []})

    assert result["answer"] == "Respuesta de prueba"
    assert result["attempts"] == 2
    assert model.sql_requests[0]["dbError"] is None
    assert "no such column" in model.sql_requests[1]["dbError"]
    assert model.answers[0]["dbInput"]["rows"] == [{"kind": "CASH", "total": 1}]


def test_assistant_devuelve_error_despues_de_dos_intentos(database):
    db_path, _, _ = database
    model = FakeModel(["SELECT missing FROM accounts", "SELECT missing_again FROM accounts"])
    use_case = AskAssistantUseCase(model, SQLiteQueryExecutor(db_path))

    with pytest.raises(AssistantQueryError) as error:
        use_case.execute("Consulta inválida")

    assert error.value.attempts == 2
    assert "no such column" in str(error.value)


def test_assistant_write_devuelve_propuesta_antes_de_confirmar(database):
    db_path, repository, account = database
    model = FakeModel([f"UPDATE accounts SET theme = 'slate' WHERE id = '{account.id}'"])
    use_case = AskAssistantUseCase(model, SQLiteQueryExecutor(db_path))

    result = use_case.execute("Cambia el tema", mode="write")

    assert result["requiresConfirmation"] is True
    assert result["sql"].startswith("UPDATE accounts")
    assert repository.get_account(account.id).theme == "clay"


def test_http_assistant_devuelve_respuesta_y_sql(database, monkeypatch):
    db_path, _, _ = database
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
        json={"prompt": "¿Qué tipos de cuenta hay?", "scope": {"accountIds": []}},
    )

    assert response.status_code == 200
    assert response.json()["answer"] == "Respuesta de prueba"
    assert response.json()["attempts"] == 1
