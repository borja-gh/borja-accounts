from datetime import datetime

from domain.services.gastos import compute_gastos_ranking


class GetGastosRankingUseCase:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str, range_type: str, year: int | str | None,
                reference: datetime, mode: str) -> dict:
        movements = self.repository.load(account_id)
        ranking = compute_gastos_ranking(movements, range_type, year, reference, mode)
        return {"ranking": ranking}
