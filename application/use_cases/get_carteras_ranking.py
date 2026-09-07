from datetime import datetime

from domain.services.carteras_ranking import compute_carteras_ranking
from domain.services.portfolio_holdings import holdings_as_synthetic_movements
from domain.value_objects import CURRENCY_SYMBOLS


class GetCarterasRankingUseCase:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str, range_type: str, year: int | str | None,
                reference: datetime, mode: str) -> dict:
        account = self.repository.get_account(account_id)
        holdings = self.repository.list_portfolio_holdings(account_id)
        synthetic = holdings_as_synthetic_movements(holdings)
        symbol = CURRENCY_SYMBOLS.get(account.currency, "€")
        return compute_carteras_ranking(synthetic, range_type, year, reference, mode, currency_symbol=symbol)
