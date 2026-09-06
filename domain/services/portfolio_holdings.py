"""
Posiciones abiertas de investment1 basadas en `portfolio_holdings` (una
fila por aportación real, de un CSV de carteras/) en vez de en `movements`
tipo Inversión -- ver docs/ARCHITECTURE.md sobre por qué se fusionó
"Cartera 3 - META"/"Cartera 3 - META'" en una sola cartera con dos
aportaciones al mismo ticker.

Decisión explícita: sin seguimiento de valor de mercado en vivo. Cada
holding es un simple check de compra -- el PnL solo se calcula cuando se
rellena `close_price_usd` (precio real de venta de esa aportación
concreta), nunca contra una cotización actual.
"""
from dataclasses import dataclass, field

import pandas as pd

from domain.entities import Movement, PortfolioHolding
from domain.services.positions import OpenPosition, compute_open_positions


def _r2(v: float) -> float:
    return round(v, 2)


@dataclass
class HoldingView:
    id: int
    ticker: str
    company: str
    avg_price_usd: float
    capital_usd: float
    close_price_usd: float | None
    pnl_usd: float | None
    pnl_pct: float | None
    note: str | None


@dataclass
class OpenPortfolioView:
    portfolio: str
    opened_at: str
    capital_usd: float
    pnl_usd: float | None
    pnl_pct: float | None
    holdings: list[HoldingView] = field(default_factory=list)


def holdings_as_synthetic_movements(holdings: list[PortfolioHolding]) -> list[Movement]:
    """Reutiliza rank_by_concept/filter_by_field (que operan sobre
    Movement) para el ranking de carteras -- una fila por holding, el
    concept es la cartera, rank_by_concept ya agrega sumando amount."""
    return [
        Movement(
            account_id=h.account_id,
            occurred_at=pd.Timestamp(h.contributed_at),
            type="Inversión",
            concept=h.portfolio,
            amount=h.capital_usd,
        )
        for h in holdings
    ]


def compute_open_portfolios(holdings: list[PortfolioHolding]) -> list[OpenPortfolioView]:
    by_portfolio: dict[str, list[PortfolioHolding]] = {}
    for h in holdings:
        by_portfolio.setdefault(h.portfolio, []).append(h)

    out = []
    for portfolio, rows in by_portfolio.items():
        holding_views = []
        for h in rows:
            pnl = None
            pnl_pct = None
            capital = _r2(h.capital_usd)
            if h.close_price_usd is not None:
                pnl = _r2(h.shares * h.close_price_usd - h.capital_usd)
                pnl_pct = _r2(pnl / capital * 100) if capital > 0 else None
            holding_views.append(HoldingView(
                id=h.id, ticker=h.ticker, company=h.company,
                avg_price_usd=_r2(h.price_usd), capital_usd=capital,
                close_price_usd=h.close_price_usd, pnl_usd=pnl, pnl_pct=pnl_pct,
                note=h.note,
            ))

        portfolio_capital = _r2(sum(hv.capital_usd for hv in holding_views))
        all_closed = bool(holding_views) and all(hv.close_price_usd is not None for hv in holding_views)
        portfolio_pnl = _r2(sum(hv.pnl_usd for hv in holding_views)) if all_closed else None
        portfolio_pnl_pct = (
            _r2(portfolio_pnl / portfolio_capital * 100) if portfolio_pnl is not None and portfolio_capital > 0 else None
        )

        out.append(OpenPortfolioView(
            portfolio=portfolio,
            opened_at=min(r.contributed_at for r in rows),
            capital_usd=portfolio_capital,
            pnl_usd=portfolio_pnl,
            pnl_pct=portfolio_pnl_pct,
            holdings=holding_views,
        ))
    return out


@dataclass
class OpenInvestmentSummary:
    """Fusiona carteras basadas en holdings con cualquier cartera legado
    (sin CSV) que siga abierta -- hoy no hay ningún caso real (Cartera 1 ya
    está cerrada), pero sin esto una cartera legado abierta desaparecería
    silenciosamente de KPIs/tabla en vez de solo perder su detalle por ticker."""
    holdings_portfolios: list[OpenPortfolioView]
    legacy_open: list[OpenPosition]
    capital_usd: float
    count: int


def compute_open_investment_summary(movements: list[Movement], holdings: list[PortfolioHolding]) -> OpenInvestmentSummary:
    holdings_portfolios = compute_open_portfolios(holdings)
    holdings_names = {p.portfolio for p in holdings_portfolios}
    legacy_open = [
        p for p in compute_open_positions(movements, "Inversión", "Inversión_r")
        if p.concepto not in holdings_names
    ]

    capital = round(sum(p.capital_usd for p in holdings_portfolios) + sum(p.monto for p in legacy_open), 2)

    return OpenInvestmentSummary(
        holdings_portfolios=holdings_portfolios, legacy_open=legacy_open,
        capital_usd=capital, count=len(holdings_portfolios) + len(legacy_open),
    )


def compute_investment_saldo(movements: list[Movement], holdings: list[PortfolioHolding],
                              cash_override: float | None) -> float:
    """cash_override es un snapshot manual (efectivo real reportado por
    IBKR, ver docs/ARCHITECTURE.md §0) -- NO se ajusta solo por
    transferencias reales posteriores hacia/desde investment1. Si el
    usuario transfiere dinero después de tomar el snapshot, el saldo queda
    desactualizado hasta que se actualice. El saldo es capital invertido
    (coste), no valor de mercado -- no hay seguimiento de mercado en vivo."""
    summary = compute_open_investment_summary(movements, holdings)
    cash = cash_override if cash_override is not None else 0.0
    return round(cash + summary.capital_usd, 2)
