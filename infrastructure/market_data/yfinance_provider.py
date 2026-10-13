"""
Adapter del puerto MarketDataProvider contra yfinance -- no es una API
oficial de Yahoo Finance (scraping), así que puede fallar o dar rate-limit
de forma intermitente. Cada ticker se consulta con su propio try/except:
un fallo individual no debe tumbar el resto del refresco.

Aviso conocido: un ticker que no cotiza en bolsa (p.ej. una empresa
privada) puede coincidir por casualidad con el símbolo real de otro
instrumento cotizado y devolver un precio "plausible" pero incorrecto en
vez de fallar limpiamente -- no hay lista de exclusión aquí, es
responsabilidad del usuario detectar y corregir a mano vía el precio
actual editable en la UI.
"""
import yfinance as yf


class YFinanceProvider:
    def get_quotes(self, tickers: list[str]) -> dict[str, tuple[float, str]]:
        if not tickers:
            return {}
        batch = yf.Tickers(" ".join(tickers))
        quotes: dict[str, tuple[float, str]] = {}
        for ticker in tickers:
            try:
                info = batch.tickers[ticker].fast_info
                price = info["lastPrice"]
                currency = info["currency"]
            except Exception:
                continue
            if price is not None and currency:
                quotes[ticker] = (float(price), str(currency).upper())
        return quotes

    def get_prices(self, tickers: list[str]) -> dict[str, float]:
        return {ticker: round(price, 2) for ticker, (price, _) in self.get_quotes(tickers).items()}

    def get_fx_rate(self, base: str, quote: str) -> float | None:
        base = base.upper()
        quote = quote.upper()
        if base == quote:
            return 1.0
        pairs = ((f"{base}{quote}=X", False), (f"{quote}{base}=X", True))
        for ticker, invert in pairs:
            try:
                price = yf.Ticker(ticker).fast_info["lastPrice"]
            except Exception:
                continue
            if price is None:
                continue
            rate = float(price)
            if invert:
                if rate == 0:
                    continue
                rate = 1.0 / rate
            return round(rate, 6)
        return None
