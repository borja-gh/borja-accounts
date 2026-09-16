from typing import Protocol


class MarketDataProvider(Protocol):
    def get_prices(self, tickers: list[str]) -> dict[str, float]:
        """Último precio de mercado por ticker. Los tickers que fallen (no
        encontrados, error de red, rate-limit) simplemente no aparecen en
        el dict devuelto -- el llamador los trata como fallidos, nunca
        lanza por un fallo individual."""
        ...

    def get_fx_rate(self, base: str, quote: str) -> float | None:
        """Tipo de cambio al contado: unidades de `quote` por 1 `base`.
        None si yfinance no responde o el par no existe."""
        ...
