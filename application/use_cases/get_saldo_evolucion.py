from datetime import datetime

from domain.services.ledger import LedgerService
from domain.services.portfolio_holdings import build_investment_ledger
from domain.services.saldo import compute_saldo_evolucion
from domain.value_objects import AccountKind


class GetSaldoEvolucionUseCase:
    def __init__(self, repository, ledger: LedgerService):
        self.repository = repository
        self.ledger = ledger

    def execute(self, account_id: str, range_type: str, year: int | str | None, reference: datetime) -> dict:
        account = self.repository.get_account(account_id)
        movements = self.repository.load(account_id)
        # Misma fuente que KPI / GET /api/data / patrimonio: recálculo con
        # la regla vigente (Inversión no resta). Sin esto el gráfico leía
        # movements.balance persistido, que puede ser de cuando Inversión
        # restaba (CSV importado, golden master).
        if account.kind == AccountKind.INVESTMENT:
            holdings = self.repository.list_portfolio_holdings(account_id)
            if holdings:
                movements = build_investment_ledger(account_id, movements, holdings, self.ledger)
            else:
                movements = self.ledger.recalculate_balances(list(movements))
        else:
            movements = self.ledger.recalculate_balances(list(movements))
        with_media_movil = account.kind == AccountKind.CASH
        return compute_saldo_evolucion(movements, range_type, year, reference, with_media_movil)
