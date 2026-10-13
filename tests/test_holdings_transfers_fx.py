import os
import sys
import tempfile
from datetime import datetime, timezone

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from application.use_cases.add_movement import AddMovementUseCase
from application.use_cases.close_portfolio import ClosePortfolioUseCase
from application.use_cases.create_account import CreateAccountUseCase
from application.use_cases.create_portfolio_holding import CreatePortfolioHoldingUseCase
from application.use_cases.delete_movement import DeleteMovementUseCase
from application.use_cases.get_account_kpis import GetAccountKPIsUseCase
from application.use_cases.get_fx_rate import GetFxRateUseCase
from application.use_cases.get_investment_kpis import GetInvestmentKPIsUseCase
from application.use_cases.get_portfolio_report import GetPortfolioReportUseCase
from application.use_cases.refresh_holding_prices import RefreshHoldingPricesUseCase
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


def test_alta_holding_preserva_precision_del_precio_medio_y_comision(repository, ledger):
    account = CreateAccountUseCase(repository, ledger).execute(
        {"name": "IBKR", "kind": "INVESTMENT", "currency": "USD", "initialBalance": 1500}
    )
    result = CreatePortfolioHoldingUseCase(repository, ledger).execute(account.id, {
        "portfolio": "GOOGL-UBER", "ticker": "UBER", "shares": 8.7992,
        "price": 68.0740, "fee": 0.33, "fecha": "2026-10-02",
    })

    holding = repository.list_portfolio_holdings(account.id)[0]
    assert result["capital"] == 599.00
    assert holding.shares == 8.7992
    assert holding.price_usd == 68.0740
    assert holding.capital_usd == 599.00
    assert holding.fee_usd == 0.33


def test_alta_holding_rechaza_cuenta_cash(repository, ledger):
    account = CreateAccountUseCase(repository, ledger).execute(
        {"name": "Cash", "kind": "CASH", "currency": "EUR", "initialBalance": 1000}
    )
    with pytest.raises(InvalidAccountError):
        CreatePortfolioHoldingUseCase(repository, ledger).execute(account.id, {
            "portfolio": "X", "ticker": "AAPL", "shares": 1, "price": 10, "fecha": "2026-05-01",
        })


class _FakeFx:
    def get_quotes(self, tickers):
        return {}

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


def test_refresh_precios_convierte_divisa_nativa_a_divisa_de_cuenta(repository, ledger):
    account = CreateAccountUseCase(repository, ledger).execute(
        {"name": "IBKR", "kind": "INVESTMENT", "currency": "USD", "initialBalance": 1500}
    )
    holding_id = CreatePortfolioHoldingUseCase(repository, ledger).execute(account.id, {
        "portfolio": "ANE", "ticker": "ANE.MC", "shares": 48, "price": 24.33, "fecha": "2026-10-13",
    })["id"]

    class MarketData:
        def get_quotes(self, tickers):
            return {"ANE.MC": (21.64, "EUR")}

        def get_fx_rate(self, base, quote):
            assert (base, quote) == ("EUR", "USD")
            return 1.119445

    result = RefreshHoldingPricesUseCase(repository, MarketData()).execute(account.id)

    assert result["updated"] == 1
    assert result["failedTickers"] == []
    assert result["conversions"] == [{
        "ticker": "ANE.MC", "fromCurrency": "EUR", "toCurrency": "USD", "rate": 1.119445,
    }]
    holding = repository.list_portfolio_holdings(account.id)[0]
    assert holding.id == holding_id
    assert holding.current_price_usd == 24.22


def test_cerrar_cartera_guarda_todos_los_lotes_y_agrupa_su_historial(repository, ledger):
    account = CreateAccountUseCase(repository, ledger).execute(
        {"name": "IBKR", "kind": "INVESTMENT", "currency": "USD", "initialBalance": 5000}
    )
    create = CreatePortfolioHoldingUseCase(repository, ledger)
    first = create.execute(account.id, {
        "portfolio": "META", "ticker": "META", "shares": 0.868, "price": 661.04,
        "capital": 573.78, "fecha": "2026-07-14",
    })
    second = create.execute(account.id, {
        "portfolio": "META", "ticker": "META", "shares": 0.7117, "price": 539.03,
        "capital": 383.63, "fecha": "2026-07-30",
    })

    result = ClosePortfolioUseCase(repository, ledger).execute(account.id, {
        "portfolio": "META",
        "fecha": "2026-10-13",
        "prices": [
            {"holdingId": first["id"], "closePrice": 755.00},
            {"holdingId": second["id"], "closePrice": 755.08},
        ],
    })
    report = GetPortfolioReportUseCase(repository).execute(
        account.id, "all", None, datetime(2026, 10, 14, tzinfo=timezone.utc)
    )

    assert result == {"ok": True, "portfolio": "META", "closed": 2}
    assert [holding.close_price_usd for holding in repository.list_portfolio_holdings(account.id)] == [755.0, 755.08]
    assert report["closedCount"] == 1
    assert report["closedPositions"][0]["Concepto"] == "META"
    assert report["closedPositions"][0]["invertido"] == 957.41
    assert report["closedPositions"][0]["devuelto"] == 1192.73
    assert report["closedPositions"][0]["bal"] == 235.32


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
