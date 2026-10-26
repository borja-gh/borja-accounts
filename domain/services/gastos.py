"""
Agregación de gastos: alerta del mes y ranking por concepto.

La alerta sí se muestra (GastoAlert). El ranking alimenta GastosChart.
"""
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from domain.entities import Movement
from domain.services.calendar import month_key
from domain.services.concept_ranking import monthly_concept_details, rank_by_concept
from domain.services.period_filter import filter_by_field
from domain.services.expenses import expense_amount, net_expense_movements

TZ = ZoneInfo("Europe/Madrid")


def _fecha_str(m: Movement) -> str:
    return m.occurred_at.strftime("%Y-%m-%d %H:%M:%S")


def _r2(v: float) -> float:
    return round(v, 2)


def _gasto_sum_for_month(movements: list[Movement], ym: str) -> float:
    return _r2(sum(expense_amount(m) for m in movements if _fecha_str(m)[:7] == ym))


@dataclass
class GastoAlert:
    cur_total: float
    avg: float
    diff: float
    pct: float | None
    months_count: int
    is_warning: bool


def compute_gasto_alert(movements: list[Movement], reference: datetime) -> GastoAlert | None:
    reference_local = reference.astimezone(TZ)
    cur = month_key(reference_local, 0)
    cur_total = _gasto_sum_for_month(movements, cur)
    previous_months = [month_key(reference_local, off) for off in (-1, -2, -3)]
    active_months = {_fecha_str(m)[:7] for m in movements if m.type in ("Gasto", "Devolución")}
    with_data = [_gasto_sum_for_month(movements, month) for month in previous_months if month in active_months]
    if not with_data:
        return None
    avg = _r2(sum(with_data) / len(with_data))
    diff = _r2(cur_total - avg)
    pct = _r2((diff / avg) * 100) if avg > 0 else None
    return GastoAlert(cur_total=cur_total, avg=avg, diff=diff, pct=pct,
                       months_count=len(with_data), is_warning=diff > 0)


def compute_gastos_ranking(movements: list[Movement], range_type: str, year: int | str | None,
                            reference: datetime, mode: str = "media", limit: int = 20) -> dict:
    movements = net_expense_movements(movements)
    entries, hover_suffix, has_gastos = rank_by_concept(
        movements, "Gasto", range_type, year, reference, mode, limit,
        average_from_first_occurrence=True, signed_values=True,
    )
    concepts = [concept for concept, _ in entries]
    months, details = monthly_concept_details(
        movements, "Gasto", concepts, range_type, year, reference,
    ) if concepts else ([], {})
    filtered = filter_by_field(movements, _fecha_str, range_type, year, reference.astimezone(TZ))
    subgroup_totals: dict[str, dict[str | None, float]] = {concept: {} for concept in concepts}
    for movement in filtered:
        if movement.type == "Gasto" and movement.concept in subgroup_totals:
            groups = subgroup_totals[movement.concept]
            groups[movement.subconcept] = groups.get(movement.subconcept, 0.0) + movement.amount

    breakdowns = {}
    for concept, groups in subgroup_totals.items():
        if len(groups) <= 1:
            breakdowns[concept] = []
            continue
        divisor = details[concept]["mesesEvaluados"] if mode == "media" else 1
        breakdowns[concept] = [
            {"subconcepto": subconcept, "valor": _r2(total / divisor)}
            for subconcept, total in sorted(groups.items(), key=lambda item: (item[0] or "").casefold())
        ]
    return {
        "entries": [
            {"concepto": concept, "valor": value, **details[concept], "desglose": breakdowns[concept]}
            for concept, value in entries
        ],
        "meses": months,
        "hoverSuffix": hover_suffix,
        "hasGastos": has_gastos,
    }
