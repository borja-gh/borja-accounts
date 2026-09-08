import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from application.use_cases.add_movement import AddMovementUseCase
from application.use_cases.create_account import CreateAccountUseCase
from application.use_cases.get_investment_kpis import GetInvestmentKPIsUseCase
from application.use_cases.get_saldo_evolucion import GetSaldoEvolucionUseCase
from application.use_cases.update_portfolio_holding import UpdatePortfolioHoldingUseCase
from domain.entities import PortfolioHolding
from domain.exceptions import InvalidAmountError
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


def test_apuestas_r_acepta_cero(repository, ledger):
    account = CreateAccountUseCase(repository, ledger).execute(
        {"name": "Cash", "kind": "CASH", "currency": "EUR", "initialBalance": 100}
    )
    add = AddMovementUseCase(repository, ledger)
    add.execute(account.id, {"tipo": "Apuestas", "concepto": "B365 - 1", "total": 50, "fecha": "2026-06-01"})
    saldo = add.execute(account.id, {"tipo": "Apuestas_r", "concepto": "B365 - 1", "total": 0, "fecha": "2026-06-02"})
    assert saldo == 50
    with pytest.raises(InvalidAmountError):
        add.execute(account.id, {"tipo": "Gasto", "concepto": "Nada", "total": 0, "fecha": "2026-06-03"})


def test_saldo_evolucion_investment_recalcula_igual_que_kpi(repository, ledger):
    account = CreateAccountUseCase(repository, ledger).execute(
        {"name": "Inv", "kind": "INVESTMENT", "currency": "USD", "initialBalance": 1000}
    )
    add = AddMovementUseCase(repository, ledger)
    add.execute(account.id, {"tipo": "Inversión", "concepto": "Cartera X", "total": 300, "fecha": "2026-01-10"})
    from datetime import datetime, timezone
    now = datetime(2026, 7, 15, 12, tzinfo=timezone.utc)
    kpi = GetInvestmentKPIsUseCase(repository, ledger).execute(account.id, "año", now)
    chart = GetSaldoEvolucionUseCase(repository, ledger).execute(account.id, "all", None, now)
    assert chart["actual"] == kpi.saldo
    assert chart["saldos"][-1] == kpi.saldo
    assert kpi.saldo == 1000  # Inversión no resta


def test_cerrar_holding_es_hecho_de_caja(repository, ledger):
    account = CreateAccountUseCase(repository, ledger).execute(
        {"name": "Inv", "kind": "INVESTMENT", "currency": "USD", "initialBalance": 1000}
    )
    repository.replace_portfolio_holdings(account.id, [
        PortfolioHolding(
            id=0, account_id=account.id, portfolio="P1", ticker="AAPL",
            company="Apple", shares=10, price_usd=100, capital_usd=1000,
            contributed_at="2026-05-01", source_file="test",
        ),
    ])
    holding = repository.list_portfolio_holdings(account.id)[0]
    from datetime import datetime, timezone
    now = datetime(2026, 7, 15, 12, tzinfo=timezone.utc)

    before = GetInvestmentKPIsUseCase(repository, ledger).execute(account.id, "año", now)
    assert before.en_carteras == 1000
    assert before.saldo == 1000

    UpdatePortfolioHoldingUseCase(repository, ledger).execute(
        account.id, holding.id,
        {"closePrice": 110, "fecha": "2026-06-01 12:00:00"},
    )

    after = GetInvestmentKPIsUseCase(repository, ledger).execute(account.id, "año", now)
    assert after.en_carteras == 0
    assert after.en_carteras_count == 0
    assert after.saldo == 1100  # 1000 + (1100 - 1000)
    assert after.pnl == 100
    types = {(m.type, m.concept) for m in repository.load(account.id)}
    assert ("Inversión", f"P1 · AAPL #{holding.id}") in types
    assert ("Inversión_r", f"P1 · AAPL #{holding.id}") in types

    chart = GetSaldoEvolucionUseCase(repository, ledger).execute(account.id, "all", None, now)
    assert chart["actual"] == after.saldo
