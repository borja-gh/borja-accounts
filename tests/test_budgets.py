import os
import sys
import tempfile
from datetime import datetime, timezone

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from application.use_cases.add_movement import AddMovementUseCase
from application.use_cases.cash_budgets import (
    DeleteCashBudgetUseCase,
    GetCashBudgetStatusUseCase,
    GetCashBudgetsUseCase,
    UpsertCashBudgetUseCase,
)
from application.use_cases.create_account import CreateAccountUseCase
from domain.exceptions import CashBudgetNotFoundError, InvalidBudgetError
from domain.services.ledger import LedgerService
from infrastructure.persistence.sqlite.repository import SQLiteMovementRepository


@pytest.fixture
def repository():
    fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.remove(db_path)
    yield SQLiteMovementRepository(db_path)
    os.remove(db_path)


@pytest.fixture
def ledger():
    return LedgerService()


def test_presupuesto_cash_se_guarda_se_actualiza_y_calcula_gasto_neto(repository, ledger):
    account = CreateAccountUseCase(repository, ledger).execute(
        {"name": "Cash", "kind": "CASH", "currency": "EUR", "initialBalance": 3000}
    )
    add = AddMovementUseCase(repository, ledger)
    add.execute(account.id, {"tipo": "Gasto", "concepto": "Super", "total": 200, "fecha": "2026-09-05"})
    add.execute(account.id, {"tipo": "Devolución", "concepto": "Super", "total": 50, "fecha": "2026-09-08"})
    add.execute(account.id, {"tipo": "Transferencia", "concepto": "A otra", "total": 500, "fecha": "2026-09-10"})

    save = UpsertCashBudgetUseCase(repository)
    saved = save.execute(account.id, {"periodType": "month", "year": 2026, "month": 9, "amount": 1000})
    assert saved["amount"] == 1000
    assert GetCashBudgetsUseCase(repository).execute(account.id)["budgets"] == [saved]

    status = GetCashBudgetStatusUseCase(repository).execute(
        account.id, "month", 2026, 9, datetime(2026, 9, 21, tzinfo=timezone.utc)
    )
    assert status["spent"] == 150
    assert status["remaining"] == 850
    assert status["percentage"] == 15
    assert status["overBudget"] is False

    updated = save.execute(account.id, {"periodType": "month", "year": 2026, "month": 9, "amount": 100})
    assert updated["id"] == saved["id"]
    assert GetCashBudgetStatusUseCase(repository).execute(
        account.id, "month", 2026, 9, datetime(2026, 9, 21, tzinfo=timezone.utc)
    )["overBudget"] is True


def test_presupuesto_anual_y_borrado_no_afectan_movimientos(repository, ledger):
    account = CreateAccountUseCase(repository, ledger).execute(
        {"name": "Cash", "kind": "CASH", "currency": "EUR", "initialBalance": 1000}
    )
    add = AddMovementUseCase(repository, ledger)
    add.execute(account.id, {"tipo": "Gasto", "concepto": "Compra", "total": 80, "fecha": "2026-01-03"})
    budget = UpsertCashBudgetUseCase(repository).execute(
        account.id, {"periodType": "year", "year": 2026, "month": 0, "amount": 500}
    )
    status = GetCashBudgetStatusUseCase(repository).execute(
        account.id, "year", 2026, None, datetime(2026, 9, 21, tzinfo=timezone.utc)
    )
    assert status["spent"] == 80
    assert status["month"] == 0

    DeleteCashBudgetUseCase(repository).execute(account.id, budget["id"])
    assert GetCashBudgetsUseCase(repository).execute(account.id)["budgets"] == []
    assert len(repository.load(account.id)) == 2
    with pytest.raises(CashBudgetNotFoundError):
        DeleteCashBudgetUseCase(repository).execute(account.id, budget["id"])


def test_presupuestos_solo_cash_y_periodo_valido(repository, ledger):
    investment = CreateAccountUseCase(repository, ledger).execute({"name": "Inv", "kind": "INVESTMENT"})
    with pytest.raises(InvalidBudgetError):
        UpsertCashBudgetUseCase(repository).execute(
            investment.id, {"periodType": "month", "year": 2026, "month": 9, "amount": 100}
        )

    cash = CreateAccountUseCase(repository, ledger).execute({"name": "Cash", "kind": "CASH"})
    with pytest.raises(InvalidBudgetError):
        UpsertCashBudgetUseCase(repository).execute(
            cash.id, {"periodType": "year", "year": 2026, "month": 9, "amount": 100}
        )
    with pytest.raises(InvalidBudgetError):
        UpsertCashBudgetUseCase(repository).execute(
            cash.id, {"periodType": "month", "year": 2026, "month": 9, "amount": -1}
        )


def test_http_budget_routes(tmp_path, monkeypatch):
    db_path = tmp_path / "http.db"
    monkeypatch.setenv("BORJA_ACCOUNTS_DB", str(db_path))
    import importlib.util

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    spec = importlib.util.spec_from_file_location("app_http_budget_test", os.path.join(repo_root, "app", "main.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    from fastapi.testclient import TestClient

    client = TestClient(mod.app)
    account = client.post("/api/accounts", json={"name": "Budget HTTP", "kind": "CASH", "currency": "EUR"}).json()
    account_id = account["id"]
    saved = client.put(
        f"/api/accounts/{account_id}/budget",
        json={"periodType": "month", "year": 2026, "month": 9, "amount": 750},
    )
    assert saved.status_code == 200
    budget_id = saved.json()["budget"]["id"]
    assert client.get(f"/api/accounts/{account_id}/budget").json()["budgets"][0]["amount"] == 750
    assert client.get(f"/api/accounts/{account_id}/budget-status?period=month&year=2026&month=9").status_code == 200
    assert client.delete(f"/api/accounts/{account_id}/budget/{budget_id}").json() == {"ok": True}
