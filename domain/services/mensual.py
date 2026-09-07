"""Traducción de la parte de cálculo de chartMensual (index.html, cuenta CASH)."""
from datetime import datetime
from zoneinfo import ZoneInfo

from domain.entities import Movement
from domain.services.kpi import net_flows
from domain.services.period_filter import filter_by_field

TZ = ZoneInfo("Europe/Madrid")


def _fecha_str(m: Movement) -> str:
    return m.occurred_at.strftime("%Y-%m-%d %H:%M:%S")


def compute_mensual(movements: list[Movement], range_type: str, year: int | str | None, reference: datetime) -> dict:
    reference_local = reference.astimezone(TZ)
    filtered = filter_by_field(movements, _fecha_str, range_type, year, reference_local)

    meses = sorted({_fecha_str(m)[:7] for m in filtered})
    flows = [net_flows(filtered, lambda m, ym=ym: _fecha_str(m)[:7] == ym) for ym in meses]

    return {
        "meses": meses,
        "ingresos": [f["ingresos"] for f in flows],
        "gastos": [f["gastos"] for f in flows],
        "balance": [f["balance"] for f in flows],
    }
