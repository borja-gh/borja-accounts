from calendar import monthrange
from datetime import datetime
from zoneinfo import ZoneInfo

from domain.entities import CashBudget, Movement
from domain.exceptions import InvalidBudgetError
from domain.services.kpi import net_flows

TZ = ZoneInfo("Europe/Madrid")
PERIOD_TYPES = {"month", "year"}


def validate_budget_period(period_type: str, year: int, month: int) -> None:
    if period_type not in PERIOD_TYPES:
        raise InvalidBudgetError("El período debe ser 'month' o 'year'")
    if not isinstance(year, int) or isinstance(year, bool) or not 1 <= year <= 9998:
        raise InvalidBudgetError("Año inválido")
    if period_type == "month":
        if not isinstance(month, int) or isinstance(month, bool) or not 1 <= month <= 12:
            raise InvalidBudgetError("Mes inválido")
    elif month != 0:
        raise InvalidBudgetError("Un presupuesto anual no puede tener mes")


def resolve_period(period_type: str, year: int | None, month: int | None, reference: datetime) -> tuple[int, int]:
    reference_local = reference.astimezone(TZ)
    resolved_year = reference_local.year if year is None else year
    resolved_month = (reference_local.month if period_type == "month" else 0) if month is None else month
    validate_budget_period(period_type, resolved_year, resolved_month)
    return resolved_year, resolved_month


def _naive_local(value):
    if hasattr(value, "to_pydatetime"):
        value = value.to_pydatetime()
    if value.tzinfo is not None:
        return value.astimezone(TZ).replace(tzinfo=None)
    return value


def _period_bounds(period_type: str, year: int, month: int) -> tuple[datetime, datetime]:
    if period_type == "year":
        return datetime(year, 1, 1), datetime(year + 1, 1, 1)
    monthrange(year, month)
    start = datetime(year, month, 1)
    if month == 12:
        end = datetime(year + 1, 1, 1)
    else:
        end = datetime(year, month + 1, 1)
    return start, end


def compute_spent(movements: list[Movement], period_type: str, year: int, month: int) -> float:
    validate_budget_period(period_type, year, month)
    start, end = _period_bounds(period_type, year, month)
    flows = net_flows(movements, lambda m: start <= _naive_local(m.occurred_at) < end)
    return flows["gastos"]


def compute_budget_status(
    movements: list[Movement], budget: CashBudget | None, period_type: str, year: int, month: int,
) -> dict:
    spent = compute_spent(movements, period_type, year, month)
    amount = None if budget is None else round(budget.amount, 2)
    remaining = None if amount is None else round(amount - spent, 2)
    percentage = None if amount in (None, 0) else round(spent / amount * 100, 2)
    return {
        "periodType": period_type,
        "year": year,
        "month": month,
        "budgetId": None if budget is None else budget.id,
        "budget": amount,
        "spent": spent,
        "remaining": remaining,
        "percentage": percentage,
        "overBudget": amount is not None and spent > amount,
    }
