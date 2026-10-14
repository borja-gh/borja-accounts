import importlib.util
import os
import sqlite3
import sys
import tempfile

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

from application.use_cases.add_movement import AddMovementUseCase
from application.use_cases.create_account import CreateAccountUseCase
from application.use_cases.edit_movement import EditMovementUseCase
from application.use_cases.manage_expense_recurrence import ManageExpenseRecurrenceUseCase
from domain.exceptions import InvalidExpenseRecurrenceError
from domain.services.ledger import LedgerService
from infrastructure.persistence.sqlite.repository import SQLiteMovementRepository


@pytest.fixture
def repository():
    fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.remove(db_path)
    yield SQLiteMovementRepository(db_path)
    os.remove(db_path)


def test_new_expense_concepts_default_to_recurring_and_existing_concepts_inherit(repository):
    ledger = LedgerService()
    account = CreateAccountUseCase(repository, ledger).execute({"name": "Cash", "kind": "CASH"})
    add = AddMovementUseCase(repository, ledger)
    result = add.execute(account.id, {
        "fecha": "2026-01-10", "tipo": "Gasto", "concepto": "Luz", "total": 40,
        "subconcepto": "Casa",
    })
    assert result["conceptoNuevo"] is True
    assert repository.load(account.id)[0].subconcept == "Casa"
    add.execute(account.id, {"fecha": "2026-02-10", "tipo": "Gasto", "concepto": "Luz", "total": 45})
    assert add.execute(account.id, {
        "fecha": "2026-02-12", "tipo": "Gasto", "concepto": "Luz", "total": 5,
    })["conceptoNuevo"] is False
    add.execute(account.id, {
        "fecha": "2026-02-11", "tipo": "Gasto", "concepto": "Dentista", "total": 80,
        "recurrente": False,
    })
    manager = ManageExpenseRecurrenceUseCase(repository)

    assert manager.list(account.id) == [
        {"concepto": "Dentista", "recurrente": False},
        {"concepto": "Luz", "recurrente": True},
    ]
    assert manager.update(account.id, {"concepto": "Luz", "recurrente": False}) == {
        "ok": True, "concepto": "Luz", "recurrente": False,
    }
    add.execute(account.id, {"fecha": "2026-03-10", "tipo": "Gasto", "concepto": "Luz", "total": 50})

    movements = repository.load(account.id)
    assert [movement.recurrente for movement in movements if movement.concept == "Luz"] == [False, False, False, False]
    assert all(not movement.recurrente for movement in movements if movement.concept == "Dentista")
    assert manager.list(account.id) == [
        {"concepto": "Dentista", "recurrente": False},
        {"concepto": "Luz", "recurrente": False},
    ]


def test_new_expense_concept_defaults_to_recurring_and_requires_boolean_override(repository):
    account = CreateAccountUseCase(repository, LedgerService()).execute({"name": "Cash", "kind": "CASH"})
    add = AddMovementUseCase(repository, LedgerService())

    add.execute(account.id, {"fecha": "2026-01-10", "tipo": "Gasto", "concepto": "Luz", "total": 40})
    movements = repository.load(account.id)
    assert movements[0].recurrente is True

    with pytest.raises(InvalidExpenseRecurrenceError):
        add.execute(account.id, {
            "fecha": "2026-01-11", "tipo": "Gasto", "concepto": "Dentista", "total": 50,
            "recurrente": "false",
        })


def test_recurrence_requires_existing_expense_and_boolean_value(repository):
    account = CreateAccountUseCase(repository, LedgerService()).execute({"name": "Cash", "kind": "CASH"})
    manager = ManageExpenseRecurrenceUseCase(repository)

    with pytest.raises(InvalidExpenseRecurrenceError):
        manager.update(account.id, {"concepto": "", "recurrente": True})
    with pytest.raises(InvalidExpenseRecurrenceError):
        manager.update(account.id, {"concepto": "Luz", "recurrente": 1})


def test_edit_movement_persists_optional_subconcept(repository):
    ledger = LedgerService()
    account = CreateAccountUseCase(repository, ledger).execute({"name": "Cash", "kind": "CASH"})
    AddMovementUseCase(repository, ledger).execute(account.id, {
        "fecha": "2026-01-10", "tipo": "Gasto", "concepto": "Concierto", "total": 40,
    })

    EditMovementUseCase(repository, ledger).execute(account.id, {
        "idx": 0, "fecha": "2026-01-10", "tipo": "Gasto", "concepto": "Concierto",
        "subconcepto": "Artista B", "total": 40,
    })

    assert repository.load(account.id)[0].subconcept == "Artista B"


def test_legacy_movements_default_to_non_recurring():
    fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        with sqlite3.connect(db_path) as conn:
            conn.execute("CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, currency TEXT NOT NULL)")
            conn.execute("INSERT INTO accounts VALUES ('cash', 'Cash', 'CASH', 'EUR')")
            conn.execute(
                "CREATE TABLE movements (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, occurred_at TEXT NOT NULL, "
                "type TEXT NOT NULL, concept TEXT NOT NULL, amount REAL NOT NULL, balance REAL NOT NULL)"
            )
            conn.execute(
                "INSERT INTO movements VALUES ('00000000-0000-0000-0000-000000000001', 'cash', "
                "'2026-01-01 00:00:00', 'Gasto', 'Luz', 40, 100)"
            )

        movements = SQLiteMovementRepository(db_path).load("cash")
        assert movements[0].recurrente is False
    finally:
        os.remove(db_path)


def test_http_recurring_concepts_list_and_update(repository, monkeypatch):
    ledger = LedgerService()
    account = CreateAccountUseCase(repository, ledger).execute({"name": "Cash", "kind": "CASH"})
    AddMovementUseCase(repository, ledger).execute(
        account.id, {"fecha": "2026-01-10", "tipo": "Gasto", "concepto": "Luz", "total": 40}
    )
    monkeypatch.setenv("BORJA_ACCOUNTS_DB", repository.db_path)
    spec = importlib.util.spec_from_file_location("app_expense_recurrence_test", os.path.join(REPO_ROOT, "app", "main.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    from fastapi.testclient import TestClient

    client = TestClient(module.app)
    path = f"/api/accounts/{account.id}/gastos/recurrentes"
    assert client.get(path).json() == {"conceptos": [{"concepto": "Luz", "recurrente": True}]}
    response = client.put(path, json={"concepto": "Luz", "recurrente": False})
    assert response.status_code == 200
    assert response.json() == {"ok": True, "concepto": "Luz", "recurrente": False}
    assert client.get(path).json() == {"conceptos": [{"concepto": "Luz", "recurrente": False}]}

    response = client.post(f"/api/movimiento/{account.id}", json={
        "fecha": "2026-02-10", "tipo": "Gasto", "concepto": "Concierto", "subconcepto": "Artista A", "total": 40,
    })
    assert response.status_code == 200
    assert response.json()["conceptoNuevo"] is True
    movement = next(item for item in client.get(f"/api/data/{account.id}").json() if item["Concepto"] == "Concierto")
    assert movement["Subconcepto"] == "Artista A"

    response = client.post(f"/api/movimiento/{account.id}", json={
        "fecha": "2026-02-11", "tipo": "Gasto", "concepto": "Concierto", "subconcepto": None, "total": 20,
    })
    assert response.status_code == 200
    assert response.json()["conceptoNuevo"] is False
