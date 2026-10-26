import importlib.util
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from application.use_cases.add_movement import AddMovementUseCase
from application.use_cases.create_account import CreateAccountUseCase
from application.use_cases.delete_movement import DeleteMovementUseCase
from application.use_cases.transfer_between_accounts import TransferBetweenAccountsUseCase
from domain.entities import Movement
from domain.exceptions import MovementNotFoundError, ProtectedInitialBalanceError
from domain.services.ledger import LedgerService
from domain.value_objects import AccountKind
from infrastructure.persistence.sqlite.repository import SQLiteMovementRepository


@pytest.fixture
def repository(tmp_path):
    return SQLiteMovementRepository(str(tmp_path / "delete.db"))


def test_delete_selected_movement_recalculates_following_balances(repository):
    ledger = LedgerService()
    account = CreateAccountUseCase(repository, ledger).execute({"name": "Cash", "kind": "CASH", "initialBalance": 100})
    add = AddMovementUseCase(repository, ledger)
    add.execute(account.id, {"tipo": "Gasto", "concepto": "Cena", "total": 20, "fecha": "2026-11-01"})
    add.execute(account.id, {"tipo": "Ingreso", "concepto": "Venta", "total": 10, "fecha": "2026-11-02"})

    deleted, balance = DeleteMovementUseCase(repository, ledger).execute(account.id, 1)

    remaining = repository.load(account.id)
    assert deleted["concepto"] == "Cena"
    assert [movement.balance for movement in remaining] == [100, 110]
    assert balance == 110


def test_delete_selected_movement_protects_initial_balance_and_invalid_indexes(repository):
    account = CreateAccountUseCase(repository, LedgerService()).execute({"name": "Cash", "kind": "CASH", "initialBalance": 100})
    delete = DeleteMovementUseCase(repository, LedgerService())
    with pytest.raises(ProtectedInitialBalanceError):
        delete.execute(account.id, 0)
    with pytest.raises(MovementNotFoundError):
        delete.execute(account.id, 1)


def test_delete_selected_transfer_removes_counterpart_and_recalculates_both_accounts(repository):
    ledger = LedgerService()
    create = CreateAccountUseCase(repository, ledger)
    origin = create.execute({"name": "Origin", "kind": "CASH", "initialBalance": 100})
    destination = create.execute({"name": "Destination", "kind": "CASH", "initialBalance": 0})
    transfer = TransferBetweenAccountsUseCase(repository, ledger, {origin.id, destination.id})
    transfer.execute({"origen": origin.id, "destino": destination.id, "total": 20, "fecha": "2026-11-01"})
    AddMovementUseCase(repository, ledger).execute(
        origin.id, {"tipo": "Ingreso", "concepto": "Venta", "total": 10, "fecha": "2026-11-02"},
    )

    DeleteMovementUseCase(repository, ledger).execute(origin.id, 1)

    assert [movement.balance for movement in repository.load(origin.id)] == [100, 110]
    assert repository.load(destination.id) == []


def test_http_delete_selected_movement_and_legacy_last_route(tmp_path, monkeypatch):
    monkeypatch.setenv("BORJA_ACCOUNTS_DB", str(tmp_path / "http.db"))
    spec = importlib.util.spec_from_file_location(
        "app_delete_movement_by_index_test", Path(__file__).resolve().parents[1] / "app" / "main.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    client = TestClient(module.app)
    account = client.post("/api/accounts", json={"name": "Cash", "kind": "CASH", "initialBalance": 100}).json()
    for body in (
        {"tipo": "Gasto", "concepto": "Cena", "total": 20, "fecha": "2026-11-01"},
        {"tipo": "Ingreso", "concepto": "Venta", "total": 10, "fecha": "2026-11-02"},
    ):
        client.post(f"/api/movimiento/{account['id']}", json=body)
    deleted = client.delete(f"/api/movimiento/{account['id']}/1")
    assert deleted.status_code == 200
    assert deleted.json()["eliminado"]["concepto"] == "Cena"
    assert [row["Saldo"] for row in client.get(f"/api/data/{account['id']}").json()] == [100, 110]
    assert client.delete(f"/api/movimiento/{account['id']}/0").status_code == 400
    assert client.delete(f"/api/movimiento/{account['id']}/20").status_code == 404
    assert client.delete(f"/api/movimiento/{account['id']}").status_code == 200
