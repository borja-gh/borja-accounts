"""
Traducción de computeKPIs / calendarMonthStart / monthKey / periodSlices
(index.html) al backend -- Bloque 4 del refactor.

Corrige un bug real de zona horaria que existía en el original (ver
tests/README.md para el detalle):
`pm` (período anterior, rama kpi_type="mes") reproducía
`new Date(y, m, 1).toISOString().slice(0,7)`, que bajo un TZ de offset
positivo (Europe/Madrid) construye medianoche LOCAL y, al convertirla a
UTC para leer el mes, cruza hacia el mes anterior al que corresponde. El
fix: no pasar por UTC en absoluto para decidir "a qué mes de calendario
pertenece esta fecha" -- usar siempre los componentes locales del
instante, igual que ya hacía correctamente calendar_month_start().

`reference` (instante UTC) sustituye a `new Date()`/`datetime.now()`: nunca
se lee el reloj real aquí, se recibe explícito desde el caso de uso -- así
el resultado es reproducible en el golden master sin importar cuándo se
ejecute.
"""
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from domain.entities import Movement
from domain.services.calendar import calendar_month_start, month_key
from domain.services.period_filter import (
    month_end_exclusive,
    month_start,
    months_between,
    parse_custom_range,
    shift_ym,
)
from domain.services.transfers import is_transfer_in

TZ = ZoneInfo("Europe/Madrid")

# Ingresos/Gastos/Balance del período son netos, no una suma bruta por tipo:
# - Devolución contrarresta Gasto (un gasto parcialmente devuelto reduce el
#   gasto neto, no aparece como un ingreso nuevo) -- por eso no está en
#   TIPOS_KPI_ING, y se resta explícitamente de "gastos" en net_flows.
# - Transferencia (salida) no cuenta como gasto -- mover dinero entre
#   cuentas propias no es un gasto real.
# - Un "Ingreso" que en realidad es una transferencia entrante (ver
#   is_transfer_in, detecta el concepto "Desde X") tampoco cuenta como
#   ingreso real, por el mismo motivo.
# - Balance = ingresos - gastos (ambos ya netos) -- ya no es el cambio bruto
#   de saldo de la cuenta: Transferencia/Apuestas/Inversión no pesan en él,
#   igual que no pesan en ingresos/gastos, para que los tres KPIs cuadren
#   siempre entre sí.
TIPOS_KPI_ING = {"Nómina", "Ingreso"}
TIPOS_KPI_GAS = {"Gasto"}


def _r2(v: float) -> float:
    return round(v, 2)


def _fecha_str(m: Movement) -> str:
    return m.occurred_at.strftime("%Y-%m-%d %H:%M:%S")


def net_flows(movements: list[Movement], in_period) -> dict:
    ing = gas = 0.0
    for m in movements:
        if not in_period(m):
            continue
        if m.type in TIPOS_KPI_ING and not is_transfer_in(m):
            ing += m.amount
        if m.type in TIPOS_KPI_GAS:
            gas += m.amount
        elif m.type == "Devolución":
            gas -= m.amount
    # Si la Devolución cae en un período distinto al de su Gasto (p.ej. el
    # gasto se edita a un mes anterior, o simplemente se devuelve en el mes
    # siguiente), "gastos" podría salir negativo -- se acota a 0 porque es
    # un KPI de "cuánto gastaste este período", no un neto con signo.
    gas = max(0.0, gas)
    return {"ingresos": _r2(ing), "gastos": _r2(gas), "balance": _r2(ing - gas)}


@dataclass
class PeriodDelta:
    diff: float


@dataclass
class KPIResult:
    saldo: float
    ingresos: float
    ingresos_delta: PeriodDelta
    gastos: float
    gastos_delta: PeriodDelta
    balance: float
    balance_delta: PeriodDelta


def _delta(curr: float, prv: float) -> PeriodDelta:
    return PeriodDelta(diff=_r2(curr - prv))


def compute_kpis(movements: list[Movement], kpi_type: str, reference: datetime, custom_range: str | None = None) -> KPIResult:
    """reference: instante UTC (tz-aware). kpi_type: 'mes' (default) |
    'trimestre' | 'año' | 'custom' (requiere custom_range='YYYY-MM:YYYY-MM').
    Para 'custom', el "período anterior" del delta es el mismo número de
    meses inmediatamente antes de `from_ym` -- no hay otra definición
    derivable de un rango arbitrario."""
    saldo = movements[-1].balance if movements else 0.0
    reference_local = reference.astimezone(TZ)

    if kpi_type == "trimestre":
        cut = calendar_month_start(reference_local, 2)
        cut2 = calendar_month_start(reference_local, 5)
        curr = net_flows(movements, lambda m: _fecha_str(m) >= cut)
        prv = net_flows(movements, lambda m: cut2 <= _fecha_str(m) < cut)
    elif kpi_type == "año":
        y = str(reference_local.year)
        py = str(reference_local.year - 1)
        curr = net_flows(movements, lambda m: _fecha_str(m).startswith(y))
        prv = net_flows(movements, lambda m: _fecha_str(m).startswith(py))
    elif kpi_type == "custom":
        from_ym, to_ym = parse_custom_range(custom_range)
        cut = month_start(from_ym)
        cut_end = month_end_exclusive(to_ym)
        n = months_between(from_ym, to_ym)
        prev_cut = month_start(shift_ym(from_ym, -n))
        curr = net_flows(movements, lambda m: cut <= _fecha_str(m) < cut_end)
        prv = net_flows(movements, lambda m: prev_cut <= _fecha_str(m) < cut)
    else:
        m_key = month_key(reference_local, 0)
        pm_key = month_key(reference_local, -1)
        curr = net_flows(movements, lambda m: _fecha_str(m)[:7] == m_key)
        prv = net_flows(movements, lambda m: _fecha_str(m)[:7] == pm_key)

    return KPIResult(
        saldo=saldo,
        ingresos=curr["ingresos"], ingresos_delta=_delta(curr["ingresos"], prv["ingresos"]),
        gastos=curr["gastos"], gastos_delta=_delta(curr["gastos"], prv["gastos"]),
        balance=curr["balance"], balance_delta=_delta(curr["balance"], prv["balance"]),
    )
