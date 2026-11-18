import os
import sys
import tempfile
from datetime import datetime, timezone

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from application.use_cases.add_movement import AddMovementUseCase
from application.use_cases.create_account import CreateAccountUseCase
from application.use_cases.close_portfolio import ClosePortfolioUseCase
from application.use_cases.create_portfolio_holding import CreatePortfolioHoldingUseCase
from application.use_cases.edit_portfolio_holding import EditPortfolioHoldingUseCase
from application.use_cases.get_investment_kpis import GetInvestmentKPIsUseCase
from application.use_cases.get_portfolio_report import GetPortfolioReportUseCase
from application.use_cases.rename_portfolio import RenamePortfolioUseCase
from application.use_cases.update_portfolio_holding import UpdatePortfolioHoldingUseCase
from domain.entities import PortfolioHolding
from domain.exceptions import InsufficientCashError, InvalidAmountError, PortfolioHoldingNotFoundError
from domain.services.holding_amounts import resolve_edited_amounts, resolve_new_amounts
from domain.services.ledger import LedgerService
from domain.services.portfolio_holdings import compute_open_investment_summary
from infrastructure.persistence.sqlite.repository import SQLiteMovementRepository

NOW = datetime(2026, 7, 15, 12, tzinfo=timezone.utc)


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


def _account(repository, ledger, initial=1000):
    return CreateAccountUseCase(repository, ledger).execute(
        {"name": "Inv", "kind": "INVESTMENT", "currency": "USD", "initialBalance": initial}
    ).id


def _lot(repository, ledger, account_id, **data):
    payload = {"portfolio": "Core", "ticker": "AAPL", "shares": 4, "price": 100, "fecha": "2026-05-01"}
    payload.update(data)
    return CreatePortfolioHoldingUseCase(repository, ledger).execute(account_id, payload)["id"]


def _edit(repository, ledger, account_id, holding_id, data):
    return EditPortfolioHoldingUseCase(repository, ledger).execute(account_id, holding_id, data)


def _holding(repository, account_id, holding_id):
    return next(h for h in repository.list_portfolio_holdings(account_id) if h.id == holding_id)


def _kpis(repository, ledger, account_id):
    return GetInvestmentKPIsUseCase(repository, ledger).execute(account_id, "año", NOW)


def test_resolve_new_amounts_deriva_el_tercer_dato():
    assert resolve_new_amounts(4, 100, None) == (4, 100, 400)
    assert resolve_new_amounts(4, None, 400) == (4, 100, 400)
    assert resolve_new_amounts(None, 100, 400) == (4, 100, 400)


def test_resolve_new_amounts_exige_dos_datos():
    with pytest.raises(InvalidAmountError):
        resolve_new_amounts(4, None, None)


def test_resolve_new_amounts_rechaza_tres_datos_incoherentes():
    with pytest.raises(InvalidAmountError):
        resolve_new_amounts(4, 100, 500)


def test_tolerancia_acepta_precio_medio_redondeado_del_broker():
    shares, price, capital = resolve_new_amounts(8.7992, 68.07, 599.00)
    assert (shares, price, capital) == (8.7992, 68.07, 599.00)


def test_editar_titulos_recalcula_precio_medio_y_mantiene_invertido(repository, ledger):
    account_id = _account(repository, ledger)
    holding_id = _lot(repository, ledger, account_id)

    _edit(repository, ledger, account_id, holding_id, {"shares": 5})

    holding = _holding(repository, account_id, holding_id)
    assert (holding.shares, holding.price_usd, holding.capital_usd) == (5, 80, 400)
    kpi = _kpis(repository, ledger, account_id)
    assert kpi.en_carteras == 400
    assert kpi.caja == 600


def test_editar_invertido_recalcula_precio_medio(repository, ledger):
    account_id = _account(repository, ledger)
    holding_id = _lot(repository, ledger, account_id)

    _edit(repository, ledger, account_id, holding_id, {"capital": 300})

    holding = _holding(repository, account_id, holding_id)
    assert (holding.shares, holding.price_usd, holding.capital_usd) == (4, 75, 300)
    kpi = _kpis(repository, ledger, account_id)
    assert kpi.en_carteras == 300
    assert kpi.saldo == 1000
    assert kpi.caja == 700
    inversion = next(m for m in repository.load(account_id) if m.type == "Inversión")
    assert inversion.amount == 300


