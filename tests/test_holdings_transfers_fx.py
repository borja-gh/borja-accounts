import os
import sys
import tempfile
from datetime import datetime, timezone

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from application.use_cases.add_movement import AddMovementUseCase
from application.use_cases.create_account import CreateAccountUseCase
from application.use_cases.create_portfolio_holding import CreatePortfolioHoldingUseCase
from application.use_cases.delete_movement import DeleteMovementUseCase
from application.use_cases.get_account_kpis import GetAccountKPIsUseCase
from application.use_cases.get_fx_rate import GetFxRateUseCase
from application.use_cases.get_investment_kpis import GetInvestmentKPIsUseCase
from application.use_cases.transfer_between_accounts import TransferBetweenAccountsUseCase
from domain.exceptions import FxRateUnavailableError, InsufficientCashError, InvalidAccountError
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


def test_ingreso_desde_el_trabajo_cuenta_como_ingreso(repository, ledger):
    account = CreateAccountUseCase(repository, ledger).execute(
        {"name": "Cash", "kind": "CASH", "currency": "EUR", "initialBalance": 100}
    )
    AddMovementUseCase(repository, ledger).execute(
        account.id, {"tipo": "Ingreso", "concepto": "Desde el trabajo", "total": 500, "fecha": "2026-06-01"}
    )
    now = datetime(2026, 7, 15, 12, tzinfo=timezone.utc)
    kpi = GetAccountKPIsUseCase(repository).execute(account.id, "año", now)
    assert kpi.ingresos == 500


def test_transferencia_enlaza_patas_y_borrar_una_borra_la_otra(repository, ledger):
    create = CreateAccountUseCase(repository, ledger)
    origen = create.execute({"name": "Origen", "kind": "CASH", "currency": "EUR", "initialBalance": 1000})
    destino = create.execute({"name": "Destino", "kind": "CASH", "currency": "EUR", "initialBalance": 100})
    TransferBetweenAccountsUseCase(repository, ledger, {origen.id, destino.id}).execute(
        {"origen": origen.id, "destino": destino.id, "total": 200, "fecha": "2026-12-01"}
    )
    out = repository.load(origen.id)[-1]
    inn = repository.load(destino.id)[-1]
    assert out.transfer_link_id is not None
    assert out.transfer_link_id == inn.transfer_link_id

    DeleteMovementUseCase(repository, ledger).execute(origen.id)
    assert all(m.type != "Transferencia" for m in repository.load(origen.id))
    assert all(m.transfer_link_id is None for m in repository.load(destino.id))
    assert repository.load(destino.id)[-1].balance == 100


def test_alta_holding_exige_caja_y_persiste_inversion(repository, ledger):
    account = CreateAccountUseCase(repository, ledger).execute(
        {"name": "Inv", "kind": "INVESTMENT", "currency": "USD", "initialBalance": 1000}
    )
    create = CreatePortfolioHoldingUseCase(repository, ledger)
    with pytest.raises(InsufficientCashError):
        create.execute(account.id, {
            "portfolio": "Core", "ticker": "AAPL", "shares": 20, "price": 100, "fecha": "2026-05-01",
        })

    result = create.execute(account.id, {
        "portfolio": "Core", "ticker": "AAPL", "shares": 4, "price": 100, "fecha": "2026-05-01",
    })
    assert result["capital"] == 400
    now = datetime(2026, 7, 15, 12, tzinfo=timezone.utc)
    kpi = GetInvestmentKPIsUseCase(repository, ledger).execute(account.id, "año", now)
    assert kpi.saldo == 1000
    assert kpi.en_carteras == 400
    assert kpi.caja == 600
    types = {(m.type, m.concept) for m in repository.load(account.id)}
    assert ("Inversión", f"Core · AAPL #{result['id']}") in types


def test_alta_holding_rechaza_cuenta_cash(repository, ledger):
    account = CreateAccountUseCase(repository, ledger).execute(
        {"name": "Cash", "kind": "CASH", "currency": "EUR", "initialBalance": 1000}
    )
    with pytest.raises(InvalidAccountError):
        CreatePortfolioHoldingUseCase(repository, ledger).execute(account.id, {
            "portfolio": "X", "ticker": "AAPL", "shares": 1, "price": 10, "fecha": "2026-05-01",
        })


class _FakeFx:
    def get_prices(self, tickers):
        return {}

    def get_fx_rate(self, base, quote):
        if (base, quote) == ("EUR", "USD"):
            return 1.0875
        return None


def test_consulta_fx_yfinance_via_puerto(repository):
    use_case = GetFxRateUseCase(_FakeFx())
    assert use_case.execute("eur", "usd")["rate"] == 1.0875
    with pytest.raises(FxRateUnavailableError):
        use_case.execute("USD", "EUR")


def test_http_create_account_sigue_disponible(tmp_path, monkeypatch):
    db_path = tmp_path / "http.db"
    monkeypatch.setenv("BORJA_ACCOUNTS_DB", str(db_path))
    import importlib.util
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    spec = importlib.util.spec_from_file_location("app_http_test", os.path.join(repo_root, "app", "main.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    from fastapi.testclient import TestClient
    client = TestClient(mod.app)
    resp = client.post("/api/accounts", json={
        "name": "Caja HTTP", "kind": "CASH", "currency": "EUR", "initialBalance": 50,
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["id"] == "caja-http"
