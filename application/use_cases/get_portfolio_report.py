from datetime import datetime
from zoneinfo import ZoneInfo

from domain.services.period_filter import filter_by_field
from domain.services.portfolio_holdings import compute_open_investment_summary, holding_sale_concept
from domain.services.positions import ClosedPosition, compute_closed_positions

TZ = ZoneInfo("Europe/Madrid")


class GetPortfolioReportUseCase:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str, range_type: str, year: int | str | None, reference: datetime) -> dict:
        reference_local = reference.astimezone(TZ)
        movements = self.repository.load(account_id)
        holdings = self.repository.list_portfolio_holdings(account_id)

        summary = compute_open_investment_summary(movements, holdings)
        open_capital = summary.capital_usd
        open_count = summary.count

        closed_all = _closed_portfolios(
            compute_closed_positions(movements, "Inversión", "Inversión_r"), holdings
        )
        closed_filtered = filter_by_field(closed_all, lambda c: c.fr, range_type, year, reference_local)

        # El resultado histórico y el capital abierto se expresan en la divisa nativa de la cuenta.
        total_pnl = closed_all[-1].bal_h if closed_all else 0.0
        total_roi = closed_all[-1].pct_h if closed_all else 0.0

        open_positions_json = [
            {
                "concepto": p.portfolio, "fi": p.opened_at, "invertido": p.capital_usd,
                "pnl": p.pnl_usd, "pnlPct": p.pnl_pct,
                "holdings": [
                    {
                        "id": h.id, "ticker": h.ticker, "company": h.company,
                        "shares": h.shares, "avgPrice": h.avg_price_usd, "capital": h.capital_usd,
                        "closePrice": h.close_price_usd, "currentPrice": h.current_price_usd,
                        "pnl": h.pnl_usd, "pnlPct": h.pnl_pct,
                        "note": h.note,
                    }
                    for h in p.holdings if h.close_price_usd is None
                ],
            }
            for p in summary.holdings_portfolios
        ] + [
            {
                "concepto": p.concepto, "fi": p.fi, "invertido": p.monto,
                "pnl": None, "pnlPct": None, "holdings": [],
            }
            for p in summary.legacy_open
        ]
        open_positions_json.sort(key=lambda p: p["invertido"], reverse=True)

        return {
            "totalInv": open_capital,
            "totalCarteras": len(closed_all) + open_count,
            "totalPnL": total_pnl,
            "totalRoi": total_roi,
            "closedCount": len(closed_all),
            "openCount": open_count,
            "openTotal": open_capital,
            "openPositions": open_positions_json,
            "closedPositions": [
                {
                    "Concepto": c.concepto, "fi": c.fi, "fr": c.fr,
                    "invertido": c.invertido, "devuelto": c.devuelto, "bal": c.bal,
                    "roi": c.pct, "balH": c.bal_h, "roiH": c.pct_h,
                }
                for c in closed_filtered
            ],
        }


def _closed_portfolios(closed_positions: list[ClosedPosition], holdings) -> list[ClosedPosition]:
    by_sale_concept = {holding_sale_concept(holding): holding for holding in holdings}
    holdings_by_portfolio = {}
    for holding in holdings:
        holdings_by_portfolio.setdefault(holding.portfolio, []).append(holding)

    grouped = {}
    passthrough = []
    for position in closed_positions:
        holding = by_sale_concept.get(position.concepto)
        if holding is None:
            passthrough.append(position)
            continue
        grouped.setdefault(holding.portfolio, []).append(position)

    aggregated = passthrough[:]
    for portfolio, rows in grouped.items():
        portfolio_holdings = holdings_by_portfolio[portfolio]
        partial = any(holding.close_price_usd is None for holding in portfolio_holdings)
        ticker_groups = {}
        for row in rows:
            holding = by_sale_concept[row.concepto]
            ticker_groups.setdefault(holding.ticker, []).append(row)

        row_groups = ticker_groups.items() if partial else [(None, rows)]
        for ticker, ticker_rows in row_groups:
            invested = round(sum(row.invertido for row in ticker_rows), 2)
            returned = round(sum(row.devuelto for row in ticker_rows), 2)
            balance = round(returned - invested, 2)
            ticker_open = ticker is not None and any(
                holding.ticker == ticker and holding.close_price_usd is None
                for holding in portfolio_holdings
            )
            concept = portfolio if ticker is None else f"{portfolio} · {ticker}"
            if ticker_open:
                concept += " · cierre parcial"
            aggregated.append(ClosedPosition(
                concepto=concept,
                fi=min(row.fi for row in ticker_rows),
                fr=max(row.fr for row in ticker_rows),
                invertido=invested,
                devuelto=returned,
                bal=balance,
                pct=round(balance / invested * 100, 2) if invested > 0 else 0.0,
            ))

    aggregated.sort(key=lambda row: row.fr)
    cumulative_balance = 0.0
    cumulative_invested = 0.0
    for row in aggregated:
        cumulative_balance = round(cumulative_balance + row.bal, 2)
        cumulative_invested = round(cumulative_invested + row.invertido, 2)
        row.bal_h = cumulative_balance
        row.pct_h = round(cumulative_balance / cumulative_invested * 100, 2) if cumulative_invested > 0 else 0.0
    return aggregated
