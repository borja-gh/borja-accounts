"""KPIs consolidados entre cuentas para un periodo.

Ingresos = PnL realizado de las cuentas INVESTMENT (mismo criterio que
compute_investment_kpis: posiciones cerradas cuyo cierre cae en el periodo)
+ Nómina/Ingreso sin enlace de transferencia de las cuentas CASH.
Gastos = Gasto − Devolución de las cuentas CASH (los gastos de inversión no
entran: inflarían el balance). Balance = ingresos − gastos.
Periodos naturales: mes, trimestre (ene–mar, abr–jun, jul–sep, oct–dic) y año.
Los importes salen en la divisa de cada cuenta; la conversión la hace el caso
de uso con un único tipo de cambio por divisa.
"""
from dataclasses import dataclass
from typing import Callable

from domain.entities import Movement
from domain.services.calendar import month_key
from domain.services.expenses import expense_amount
from domain.services.period_filter import (
    month_end_exclusive,
    month_start,
    months_between,
    natural_quarter_window,
    parse_custom_range,
    shift_ym,
)
from domain.services.positions import compute_closed_positions
from domain.services.transfers import is_transfer_in
from domain.value_objects import AccountKind

CASH_INCOME_TYPES = {"Nómina", "Ingreso"}

Predicate = Callable[[str], bool]


def period_predicates(kpi_type: str, reference_local, custom_range: str | None = None) -> tuple[Predicate, Predicate]:
    """Predicados sobre 'YYYY-MM-DD HH:MM:SS' para el periodo actual y el anterior.
    Mismas reglas que compute_kpis (domain/services/kpi.py)."""
    if kpi_type == "trimestre":
        cut, cut_end, prev_cut = natural_quarter_window(reference_local)
        return (lambda s: cut <= s < cut_end), (lambda s: prev_cut <= s < cut)
    if kpi_type == "año":
        y = str(reference_local.year)
        py = str(reference_local.year - 1)
        return (lambda s: s.startswith(y)), (lambda s: s.startswith(py))
    if kpi_type == "custom":
        from_ym, to_ym = parse_custom_range(custom_range)
        cut = month_start(from_ym)
        cut_end = month_end_exclusive(to_ym)
        n = months_between(from_ym, to_ym)
        prev_cut = month_start(shift_ym(from_ym, -n))
        return (lambda s: cut <= s < cut_end), (lambda s: prev_cut <= s < cut)
    m_key = month_key(reference_local, 0)
    pm_key = month_key(reference_local, -1)
    return (lambda s: s[:7] == m_key), (lambda s: s[:7] == pm_key)


def _fecha(m: Movement) -> str:
    return m.occurred_at.strftime("%Y-%m-%d %H:%M:%S")


@dataclass
class Flows:
    ingresos_cash: float = 0.0
    ingresos_pnl: float = 0.0
    gastos: float = 0.0

    def __add__(self, other: "Flows") -> "Flows":
        return Flows(
            self.ingresos_cash + other.ingresos_cash,
            self.ingresos_pnl + other.ingresos_pnl,
            self.gastos + other.gastos,
        )

    def scaled(self, rate: float) -> "Flows":
        return Flows(self.ingresos_cash * rate, self.ingresos_pnl * rate, self.gastos * rate)


def account_flows(kind: AccountKind, movements: list[Movement], in_period: Predicate) -> Flows:
    in_range = [m for m in movements if in_period(_fecha(m))]
    if kind == AccountKind.CASH:
        ingresos_cash = sum(m.amount for m in in_range if m.type in CASH_INCOME_TYPES and not is_transfer_in(m))
        ingresos_pnl = 0.0
    else:
        ingresos_cash = 0.0
        ingresos_pnl = sum(
            c.bal for c in compute_closed_positions(movements, "Inversión", "Inversión_r") if in_period(c.fr)
        )
    gastos = sum(expense_amount(m) for m in in_range) if kind == AccountKind.CASH else 0.0
    return Flows(ingresos_cash=ingresos_cash, ingresos_pnl=ingresos_pnl, gastos=gastos)


def _r2(value: float) -> float:
    return round(value, 2)


@dataclass
class ConsolidatedKPIs:
    currency: str
    ingresos: float
    ingresos_cash: float
    ingresos_pnl: float
    gastos: float
    balance: float
    ingresos_delta: float
    gastos_delta: float
    balance_delta: float


def build_consolidated(currency: str, curr: Flows, prev: Flows) -> ConsolidatedKPIs:
    ingresos = curr.ingresos_cash + curr.ingresos_pnl
    prev_ingresos = prev.ingresos_cash + prev.ingresos_pnl
    balance = ingresos - curr.gastos
    prev_balance = prev_ingresos - prev.gastos
    return ConsolidatedKPIs(
        currency=currency,
        ingresos=_r2(ingresos), ingresos_cash=_r2(curr.ingresos_cash), ingresos_pnl=_r2(curr.ingresos_pnl),
        gastos=_r2(curr.gastos), balance=_r2(balance),
        ingresos_delta=_r2(ingresos - prev_ingresos), gastos_delta=_r2(curr.gastos - prev.gastos),
        balance_delta=_r2(balance - prev_balance),
    )
