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
    def get_prices(self, tickers: list[str]) -> dict[str, float]:
        if not tickers:
            return {}
        batch = yf.Tickers(" ".join(tickers))
        prices: dict[str, float] = {}
        for ticker in tickers:
            try:
                price = batch.tickers[ticker].fast_info["lastPrice"]
            except Exception:
                continue
            if price is not None:
                prices[ticker] = round(float(price), 2)
        return prices
