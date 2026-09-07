class RefreshHoldingPricesUseCase:
    """Refresca current_price_usd de todas las holdings ABIERTAS de la
    cuenta de una vez (vía MarketDataProvider) -- las cerradas no cambian,
    ya tienen su close_price_usd definitivo."""

    def __init__(self, repository, market_data):
        self.repository = repository
        self.market_data = market_data

    def execute(self, account_id: str) -> dict:
        holdings = self.repository.list_portfolio_holdings(account_id)
        open_holdings = [h for h in holdings if h.close_price_usd is None]
        tickers = sorted({h.ticker for h in open_holdings})

        prices = self.market_data.get_prices(tickers)

        updates = {h.id: prices[h.ticker] for h in open_holdings if h.ticker in prices}
        if updates:
            self.repository.update_holdings_current_prices(updates)

        failed_tickers = sorted(set(tickers) - set(prices.keys()))
        return {
            "updated": len(updates),
            "total": len(open_holdings),
            "failedTickers": failed_tickers,
        }
