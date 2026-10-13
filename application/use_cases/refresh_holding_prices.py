class RefreshHoldingPricesUseCase:
    """Refresca current_price_usd de todas las holdings ABIERTAS de la
    cuenta de una vez (vía MarketDataProvider) -- las cerradas no cambian,
    ya tienen su close_price_usd definitivo."""

    def __init__(self, repository, market_data):
        self.repository = repository
        self.market_data = market_data

    def execute(self, account_id: str) -> dict:
        account = self.repository.get_account(account_id)
        holdings = self.repository.list_portfolio_holdings(account_id)
        open_holdings = [h for h in holdings if h.close_price_usd is None]
        tickers = sorted({h.ticker for h in open_holdings})

        quotes = self.market_data.get_quotes(tickers)

        updates = {}
        conversions = {}
        rates = {}
        for holding in open_holdings:
            quote = quotes.get(holding.ticker)
            if quote is None:
                continue
            price, quote_currency = quote
            rate = 1.0
            account_currency = account.currency.upper()
            if quote_currency != account_currency:
                pair = (quote_currency, account_currency)
                if pair not in rates:
                    rates[pair] = self.market_data.get_fx_rate(*pair)
                rate = rates[pair]
                if rate is None:
                    continue
                conversions[holding.ticker] = {
                    "ticker": holding.ticker,
                    "fromCurrency": quote_currency,
                    "toCurrency": account_currency,
                    "rate": rate,
                }
            updates[holding.id] = round(price * rate, 2)
        if updates:
            self.repository.update_holdings_current_prices(updates)

        failed_tickers = sorted({h.ticker for h in open_holdings if h.id not in updates})
        return {
            "updated": len(updates),
            "total": len(open_holdings),
            "failedTickers": failed_tickers,
            "conversions": list(conversions.values()),
        }
