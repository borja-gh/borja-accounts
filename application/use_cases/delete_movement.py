from domain.exceptions import ProtectedInitialBalanceError
from domain.services.ledger import LedgerService


class DeleteMovementUseCase:
    def __init__(self, repository, ledger: LedgerService):
        self.repository = repository
        self.ledger = ledger

    def execute(self, account_id: str) -> tuple[dict, float]:
        movements = self.repository.load(account_id)
        if len(movements) <= 1:
            raise ProtectedInitialBalanceError("No se puede borrar el saldo inicial")

        ultimo = movements[-1]
        eliminado = {
            "fecha": str(ultimo.occurred_at),
            "tipo": ultimo.type,
            "concepto": ultimo.concept,
            "total": float(ultimo.amount),
        }
        link_id = ultimo.transfer_link_id

        movements = movements[:-1]
        movements = self.ledger.recalculate_balances(movements)
        self.repository.save(account_id, movements)

        if link_id is not None:
            self._delete_counterpart(account_id, link_id)

        return eliminado, movements[-1].balance

    def _delete_counterpart(self, origin_account_id: str, link_id) -> None:
        """La otra pata puede no ser el último movimiento de su cuenta."""
        for account in self.repository.list_accounts():
            if account.id == origin_account_id:
                continue
            other = self.repository.load(account.id)
            kept = [m for m in other if m.transfer_link_id != link_id]
            if len(kept) == len(other):
                continue
            kept = self.ledger.recalculate_balances(kept)
            self.repository.save(account.id, kept)
