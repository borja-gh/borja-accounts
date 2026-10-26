from copy import deepcopy
from datetime import datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest

from domain.entities import CashBudget, Movement
from domain.services.budgets import compute_budget_status, compute_spent
from domain.services.gastos import compute_gasto_alert, compute_gastos_ranking
from domain.services.gastos_evolucion import compute_gastos_evolucion
from domain.services.kpi import compute_kpis, net_flows
from domain.services.mensual import compute_mensual

REFERENCE = datetime(2026, 10, 26, tzinfo=ZoneInfo("Europe/Madrid"))


def movement(kind, amount, month, concept="Salida", subconcept=None, recurrente=True):
    return Movement(
        account_id="cash", occurred_at=REFERENCE.replace(month=month, day=5),
        type=kind, amount=amount, concept=concept, subconcept=subconcept, recurrente=recurrente,
    )


@pytest.mark.parametrize("refund_month", [9, 10])
def test_refunds_reconcile_every_report_and_period_without_changing_movements(refund_month):
    items = [movement("Gasto", 100, 9), movement("Devolución", 60, refund_month)]
    original = deepcopy(items)
    expected = [40, 0] if refund_month == 9 else [100, -60]
    evolution = compute_gastos_evolucion(items, "custom", "2026-09:2026-10", REFERENCE)
    assert evolution["gastos"] == expected
    assert evolution["conceptos"][0]["gastos"] == expected
    assert sum(compute_mensual(items, "all", None, REFERENCE)["gastos"]) == 40
    for index, month in enumerate((9, 10)):
        period = f"2026-{month:02d}:2026-{month:02d}"
        kpi = compute_kpis(items, "custom", REFERENCE, period)
        ranking = compute_gastos_ranking(items, "custom", period, REFERENCE, "total")
        assert kpi.gastos == expected[index]
        assert kpi.balance == -expected[index]
        assert sum(entry["valor"] for entry in ranking["entries"]) == expected[index]
        assert compute_spent(items, "month", 2026, month) == expected[index]
    assert compute_kpis(items, "custom", REFERENCE, "2026-09:2026-10").gastos == 40
    assert compute_kpis(items, "año", REFERENCE).gastos == 40
    assert compute_kpis(items, "trimestre", REFERENCE).gastos == 40
    average = compute_gastos_ranking(items, "all", None, REFERENCE, "media")["entries"][0]
    assert average["valor"] == 20
    assert average["mensual"] == expected
    assert average["desviacion"] == (20 if refund_month == 9 else 80)
    assert items == original


def test_fully_refunded_concept_stays_visible_and_subconcepts_preserve_their_sign():
    items = [
        movement("Gasto", 100, 9, subconcept="Cena"),
        movement("Devolución", 60, 10, subconcept="Cena"),
        movement("Devolución", 40, 10, subconcept=None),
    ]
    entry = compute_gastos_ranking(items, "all", None, REFERENCE, "total")["entries"][0]
    assert entry["valor"] == 0
    assert entry["desglose"] == [{"subconcepto": None, "valor": -40}, {"subconcepto": "Cena", "valor": 40}]
    october = compute_gastos_ranking(items, "1m", None, REFERENCE, "total")["entries"][0]
    assert october["valor"] == -100
    assert october["mensual"] == [-100]


def test_refunds_inherit_concept_recurrence_without_changing_average_window():
    items = [
        movement("Ingreso", 1000, 1),
        movement("Gasto", 100, 9, recurrente=False),
        movement("Devolución", 60, 10, recurrente=True),
    ]
    entry = compute_gastos_ranking(items, "all", None, REFERENCE, "media")["entries"][0]
    assert entry["recurrente"] is False
    assert entry["mesesEvaluados"] == 10
    assert entry["valor"] == 4


def test_top_ranking_includes_large_refunds_by_magnitude():
    items = [movement("Gasto", 100, 9), movement("Devolución", 100, 10)]
    items += [movement("Gasto", 1, 10, concept=f"Other {index}") for index in range(25)]
    entries = compute_gastos_ranking(items, "1m", None, REFERENCE, "total")["entries"]
    assert len(entries) == 20
    assert (entries[0]["concepto"], entries[0]["valor"]) == ("Salida", -100)


def test_incoming_own_transfer_is_excluded_but_real_income_counts():
    transfer = movement("Ingreso", 500, 10)
    transfer.transfer_link_id = uuid4()
    items = [transfer, movement("Transferencia", 200, 10), movement("Ingreso", 25, 10),
             movement("Nómina", 1000, 10), movement("Devolución", 60, 10)]
    assert net_flows(items, lambda m: True) == {"ingresos": 1025, "gastos": -60, "balance": 1085}


def test_negative_spending_increases_remaining_budget():
    budget = CashBudget(id=1, account_id="cash", period_type="month", year=2026, month=10, amount=100)
    result = compute_budget_status([movement("Devolución", 60, 10)], budget, "month", 2026, 10)
    assert result["spent"] == -60
    assert result["remaining"] == 160
    assert result["percentage"] == -60
    assert result["overBudget"] is False


def test_alert_includes_zero_and_negative_months_in_historical_average():
    items = [movement("Gasto", 100, 7), movement("Gasto", 50, 8),
             movement("Devolución", 50, 8), movement("Devolución", 40, 9),
             movement("Devolución", 60, 10)]
    alert = compute_gasto_alert(items, REFERENCE)
    assert (alert.cur_total, alert.avg, alert.months_count, alert.pct) == (-60, 20, 3, -400)
    assert alert.is_warning is False


@pytest.mark.parametrize("previous_refund", [100, 120])
def test_alert_has_no_percentage_against_nonpositive_average(previous_refund):
    items = [movement("Gasto", 100, 9), movement("Devolución", previous_refund, 9), movement("Gasto", 10, 10)]
    alert = compute_gasto_alert(items, REFERENCE)
    assert alert.pct is None
    assert alert.avg == 100 - previous_refund
    assert alert.is_warning is True
