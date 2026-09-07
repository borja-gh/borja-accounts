from datetime import datetime

from domain.services.ibkr_kpi import IbkrKPIResult, compute_ibkr_kpis


class GetIbkrKPIsUseCase:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str, kpi_type: str, reference: datetime) -> IbkrKPIResult:
        movements = self.repository.load(account_id)
        holdings = self.repository.list_portfolio_holdings(account_id)
        account = self.repository.get_account(account_id)
        return compute_ibkr_kpis(movements, holdings, account.cash_override, kpi_type, reference)
