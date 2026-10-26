from datetime import datetime

from domain.services.gastos_evolucion import compute_gastos_evolucion


class GetGastosEvolucionUseCase:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str, range_type: str, year: int | str | None, reference: datetime) -> dict:
        return compute_gastos_evolucion(self.repository.load(account_id), range_type, year, reference)
