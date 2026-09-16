from datetime import datetime

from domain.services.gastos import compute_gasto_alert


class GetGastosMesActualUseCase:
    """Alerta de gasto del mes (GastoAlert)."""

    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str, reference: datetime) -> dict:
        movements = self.repository.load(account_id)
        alert = compute_gasto_alert(movements, reference)
        return {
            "alert": None if alert is None else {
                "curTotal": alert.cur_total, "avg": alert.avg, "diff": alert.diff,
                "pct": alert.pct, "monthsCount": alert.months_count, "isWarning": alert.is_warning,
            },
        }
