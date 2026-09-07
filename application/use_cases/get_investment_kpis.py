from datetime import datetime

from domain.services.investment_kpi import InvestmentKPIResult, compute_investment_kpis


class GetInvestmentKPIsUseCase:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str, kpi_type: str, reference: datetime) -> InvestmentKPIResult:
        movements = self.repository.load(account_id)
        holdings = self.repository.list_portfolio_holdings(account_id)
        account = self.repository.get_account(account_id)
        return compute_investment_kpis(movements, holdings, account.cash_override, kpi_type, reference)
