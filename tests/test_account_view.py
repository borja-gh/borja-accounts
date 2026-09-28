import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from application.use_cases.create_account import CreateAccountUseCase
from application.use_cases.update_account_view import UpdateAccountViewUseCase
from domain.exceptions import InvalidAccountError
from domain.services.ledger import LedgerService
from infrastructure.persistence.sqlite.repository import SQLiteMovementRepository


@pytest.fixture
def repository():
    fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.remove(db_path)
    yield SQLiteMovementRepository(db_path)
    os.remove(db_path)


def test_account_view_preferences_persist_by_account(repository):
    create = CreateAccountUseCase(repository, LedgerService())
    cash = create.execute({"name": "Cash", "kind": "CASH"})
    investment = create.execute({"name": "Investment", "kind": "INVESTMENT"})

    UpdateAccountViewUseCase(repository).execute(
        cash.id, {"visiblePanels": ["overview", "expenses"]}
    )

    assert repository.get_account(cash.id).visible_panels == ["overview", "expenses"]
    assert repository.get_account(investment.id).visible_panels is None
    assert repository.list_accounts()[0].visible_panels == ["overview", "expenses"]


def test_movement_entry_and_total_panels_are_independently_configurable(repository):
    account = CreateAccountUseCase(repository, LedgerService()).execute(
        {"name": "Cash", "kind": "CASH"}
    )

    updated = UpdateAccountViewUseCase(repository).execute(
        account.id, {"visiblePanels": ["add_movement"]}
    )

    assert updated.visible_panels == ["add_movement"]
    assert repository.get_account(account.id).visible_panels == ["add_movement"]


def test_assistant_panel_visibility_is_saved_per_account(repository):
    account = CreateAccountUseCase(repository, LedgerService()).execute(
        {"name": "Cash", "kind": "CASH"}
    )

    updated = UpdateAccountViewUseCase(repository).execute(
        account.id, {"visiblePanels": ["assistant"]}
    )

    assert updated.visible_panels == ["assistant"]
    assert repository.get_account(account.id).visible_panels == ["assistant"]


def test_legacy_account_without_view_column_keeps_default_panels(repository):
    account = CreateAccountUseCase(repository, LedgerService()).execute(
        {"name": "Legacy", "kind": "CASH"}
    )
    with repository._connect() as conn:
        conn.execute("ALTER TABLE accounts DROP COLUMN visible_panels")

    reopened = SQLiteMovementRepository(repository.db_path)
    assert reopened.get_account(account.id).visible_panels is None


@pytest.mark.parametrize("visible_panels", [
    "overview",
    ["overview", "overview"],
    ["holdings"],
    [1],
])
def test_account_view_rejects_invalid_or_wrong_kind_panels(repository, visible_panels):
    account = CreateAccountUseCase(repository, LedgerService()).execute(
        {"name": "Cash", "kind": "CASH"}
    )

    with pytest.raises(InvalidAccountError):
        UpdateAccountViewUseCase(repository).execute(
            account.id, {"visiblePanels": visible_panels}
        )


def test_http_account_view_round_trip_and_validation(tmp_path, monkeypatch):
    monkeypatch.setenv("BORJA_ACCOUNTS_DB", str(tmp_path / "http.db"))
    import importlib.util

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    spec = importlib.util.spec_from_file_location(
        "app_http_account_view_test", os.path.join(repo_root, "app", "main.py")
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    from fastapi.testclient import TestClient

    client = TestClient(mod.app)
    account = client.post("/api/accounts", json={"name": "Cash HTTP", "kind": "CASH"}).json()
    account_id = account["id"]

    saved = client.put(
        f"/api/accounts/{account_id}/view", json={"visiblePanels": ["overview", "expenses"]}
    )

    assert saved.status_code == 200
    assert saved.json()["visiblePanels"] == ["overview", "expenses"]
    assert client.get("/api/accounts").json()[0]["visiblePanels"] == ["overview", "expenses"]
    invalid = client.put(
        f"/api/accounts/{account_id}/view", json={"visiblePanels": ["holdings"]}
    )
    assert invalid.status_code == 400
