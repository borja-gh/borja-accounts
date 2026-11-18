import os
import sys
import tempfile
from datetime import datetime, timezone

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from application.use_cases.add_movement import AddMovementUseCase
from application.use_cases.create_account import CreateAccountUseCase
from application.use_cases.create_portfolio_holding import CreatePortfolioHoldingUseCase
from application.use_cases.get_consolidated_kpis import GetConsolidatedKPIsUseCase
from application.use_cases.update_portfolio_holding import UpdatePortfolioHoldingUseCase
from domain.exceptions import FxRateUnavailableError
from domain.services.ledger import LedgerService
from infrastructure.persistence.sqlite.repository import SQLiteMovementRepository

NOW = datetime(2026, 7, 15, 12, tzinfo=timezone.utc)


class FakeMarket:
    def __init__(self, rates):
        self.rates = rates
        self.calls = []

    def get_fx_rate(self, base, quote):
        self.calls.append((base, quote))
        return self.rates.get((base, quote))


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


def _cuentas(repository, ledger):
    cash = CreateAccountUseCase(repository, ledger).execute(
        {"name": "Cash", "kind": "CASH", "currency": "EUR", "initialBalance": 500}
    )
    inv = CreateAccountUseCase(repository, ledger).execute(
        {"name": "Inv", "kind": "INVESTMENT", "currency": "USD", "initialBalance": 2000}
    )
    add = AddMovementUseCase(repository, ledger)
    add.execute(cash.id, {"tipo": "Nómina", "concepto": "Nómina julio", "total": 1000, "fecha": "2026-07-01"})
    add.execute(cash.id, {"tipo": "Gasto", "concepto": "Super", "total": 200, "fecha": "2026-07-05"})
    add.execute(cash.id, {"tipo": "Devolución", "concepto": "Super", "total": 50, "fecha": "2026-07-06"})
    add.execute(cash.id, {"tipo": "Gasto", "concepto": "Junio", "total": 99, "fecha": "2026-06-20"})
    add.execute(inv.id, {"tipo": "Gasto", "concepto": "Comisiones", "total": 500, "fecha": "2026-07-03"})

    holding = CreatePortfolioHoldingUseCase(repository, ledger).execute(inv.id, {
        "portfolio": "Core", "ticker": "AAPL", "shares": 10, "price": 100, "fecha": "2026-07-02",
    })
    UpdatePortfolioHoldingUseCase(repository, ledger).execute(
        inv.id, holding["id"], {"closePrice": 120, "fecha": "2026-07-10 12:00:00"}
    )
    return cash, inv


def test_consolidado_suma_nomina_pnl_convertido_y_gastos_netos(repository, ledger):
    _cuentas(repository, ledger)
    market = FakeMarket({("USD", "EUR"): 0.9})

    kpi = GetConsolidatedKPIsUseCase(repository, market).execute("EUR", "mes", NOW)

    assert kpi.ingresos_cash == 1000
    assert kpi.ingresos_pnl == 180.0
    assert kpi.ingresos == 1180.0
    assert kpi.gastos == 150.0
    assert kpi.balance == 1030.0
    assert market.calls == [("USD", "EUR")]


def test_transferencia_entrante_no_cuenta_como_ingreso(repository, ledger):
    cash, inv = _cuentas(repository, ledger)
    from application.use_cases.transfer_between_accounts import TransferBetweenAccountsUseCase
    TransferBetweenAccountsUseCase(repository, ledger, {cash.id, inv.id}).execute(
        {"origen": cash.id, "destino": inv.id, "total": 300, "fecha": "2026-07-08", "exchangeRate": 1.1}
    )

    kpi = GetConsolidatedKPIsUseCase(repository, FakeMarket({("USD", "EUR"): 0.9})).execute("EUR", "mes", NOW)

    assert kpi.ingresos_cash == 1000
    assert kpi.gastos == 150


def test_divisa_de_destino_sin_tipo_de_cambio_falla(repository, ledger):
    _cuentas(repository, ledger)

    with pytest.raises(FxRateUnavailableError):
        GetConsolidatedKPIsUseCase(repository, FakeMarket({})).execute("EUR", "mes", NOW)


def test_consolidado_en_la_misma_divisa_no_consulta_tipo_de_cambio(repository, ledger):
    _cuentas(repository, ledger)
    market = FakeMarket({("EUR", "USD"): 1.1})

    kpi = GetConsolidatedKPIsUseCase(repository, market).execute("USD", "mes", NOW)

    assert market.calls == [("EUR", "USD")]
    assert kpi.currency == "USD"
    assert kpi.ingresos_cash == 1100.0
    assert kpi.ingresos_pnl == 200.0
    assert kpi.gastos == 165.0


def test_trimestre_es_natural_y_compara_con_el_anterior(repository, ledger):
    cash, _ = _cuentas(repository, ledger)
    AddMovementUseCase(repository, ledger).execute(
        cash.id, {"tipo": "Nómina", "concepto": "Nómina septiembre", "total": 500, "fecha": "2026-09-30"}
    )
    noviembre = datetime(2026, 11, 18, 12, tzinfo=timezone.utc)
    market = FakeMarket({("USD", "EUR"): 0.9})

    kpi = GetConsolidatedKPIsUseCase(repository, market).execute("EUR", "trimestre", noviembre)

    assert kpi.ingresos_cash == 0
    assert kpi.ingresos_delta == -1680.0
    assert kpi.gastos_delta == -150.0
