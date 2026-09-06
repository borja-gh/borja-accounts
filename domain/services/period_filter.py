"""
Traducción de filterCutoff/rowInFilter/applyFilter/applyFilterByCloseDate
(index.html): el filtro de panel compartido por apuestas, inversiones,
gastos, mensual, saldo y transferencias -- "Todo" / "6 meses" / "3 meses" /
"Mes" / un año concreto. Meses de calendario, no ventanas rodantes.

"custom" (rango libre mes/año inicio - mes/año fin) se añadió después --
reutiliza el parámetro `year` (opaco para todo el resto de la cadena,
que solo lo propaga sin inspeccionarlo) para llevar "YYYY-MM:YYYY-MM" en
vez de un año suelto, así ningún caso de uso intermedio (get_betting_report,
compute_mensual, compute_saldo_evolucion, ...) necesita cambiar de firma.
"""
import re
from datetime import datetime

from domain.exceptions import InvalidDateError
from domain.services.calendar import calendar_month_start

_MONTHS_BACK = {"1m": 0, "3m": 2, "6m": 5}
YM_RE = re.compile(r"^\d{4}-\d{2}$")


def month_start(ym: str) -> str:
    return f"{ym}-01"


def month_end_exclusive(ym: str) -> str:
    """Primer día del mes siguiente a `ym` ('YYYY-MM') -- límite superior
    exclusivo, evita el problema de "qué día tiene 31" al comparar strings."""
    year, month = int(ym[:4]), int(ym[5:7])
    if month == 12:
        return f"{year + 1:04d}-01-01"
    return f"{year:04d}-{month + 1:02d}-01"


def shift_ym(ym: str, delta_months: int) -> str:
    year, month = int(ym[:4]), int(ym[5:7])
    total = year * 12 + (month - 1) + delta_months
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def months_between(from_ym: str, to_ym: str) -> int:
    """Número de meses de calendario en [from_ym, to_ym], ambos inclusive."""
    fy, fm = int(from_ym[:4]), int(from_ym[5:7])
    ty, tm = int(to_ym[:4]), int(to_ym[5:7])
    return (ty * 12 + tm) - (fy * 12 + fm) + 1


def parse_custom_range(value) -> tuple[str, str]:
    """Valida y separa el 'YYYY-MM:YYYY-MM' que viaja en el parámetro `year`
    cuando range/period == 'custom'. Lanza InvalidDateError ante cualquier
    formato inválido -- nunca degrada en silencio a "sin filtro"."""
    parts = str(value).split(":")
    if len(parts) != 2 or not all(YM_RE.match(p) for p in parts):
        raise InvalidDateError(
            "Rango personalizado inválido -- formato esperado 'YYYY-MM:YYYY-MM'"
        )
    from_ym, to_ym = parts
    if from_ym > to_ym:
        raise InvalidDateError("Rango personalizado inválido -- 'desde' debe ser anterior o igual a 'hasta'")
    return from_ym, to_ym


def filter_cutoff(range_type: str, year, reference_local: datetime):
    """Devuelve None (sin filtro, range_type == 'all'), o una tupla
    ('year', 'YYYY') / ('from', 'YYYY-MM-DD') / ('range', 'YYYY-MM-DD', 'YYYY-MM-DD' exclusivo)."""
    if range_type == "all" or range_type is None:
        return None
    if range_type == "custom":
        from_ym, to_ym = parse_custom_range(year)
        return ("range", month_start(from_ym), month_end_exclusive(to_ym))
    if range_type == "year":
        return ("year", str(year))
    months_back = _MONTHS_BACK.get(range_type)
    if months_back is None:
        return None
    return ("from", calendar_month_start(reference_local, months_back))


def row_in_filter(fecha_str: str, cutoff) -> bool:
    if cutoff is None:
        return True
    mode, *rest = cutoff
    if mode == "year":
        return fecha_str.startswith(rest[0])
    if mode == "range":
        lo, hi_exclusive = rest
        return lo <= fecha_str < hi_exclusive
    return fecha_str >= rest[0]


def filter_by_field(items, fecha_getter, range_type: str, year, reference_local: datetime) -> list:
    cutoff = filter_cutoff(range_type, year, reference_local)
    if cutoff is None:
        return list(items)
    return [it for it in items if row_in_filter(fecha_getter(it), cutoff)]