def test_editar_precio_recalcula_invertido(repository, ledger):
    account_id = _account(repository, ledger)
    holding_id = _lot(repository, ledger, account_id)

    _edit(repository, ledger, account_id, holding_id, {"price": 110})

    holding = _holding(repository, account_id, holding_id)
    assert (holding.shares, holding.price_usd, holding.capital_usd) == (4, 110, 440)
    assert _kpis(repository, ledger, account_id).en_carteras == 440


def test_editar_dos_campos_deriva_el_tercero(repository, ledger):
    account_id = _account(repository, ledger)
    holding_id = _lot(repository, ledger, account_id)

    _edit(repository, ledger, account_id, holding_id, {"shares": 5, "price": 90})

    holding = _holding(repository, account_id, holding_id)
    assert (holding.shares, holding.price_usd, holding.capital_usd) == (5, 90, 450)


def test_editar_invertido_y_precio_deriva_titulos(repository, ledger):
    account_id = _account(repository, ledger)
    holding_id = _lot(repository, ledger, account_id)

    _edit(repository, ledger, account_id, holding_id, {"capital": 500, "price": 125})

    holding = _holding(repository, account_id, holding_id)
    assert (holding.shares, holding.price_usd, holding.capital_usd) == (4, 125, 500)


def test_editar_tres_campos_incoherentes_se_rechaza(repository, ledger):
    account_id = _account(repository, ledger)
    holding_id = _lot(repository, ledger, account_id)

    with pytest.raises(InvalidAmountError):
        _edit(repository, ledger, account_id, holding_id, {"shares": 5, "price": 90, "capital": 300})
    assert _holding(repository, account_id, holding_id).shares == 4


def test_resolve_edited_amounts_sin_cambios_devuelve_lo_guardado():
    stored = (8.7992, 68.074, 599.0)
    assert resolve_edited_amounts(stored, (None, None, None)) == stored
    assert resolve_edited_amounts(stored, (8.7992, 68.074, 599.0)) == stored


def test_ampliar_invertido_exige_caja(repository, ledger):
    account_id = _account(repository, ledger)
    holding_id = _lot(repository, ledger, account_id)

    _edit(repository, ledger, account_id, holding_id, {"capital": 700})
    assert _kpis(repository, ledger, account_id).caja == 300

    with pytest.raises(InsufficientCashError):
        _edit(repository, ledger, account_id, holding_id, {"capital": 1500})
    assert _holding(repository, account_id, holding_id).capital_usd == 700


def test_lote_cerrado_no_admite_cambiar_titulos_ni_invertido(repository, ledger):
    account_id = _account(repository, ledger)
    holding_id = _lot(repository, ledger, account_id)
    UpdatePortfolioHoldingUseCase(repository, ledger).execute(
        account_id, holding_id, {"closePrice": 120, "fecha": "2026-06-01 12:00:00"}
    )

    with pytest.raises(InvalidAmountError):
        _edit(repository, ledger, account_id, holding_id, {"shares": 5})
    with pytest.raises(InvalidAmountError):
        _edit(repository, ledger, account_id, holding_id, {"capital": 300})

    _edit(repository, ledger, account_id, holding_id, {"company": "Apple Inc.", "fee": 1.5})
    holding = _holding(repository, account_id, holding_id)
    assert holding.company == "Apple Inc."
    assert holding.fee_usd == 1.5


def test_cambiar_ticker_reescribe_concepto_sin_duplicar_capital(repository, ledger):
    account_id = _account(repository, ledger)
    holding_id = _lot(repository, ledger, account_id)
    repository.update_holdings_current_prices({holding_id: 150.0})
    before = _kpis(repository, ledger, account_id)

    _edit(repository, ledger, account_id, holding_id, {"ticker": "msft"})

    holding = _holding(repository, account_id, holding_id)
    assert holding.ticker == "MSFT"
    assert holding.current_price_usd is None
    concepts = {(m.type, m.concept) for m in repository.load(account_id)}
    assert ("Inversión", f"Core · MSFT #{holding_id}") in concepts
    after = _kpis(repository, ledger, account_id)
    assert (after.en_carteras, after.saldo, after.caja) == (before.en_carteras, before.saldo, before.caja)


