"""
Ranking por concepto (agrupar, media/mes o total, top-N) -- la parte de
cálculo que comparten chartGastos (Tipo=Gasto, top 20) y chartCarteras
(Tipo=Inversión, top 12) en index.html. Ambas eran el mismo algoritmo
duplicado sobre un tipo y un top-N distintos.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from domain.entities import Movement
from domain.services.period_filter import filter_by_field, months_between, parse_custom_range, shift_ym

TZ = ZoneInfo("Europe/Madrid")

_MONTHS_FOR_RANGE = {"1m": 1, "3m": 3, "6m": 6}


def _fecha_str(m: Movement) -> str:
    return m.occurred_at.strftime("%Y-%m-%d %H:%M:%S")


def _r2(v: float) -> float:
    return round(v, 2)


def n_months_for_range(items: list[Movement], range_type: str) -> int:
    if range_type in (None, "all", "year", "custom"):
        return len({_fecha_str(m)[:7] for m in items}) or 1
    return _MONTHS_FOR_RANGE.get(range_type, 1)


def _range_month_bounds(
    range_type: str, year: int | str | None, reference_local: datetime
) -> tuple[str | None, str]:
    reference_month = reference_local.strftime("%Y-%m")
    if range_type in (None, "all"):
        return None, reference_month
    if range_type == "custom":
        start_month, end_month = parse_custom_range(year)
        return start_month, min(end_month, reference_month)
    if range_type == "year":
        start_month = f"{year}-01"
        return start_month, min(f"{year}-12", reference_month)
    months = _MONTHS_FOR_RANGE.get(range_type)
    if months is not None:
        return shift_ym(reference_month, 1 - months), reference_month
    return None, reference_month


def _months_for_concept(first_month: str, range_start: str | None, range_end: str) -> int:
    start_month = max(first_month, range_start) if range_start else first_month
    end_month = max(start_month, range_end)
    return months_between(start_month, end_month)


def rank_by_concept(
    movements: list[Movement],
    tipo: str,
    range_type: str,
    year: int | str | None,
    reference: datetime,
    mode: str,
    limit: int,
    currency_symbol: str = "€",
    average_from_first_occurrence: bool = False,
) -> tuple[list[tuple[str, float]], str, bool]:
    """Devuelve (entries, hover_suffix, has_items). entries ya en orden
    descendente y recortadas a `limit`; has_items indica si había algún
    movimiento de `tipo` tras aplicar el filtro de rango (independiente de
    si el ranking resultante quedó vacío por filtrar valores <= 0)."""
    reference_local = reference.astimezone(TZ)
    filtered = filter_by_field(movements, _fecha_str, range_type, year, reference_local)
    items = [m for m in filtered if m.type == tipo and m.amount is not None]
    hover_suffix = f"{currency_symbol}/mes" if mode == "media" else currency_symbol
    if not items:
        return [], hover_suffix, False

    by_concepto: dict[str, float] = {}
    for m in items:
        by_concepto[m.concept] = by_concepto.get(m.concept, 0.0) + m.amount

    if mode == "media":
        if average_from_first_occurrence:
            first_month_by_concept: dict[str, str] = {}
            for movement in movements:
                if movement.type != tipo or movement.amount is None:
                    continue
                month = _fecha_str(movement)[:7]
                first_month_by_concept[movement.concept] = min(
                    month, first_month_by_concept.get(movement.concept, month)
                )
            range_start, range_end = _range_month_bounds(range_type, year, reference_local)
            entries = [
                (
                    concept,
                    _r2(total / _months_for_concept(
                        first_month_by_concept[concept], range_start, range_end
                    )),
                )
                for concept, total in by_concepto.items()
            ]
        else:
            n_months = n_months_for_range(items, range_type)
            entries = [(c, _r2(t / n_months)) for c, t in by_concepto.items()]
    else:
        entries = [(c, _r2(t)) for c, t in by_concepto.items()]

    entries = [(c, v) for c, v in entries if v > 0]
    entries.sort(key=lambda kv: kv[1], reverse=True)
    return entries[:limit], hover_suffix, True
