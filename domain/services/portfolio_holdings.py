"""
Posiciones abiertas basadas en `portfolio_holdings` (una fila por
aportación real) en vez de en `movements` tipo Inversión. Aportaciones
sucesivas al mismo ticker de una cartera conviven como holdings distintas
de un mismo `portfolio`.

El PnL de una holding usa `close_price_usd` si ya se vendió; si no, el
último `current_price_usd` consultado (yfinance bajo demanda, no un stream
en vivo). Sin precio, pnl queda None -- a coste. Ver docs/ARCHITECTURE.md §1.
"""
import copy
from dataclasses import dataclass, field

import pandas as pd

from domain.entities import Movement, PortfolioHolding
from domain.services.ledger import LedgerService
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
    current_price_usd: float | None
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


def holding_sale_concept(holding: PortfolioHolding) -> str:
    """Concepto persistido al vender un lote. Único por holding para no
    mezclar invertido con el sintético de la cartera abierta ni con otro ticker."""
    return f"{holding.portfolio} · {holding.ticker} #{holding.id}"


def holdings_as_synthetic_movements(holdings: list[PortfolioHolding]) -> list[Movement]:
    """Reutiliza rank_by_concept/filter_by_field (que operan sobre
    Movement) para el ranking de carteras -- una fila por holding ABIERTA,
    el concept es la cartera, rank_by_concept ya agrega sumando amount.
    Los lotes vendidos ya no cuentan: su capital salió vía Inversión_r."""
    return [
        Movement(
            account_id=h.account_id,
            occurred_at=pd.Timestamp(h.contributed_at),
            type="Inversión",
            concept=h.portfolio,
            amount=h.capital_usd,
        )
        for h in holdings
        if h.close_price_usd is None
    ]


def compute_open_portfolios(holdings: list[PortfolioHolding]) -> list[OpenPortfolioView]:
    by_portfolio: dict[str, list[PortfolioHolding]] = {}
    for h in holdings:
        by_portfolio.setdefault(h.portfolio, []).append(h)

    out = []
    for portfolio, rows in by_portfolio.items():
        open_rows = [h for h in rows if h.close_price_usd is None]
        if not open_rows:
            continue

        holding_views = []
        for h in rows:
            pnl = None
            pnl_pct = None
            capital = _r2(h.capital_usd)
            # PnL con el precio de cierre real si ya se vendió; si sigue
            # abierta, con el último precio de mercado consultado (ver
            # RefreshHoldingPricesUseCase) -- no realizado hasta cerrar.
            price = h.close_price_usd if h.close_price_usd is not None else h.current_price_usd
            if price is not None:
                pnl = _r2(h.shares * price - h.capital_usd)
                pnl_pct = _r2(pnl / capital * 100) if capital > 0 else None
            holding_views.append(HoldingView(
                id=h.id, ticker=h.ticker, company=h.company,
                avg_price_usd=_r2(h.price_usd), capital_usd=capital,
                close_price_usd=h.close_price_usd, current_price_usd=h.current_price_usd,
                pnl_usd=pnl, pnl_pct=pnl_pct, note=h.note,
            ))

        portfolio_capital = _r2(sum(h.capital_usd for h in open_rows))
        open_views = [hv for hv in holding_views if hv.close_price_usd is None]
        all_priced = bool(open_views) and all(hv.pnl_usd is not None for hv in open_views)
        portfolio_pnl = _r2(sum(hv.pnl_usd for hv in open_views)) if all_priced else None
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
    presale_delta_usd: float


def compute_presale_delta(holdings: list[PortfolioHolding]) -> float:
    """Ganancia/pérdida no realizada de las holdings abiertas que ya tienen
    un precio de mercado consultado -- las que no (fetch fallido o nunca
    consultado) contribuyen 0, es decir, se quedan a coste. Alimenta el KPI
    "Saldo preventa" (en_carteras sigue siendo siempre a coste)."""
    return round(sum(
        h.shares * h.current_price_usd - h.capital_usd
        for h in holdings
        if h.close_price_usd is None and h.current_price_usd is not None
    ), 2)


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
        presale_delta_usd=compute_presale_delta(holdings),
    )


def build_investment_ledger(account_id: str, movements: list[Movement], holdings: list[PortfolioHolding],
                             ledger: LedgerService) -> list[Movement]:
    """Fusiona el histórico real de `movements` con una fila 'Inversión'
    agregada por cartera de holdings (mismo criterio que Cartera 1, legado
    sin CSV) -- sin persistir estas filas: `portfolio_holdings` sigue
    siendo la única fuente de verdad para holdings, esto es solo una
    proyección de lectura. Así el Saldo (recalculate_balances) y el
    histórico mostrado en UI derivan de la misma fuente combinada, en vez
    de depender de un cash_override manual desconectado del ledger.

    Devuelve copias de los `movements` reales (nunca muta la lista de
    entrada) intercaladas con las filas sintéticas, todo reordenado por
    fecha y con el saldo recalculado -- Inversión no mueve el saldo al
    abrir (ver ledger.py), así que el balance de las filas reales no
    cambia por esta fusión."""
    portfolios = compute_open_portfolios(holdings)
    synthetic = [
        Movement(
            account_id=account_id, occurred_at=pd.Timestamp(p.opened_at),
            type="Inversión", concept=p.portfolio, amount=p.capital_usd,
        )
        for p in portfolios
    ]
    combined = sorted([copy.copy(m) for m in movements] + synthetic, key=lambda m: m.occurred_at)
    return ledger.recalculate_balances(combined)