def test_cambiar_fecha_mueve_la_inversion_persistida(repository, ledger):
    account_id = _account(repository, ledger)
    holding_id = _lot(repository, ledger, account_id)

    _edit(repository, ledger, account_id, holding_id, {"contributedAt": "2026-03-10"})

    holding = _holding(repository, account_id, holding_id)
    assert holding.contributed_at == "2026-03-10 00:00:00"
    inversion = next(m for m in repository.load(account_id) if m.type == "Inversión")
    assert inversion.occurred_at.strftime("%Y-%m-%d") == "2026-03-10"


def test_editar_lote_inexistente_falla(repository, ledger):
    account_id = _account(repository, ledger)
    with pytest.raises(PortfolioHoldingNotFoundError):
        _edit(repository, ledger, account_id, 999, {"ticker": "MSFT"})


def test_renombrar_cartera_reescribe_lotes_abiertos_y_cerrados(repository, ledger):
    account_id = _account(repository, ledger)
    open_id = _lot(repository, ledger, account_id)
    closed_id = _lot(repository, ledger, account_id, ticker="MSFT", shares=2, price=100, fecha="2026-05-02")
    UpdatePortfolioHoldingUseCase(repository, ledger).execute(
        account_id, closed_id, {"closePrice": 120, "fecha": "2026-06-01 12:00:00"}
    )
    before = _kpis(repository, ledger, account_id)

    result = RenamePortfolioUseCase(repository, ledger).execute(
        account_id, {"portfolio": "Core", "newName": "Growth"}
    )

    assert result == {"ok": True, "portfolio": "Growth", "holdings": 2}
    assert {h.portfolio for h in repository.list_portfolio_holdings(account_id)} == {"Growth"}
    concepts = {m.concept for m in repository.load(account_id) if m.type in ("Inversión", "Inversión_r")}
    assert concepts == {f"Growth · AAPL #{open_id}", f"Growth · MSFT #{closed_id}"}
    after = _kpis(repository, ledger, account_id)
    assert (after.en_carteras, after.saldo, after.caja) == (before.en_carteras, before.saldo, before.caja)
    summary = compute_open_investment_summary(repository.load(account_id), repository.list_portfolio_holdings(account_id))
    assert [p.portfolio for p in summary.holdings_portfolios] == ["Growth"]
    assert summary.legacy_open == []


def test_renombrar_cartera_csv_sin_inversion_persistida(repository, ledger):
    account_id = _account(repository, ledger, initial=1000)
    repository.replace_portfolio_holdings(account_id, [
        PortfolioHolding(
            id=0, account_id=account_id, portfolio="Cartera Prueba", ticker="AAPL", company="Apple",
            shares=10, price_usd=100, capital_usd=1000, contributed_at="2026-05-01", source_file="test",
        ),
    ])
    before = _kpis(repository, ledger, account_id)

    RenamePortfolioUseCase(repository, ledger).execute(
        account_id, {"portfolio": "Cartera Prueba", "newName": "Nueva"}
    )

    after = _kpis(repository, ledger, account_id)
    assert (after.en_carteras, after.saldo, after.caja) == (before.en_carteras, before.saldo, before.caja)
    summary = compute_open_investment_summary(repository.load(account_id), repository.list_portfolio_holdings(account_id))
    assert [p.portfolio for p in summary.holdings_portfolios] == ["Nueva"]
    assert summary.legacy_open == []


