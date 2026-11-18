class ListClosedPortfolioHoldingsUseCase:
    """Lotes ya vendidos, para desplegar las carteras del historial. El cobro
    y el P&L son los mismos que aplica el ledger al cerrar (títulos × cierre)."""

    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str) -> list[dict]:
        out = []
        for h in self.repository.list_portfolio_holdings(account_id):
            if h.close_price_usd is None:
                continue
            proceeds = round(h.shares * h.close_price_usd, 2)
            pnl = round(proceeds - h.capital_usd, 2)
            out.append({
                "id": h.id, "portfolio": h.portfolio, "ticker": h.ticker, "company": h.company,
                "shares": h.shares, "avgPrice": round(h.price_usd, 4), "capital": round(h.capital_usd, 2),
                "closePrice": round(h.close_price_usd, 2), "proceeds": proceeds,
                "pnl": pnl, "pnlPct": round(pnl / h.capital_usd * 100, 2) if h.capital_usd > 0 else None,
                "contributedAt": h.contributed_at,
            })
        return out
