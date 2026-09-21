import math

from domain.entities import Account
from domain.exceptions import InvalidBudgetError
from domain.services.budgets import compute_budget_status, resolve_period, validate_budget_period
from domain.value_objects import AccountKind


def _assert_cash(account: Account) -> None:
    if account.kind != AccountKind.CASH:
        raise InvalidBudgetError("Los presupuestos solo están disponibles para cuentas CASH")


def _parse_integer(data: dict, key: str, label: str) -> int:
    value = data.get(key)
    if isinstance(value, bool):
        raise InvalidBudgetError(f"{label} inválido")
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise InvalidBudgetError(f"{label} inválido")
    if str(value).strip() != str(parsed) and not isinstance(value, int):
        raise InvalidBudgetError(f"{label} inválido")
    return parsed


def _budget_dict(budget) -> dict:
    return {
        "id": budget.id,
        "accountId": budget.account_id,
        "periodType": budget.period_type,
        "year": budget.year,
        "month": budget.month,
        "amount": budget.amount,
    }


class GetCashBudgetsUseCase:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str) -> dict:
        _assert_cash(self.repository.get_account(account_id))
        return {"budgets": [_budget_dict(b) for b in self.repository.list_cash_budgets(account_id)]}


class UpsertCashBudgetUseCase:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str, data: dict) -> dict:
        _assert_cash(self.repository.get_account(account_id))
        period_type = str(data.get("periodType") or "").strip()
        year = _parse_integer(data, "year", "Año")
        month = _parse_integer(data, "month", "Mes") if data.get("month") is not None else 0
        validate_budget_period(period_type, year, month)
        try:
            amount = float(data.get("amount"))
        except (TypeError, ValueError):
            raise InvalidBudgetError("Importe inválido")
        if not math.isfinite(amount) or amount < 0:
            raise InvalidBudgetError("El presupuesto debe ser mayor o igual que cero")
        return _budget_dict(self.repository.upsert_cash_budget(account_id, period_type, year, month, amount))


class DeleteCashBudgetUseCase:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str, budget_id: int) -> None:
        _assert_cash(self.repository.get_account(account_id))
        self.repository.delete_cash_budget(account_id, budget_id)


class GetCashBudgetStatusUseCase:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str, period_type: str, year: int | None, month: int | None, reference) -> dict:
        _assert_cash(self.repository.get_account(account_id))
        resolved_year, resolved_month = resolve_period(period_type, year, month, reference)
        budget = self.repository.get_cash_budget(account_id, period_type, resolved_year, resolved_month)
        return compute_budget_status(
            self.repository.load(account_id), budget, period_type, resolved_year, resolved_month,
        )
