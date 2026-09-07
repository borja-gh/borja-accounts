from datetime import datetime
from zoneinfo import ZoneInfo

from domain.services.period_filter import filter_by_field
from domain.services.portfolio_holdings import compute_open_investment_summary
from domain.services.positions import compute_closed_positions

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

        closed_all = compute_closed_positions(movements, "Inversión", "Inversión_r")
        closed_filtered = filter_by_field(closed_all, lambda c: c.fr, range_type, year, reference_local)

        # totalPnL/totalRoi son de Cartera 1 (legado, EUR) -- no se mezclan
        # con openCapital (USD, carteras basadas en holdings).
        total_pnl = closed_all[-1].bal_h if closed_all else 0.0
        total_roi = closed_all[-1].pct_h if closed_all else 0.0

        open_positions_json = [
            {
                "concepto": p.portfolio, "fi": p.opened_at, "invertido": p.capital_usd,
                "pnl": p.pnl_usd, "pnlPct": p.pnl_pct,
                "holdings": [
                    {
                        "id": h.id, "ticker": h.ticker, "company": h.company,
                        "avgPrice": h.avg_price_usd, "capital": h.capital_usd,
                        "closePrice": h.close_price_usd, "pnl": h.pnl_usd, "pnlPct": h.pnl_pct,
                        "note": h.note,
                    }
                    for h in p.holdings
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