def test_renombrar_rechaza_nombre_ocupado_y_cartera_inexistente(repository, ledger):
    account_id = _account(repository, ledger)
    _lot(repository, ledger, account_id, portfolio="Core")
    _lot(repository, ledger, account_id, portfolio="Otra", ticker="MSFT")
    rename = RenamePortfolioUseCase(repository, ledger)

    with pytest.raises(InvalidAmountError):
        rename.execute(account_id, {"portfolio": "Core", "newName": "Otra"})
    with pytest.raises(PortfolioHoldingNotFoundError):
        rename.execute(account_id, {"portfolio": "Nada", "newName": "Algo"})
    with pytest.raises(InvalidAmountError):
        rename.execute(account_id, {"portfolio": "Core", "newName": "   "})



def test_http_edita_lote_y_renombra_cartera(tmp_path, monkeypatch):
    monkeypatch.setenv("BORJA_ACCOUNTS_DB", str(tmp_path / "http-edit.db"))
    import importlib.util
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    spec = importlib.util.spec_from_file_location("app_http_edit_test", os.path.join(repo_root, "app", "main.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    from fastapi.testclient import TestClient
    client = TestClient(mod.app)
    account = client.post("/api/accounts", json={
        "name": "IBKR HTTP edit", "kind": "INVESTMENT", "currency": "USD", "initialBalance": 1000,
    }).json()
    base = f"/api/accounts/{account['id']}/portfolio-holdings"
    lot = client.post(base, json={
        "portfolio": "Core", "ticker": "AAPL", "shares": 4, "price": 100, "fecha": "2026-05-01",
    }).json()

    patched = client.patch(f"{base}/{lot['id']}", json={"shares": 5})
    assert patched.status_code == 200
    assert patched.json()["ok"] is True

    rejected = client.patch(f"{base}/{lot['id']}", json={"shares": 6, "price": 90, "capital": 300})
    assert rejected.status_code == 400
    assert "no cuadra" in rejected.json()["error"]

    renamed = client.post(f"{base}/rename-portfolio", json={"portfolio": "Core", "newName": "Growth"})
    assert renamed.status_code == 200
    assert renamed.json()["portfolio"] == "Growth"

    report = client.get(f"/api/accounts/{account['id']}/carteras").json()
    assert [p["concepto"] for p in report["openPositions"]] == ["Growth"]
    assert report["openPositions"][0]["holdings"][0]["avgPrice"] == 80
    assert client.patch(f"/api/accounts/nope/portfolio-holdings/{lot['id']}", json={}).status_code == 404


def test_renombrar_tambien_renombra_el_historico_legado_del_mismo_nombre(repository, ledger):
    account_id = _account(repository, ledger)
    AddMovementUseCase(repository, ledger).execute(
        account_id, {"tipo": "Inversión", "concepto": "Core", "total": 50, "fecha": "2026-04-01"}
    )
    _lot(repository, ledger, account_id, portfolio="Core")
    before = _kpis(repository, ledger, account_id)

    RenamePortfolioUseCase(repository, ledger).execute(account_id, {"portfolio": "Core", "newName": "Growth"})

    after = _kpis(repository, ledger, account_id)
    assert (after.en_carteras, after.saldo, after.caja) == (before.en_carteras, before.saldo, before.caja)
    summary = compute_open_investment_summary(repository.load(account_id), repository.list_portfolio_holdings(account_id))
    assert summary.legacy_open == []
    concepts = {m.concept for m in repository.load(account_id) if m.type == "Inversión"}
    assert "Growth" in concepts
    assert not any(c.startswith("Core") for c in concepts)


def test_renombrar_historico_legado_cerrado_conserva_sus_cifras(repository, ledger):
    account_id = _account(repository, ledger)
    AddMovementUseCase(repository, ledger).execute(
        account_id, {"tipo": "Inversión", "concepto": "Cartera 1", "total": 50, "fecha": "2026-04-01"}
    )
    AddMovementUseCase(repository, ledger).execute(
        account_id, {"tipo": "Inversión_r", "concepto": "Cartera 1", "total": 70, "fecha": "2026-05-01"}
    )
    before = GetPortfolioReportUseCase(repository).execute(account_id, "all", None, NOW)

    RenamePortfolioUseCase(repository, ledger).execute(account_id, {"portfolio": "Cartera 1", "newName": "Archivo"})

    after = GetPortfolioReportUseCase(repository).execute(account_id, "all", None, NOW)
    assert [c["Concepto"] for c in before["closedPositions"]] == ["Cartera 1"]
    assert [c["Concepto"] for c in after["closedPositions"]] == ["Archivo"]
    assert _closed_numbers(after) == _closed_numbers(before)


def test_renombrar_rechaza_separador_del_concepto(repository, ledger):
    account_id = _account(repository, ledger)
    _lot(repository, ledger, account_id, portfolio="Core")

    with pytest.raises(InvalidAmountError):
        RenamePortfolioUseCase(repository, ledger).execute(account_id, {"portfolio": "Core", "newName": "A · B"})


def _closed_numbers(report):
    return [(c["invertido"], c["devuelto"], c["bal"], c["roi"], c["balH"], c["roiH"]) for c in report["closedPositions"]]


def test_renombrar_cartera_cerrada_conserva_su_historial_agrupado(repository, ledger):
    account_id = _account(repository, ledger)
    aapl = _lot(repository, ledger, account_id)
    msft = _lot(repository, ledger, account_id, ticker="MSFT", shares=2, price=100, fecha="2026-05-02")
    ClosePortfolioUseCase(repository, ledger).execute(account_id, {
        "portfolio": "Core", "fecha": "2026-06-01 12:00:00",
        "prices": [{"holdingId": aapl, "closePrice": 120}, {"holdingId": msft, "closePrice": 90}],
    })
    before = GetPortfolioReportUseCase(repository).execute(account_id, "all", None, NOW)

    RenamePortfolioUseCase(repository, ledger).execute(account_id, {"portfolio": "Core", "newName": "Growth"})
    after = GetPortfolioReportUseCase(repository).execute(account_id, "all", None, NOW)

    assert [c["Concepto"] for c in before["closedPositions"]] == ["Core"]
    assert [c["Concepto"] for c in after["closedPositions"]] == ["Growth"]
    assert _closed_numbers(after) == _closed_numbers(before)


def test_renombrar_cartera_parcialmente_cerrada_conserva_el_historial_por_ticker(repository, ledger):
    account_id = _account(repository, ledger)
    _lot(repository, ledger, account_id)
    _lot(repository, ledger, account_id, ticker="MSFT", shares=2, price=100, fecha="2026-05-02")
    ClosePortfolioUseCase(repository, ledger).execute_position(account_id, {
        "portfolio": "Core", "ticker": "AAPL", "closePrice": 120, "fecha": "2026-06-01 12:00:00",
    })
    before = GetPortfolioReportUseCase(repository).execute(account_id, "all", None, NOW)

    RenamePortfolioUseCase(repository, ledger).execute(account_id, {"portfolio": "Core", "newName": "Growth"})
    after = GetPortfolioReportUseCase(repository).execute(account_id, "all", None, NOW)

    assert before["closedPositions"]
    assert _closed_numbers(after) == _closed_numbers(before)
    assert all("Growth" in c["Concepto"] and "Core" not in c["Concepto"] for c in after["closedPositions"])


def test_lotes_cerrados_con_cobro_y_pnl(repository, ledger):
    from application.use_cases.list_closed_portfolio_holdings import ListClosedPortfolioHoldingsUseCase

    account_id = _account(repository, ledger)
    open_id = _lot(repository, ledger, account_id)
    sold_id = _lot(repository, ledger, account_id, ticker="MSFT", shares=2, price=100, fecha="2026-05-02")
    UpdatePortfolioHoldingUseCase(repository, ledger).execute(
        account_id, sold_id, {"closePrice": 90, "fecha": "2026-06-01 12:00:00"}
    )

    rows = ListClosedPortfolioHoldingsUseCase(repository).execute(account_id)

    assert [r["id"] for r in rows] == [sold_id]
    assert (rows[0]["ticker"], rows[0]["proceeds"], rows[0]["pnl"], rows[0]["pnlPct"]) == ("MSFT", 180.0, -20.0, -10.0)
    assert open_id not in {r["id"] for r in rows}
