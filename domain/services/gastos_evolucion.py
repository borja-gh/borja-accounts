from datetime import datetime
from zoneinfo import ZoneInfo

from domain.entities import Movement
from domain.services.period_filter import months_between, parse_custom_range, shift_ym
from domain.services.expenses import expense_amount


def compute_gastos_evolucion(
    movements: list[Movement], range_type: str, year: int | str | None, reference: datetime,
) -> dict:
    current_month = reference.astimezone(ZoneInfo("Europe/Madrid")).strftime("%Y-%m")
    if range_type == "custom":
        start, end = parse_custom_range(year)
    elif range_type == "year":
        start, end = f"{year}-01", min(f"{year}-12", current_month)
    elif range_type in ("1m", "3m", "6m"):
        start, end = shift_ym(current_month, 1 - int(range_type[:-1])), current_month
    else:
        start = min((m.occurred_at.strftime("%Y-%m") for m in movements), default=current_month)
        end = current_month
    months = [shift_ym(start, offset) for offset in range(months_between(start, end))]
    month_indexes = {month: index for index, month in enumerate(months)}
    totals = [0.0] * len(months)
    concepts = {}
    for movement in movements:
        if movement.type not in ("Gasto", "Devolución") or movement.amount is None:
            continue
        concept = concepts.setdefault(movement.concept, {
            "concepto": movement.concept, "gastos": [0.0] * len(months), "subconceptos": {},
        })
        subconcept = concept["subconceptos"].setdefault(movement.subconcept, {
            "subconcepto": movement.subconcept, "gastos": [0.0] * len(months),
        })
        index = month_indexes.get(movement.occurred_at.strftime("%Y-%m"))
        if index is not None:
            amount = expense_amount(movement)
            totals[index] += amount
            concept["gastos"][index] += amount
            subconcept["gastos"][index] += amount
    entries = []
    for name in sorted(concepts):
        concept = concepts[name]
        concept["gastos"] = [round(value, 2) for value in concept["gastos"]]
        concept["subconceptos"] = [
            {"subconcepto": name, "gastos": [round(value, 2) for value in item["gastos"]]}
            for name, item in sorted(concept["subconceptos"].items(), key=lambda pair: (pair[0] is None, pair[0] or ""))
        ]
        entries.append(concept)
    return {"meses": months, "gastos": [round(value, 2) for value in totals], "conceptos": entries}
