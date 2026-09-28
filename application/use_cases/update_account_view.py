from domain.entities import Account
from domain.exceptions import InvalidAccountError
from domain.value_objects import AccountKind


_PANELS_BY_KIND = {
    AccountKind.CASH: {
        "assistant", "overview", "cash_budget", "cash_balance", "monthly", "expenses", "bets",
        "add_movement", "movement_total",
    },
    AccountKind.INVESTMENT: {
        "assistant", "overview", "investment_balance", "portfolios", "holdings",
        "add_movement", "movement_total",
    },
}


class UpdateAccountViewUseCase:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str, data: dict) -> Account:
        account = self.repository.get_account(account_id)
        if not isinstance(data, dict):
            raise InvalidAccountError("La configuración de vista debe ser un objeto")
        visible_panels = data.get("visiblePanels")
        allowed_panels = _PANELS_BY_KIND[account.kind]

        if (
            not isinstance(visible_panels, list)
            or any(not isinstance(panel, str) for panel in visible_panels)
            or len(visible_panels) != len(set(visible_panels))
            or not set(visible_panels).issubset(allowed_panels)
        ):
            raise InvalidAccountError("La selección de paneles no es válida para esta cuenta")

        account.visible_panels = visible_panels
        self.repository.update_account_view(account.id, visible_panels)
        return account
