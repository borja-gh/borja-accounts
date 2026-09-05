from datetime import datetime

from domain.services.saldo import compute_saldo_evolucion
from domain.value_objects import AccountKind


class GetSaldoEvolucionUseCase:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str, range_type: str, year: int | None, reference: datetime) -> dict:
        movements = self.repository.load(account_id)
        # Media móvil solo en cuentas CASH; en INVESTMENT sobra -- misma
        # decisión que hoy toma chartSaldo() según el kind de la cuenta,
        # no según un id concreto (cualquier cuenta CASH se comporta igual).
        with_media_movil = self.repository.get_account(account_id).kind == AccountKind.CASH
        return compute_saldo_evolucion(movements, range_type, year, reference, with_media_movil)
