"""Traducción de la parte de cálculo de chartSaldo (index.html)."""
from datetime import datetime
from zoneinfo import ZoneInfo

from domain.entities import Movement
from domain.services.period_filter import filter_by_field

TZ = ZoneInfo("Europe/Madrid")


def _fecha_str(m: Movement) -> str:
    return m.occurred_at.strftime("%Y-%m-%d %H:%M:%S")


def compute_saldo_evolucion(movements: list[Movement], range_type: str, year: int | str | None,
                             reference: datetime) -> dict:
    reference_local = reference.astimezone(TZ)
    filtered = filter_by_field(movements, _fecha_str, range_type, year, reference_local)
    filtered = sorted(filtered, key=_fecha_str)
    dates = [_fecha_str(m) for m in filtered]
    saldos = [m.balance for m in filtered]
    return {"dates": dates, "saldos": saldos, "actual": saldos[-1] if saldos else 0.0}
