"""
Traducción de periodSlices (index.html): predicados "¿cae en el período
actual/anterior?" para kpi_type = mes|trimestre|año, reutilizados tanto
para la fecha de un movimiento como para la fecha de cierre de una
posición -- por eso operan sobre un string 'YYYY-MM-DD HH:MM:SS', no sobre
Movement directamente.
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Callable

from domain.services.calendar import month_key
from domain.services.period_filter import natural_quarter_window


@dataclass
class PeriodSlices:
    in_curr: Callable[[str], bool]
    in_prv: Callable[[str], bool]


def period_slices(kpi_type: str, reference_local: datetime) -> PeriodSlices:
    if kpi_type == "trimestre":
        cut, cut_end, prev_cut = natural_quarter_window(reference_local)
        return PeriodSlices(in_curr=lambda s: cut <= s < cut_end, in_prv=lambda s: prev_cut <= s < cut)
    if kpi_type == "año":
        y = str(reference_local.year)
        py = str(reference_local.year - 1)
        return PeriodSlices(in_curr=lambda s: s.startswith(y), in_prv=lambda s: s.startswith(py))
    m = month_key(reference_local, 0)
    pm = month_key(reference_local, -1)
    return PeriodSlices(in_curr=lambda s: s[:7] == m, in_prv=lambda s: s[:7] == pm)
