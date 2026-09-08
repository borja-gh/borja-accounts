"""
Agregación de gastos: alerta del mes, ranking por concepto, top-N del mes.

`compute_top_merchants` sigue alimentando GET /gastos-mes-actual
(`topMerchants`); la UI ya no pinta esos chips. La alerta sí se muestra
(GastoAlert). El ranking alimenta GastosChart.
"""
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from domain.entities import Movement
from domain.services.calendar import month_key
from domain.services.concept_ranking import rank_by_concept

TZ = ZoneInfo("Europe/Madrid")


def _fecha_str(m: Movement) -> str:
    return m.occurred_at.strftime("%Y-%m-%d %H:%M:%S")


def _r2(v: float) -> float:
    return round(v, 2)


def _gasto_sum_for_month(movements: list[Movement], ym: str) -> float:
    return _r2(sum(m.amount for m in movements if m.type == "Gasto" and _fecha_str(m)[:7] == ym))


@dataclass
class GastoAlert:
    cur_total: float
    avg: float
    diff: float
    pct: float
    months_count: int
    is_warning: bool


def compute_gasto_alert(movements: list[Movement], reference: datetime) -> GastoAlert | None:
    reference_local = reference.astimezone(TZ)
    cur = month_key(reference_local, 0)
    cur_total = _gasto_sum_for_month(movements, cur)
    prev = [_gasto_sum_for_month(movements, month_key(reference_local, off)) for off in (-1, -2, -3)]
    with_data = [v for v in prev if v > 0]
    if not with_data or cur_total <= 0:
        return None
    avg = _r2(sum(with_data) / len(with_data))
    if avg <= 0:
        return None
    diff = _r2(cur_total - avg)
    pct = _r2((diff / avg) * 100)
    return GastoAlert(cur_total=cur_total, avg=avg, diff=diff, pct=pct,
                       months_count=len(with_data), is_warning=diff > 0)


def compute_top_merchants(movements: list[Movement], reference: datetime, limit: int = 8) -> list[tuple[str, float]]:
    reference_local = reference.astimezone(TZ)
    cur = month_key(reference_local, 0)
    by: dict[str, float] = {}
    for m in movements:
        if m.type != "Gasto" or _fecha_str(m)[:7] != cur:
            continue
        by[m.concept] = by.get(m.concept, 0.0) + m.amount
    top = sorted(by.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [(c, _r2(v)) for c, v in top]


def compute_gastos_ranking(movements: list[Movement], range_type: str, year: int | str | None,
                            reference: datetime, mode: str = "media", limit: int = 20) -> dict:
    entries, hover_suffix, has_gastos = rank_by_concept(
        movements, "Gasto", range_type, year, reference, mode, limit,
    )
    return {
        "entries": [{"concepto": c, "valor": v} for c, v in entries],
        "hoverSuffix": hover_suffix,
        "hasGastos": has_gastos,
    }
