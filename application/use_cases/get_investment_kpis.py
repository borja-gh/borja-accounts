from datetime import datetime

from domain.services.investment_kpi import InvestmentKPIResult, compute_investment_kpis
from domain.services.ledger import LedgerService
from domain.services.portfolio_holdings import build_investment_ledger


class GetInvestmentKPIsUseCase:
    def __init__(self, repository, ledger: LedgerService):
        self.repository = repository
        self.ledger = ledger

    def execute(self, account_id: str, kpi_type: str, reference: datetime) -> InvestmentKPIResult:
        movements = self.repository.load(account_id)
        holdings = self.repository.list_portfolio_holdings(account_id)
        combined = build_investment_ledger(account_id, movements, holdings, self.ledger) if holdings else movements
        saldo = combined[-1].balance if combined else 0.0
        return compute_investment_kpis(movements, holdings, saldo, kpi_type, reference)
