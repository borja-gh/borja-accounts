from domain.exceptions import FxRateUnavailableError, InvalidAmountError

_SUPPORTED = {"EUR", "USD"}


class GetFxRateUseCase:
    """Tipo de cambio al contado (yfinance, bajo demanda). El usuario lo
    confirma; no se aplica solo."""

    def __init__(self, market_data):
        self.market_data = market_data

    def execute(self, base: str, quote: str) -> dict:
        base = (base or "").upper()
        quote = (quote or "").upper()
        if base not in _SUPPORTED or quote not in _SUPPORTED:
            raise InvalidAmountError("Solo se consulta EUR y USD")
        rate = self.market_data.get_fx_rate(base, quote)
        if rate is None:
            raise FxRateUnavailableError(f"No se pudo consultar {base}→{quote}")
        return {"ok": True, "base": base, "quote": quote, "rate": rate}
