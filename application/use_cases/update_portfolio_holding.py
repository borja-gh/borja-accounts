from domain.exceptions import InvalidAmountError, PortfolioHoldingNotFoundError


class UpdatePortfolioHoldingUseCase:
    """Edita close_price_usd/note/current_price_usd de una holding
    existente -- los únicos campos editables desde la UI (ver
    docs/ARCHITECTURE.md §0). `data` solo pisa las claves presentes --
    omitir "closePrice"/"note"/"currentPrice" conserva el valor actual."""

    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str, holding_id: int, data: dict) -> dict:
        holdings = self.repository.list_portfolio_holdings(account_id)
        holding = next((h for h in holdings if h.id == holding_id), None)
        if holding is None:
            raise PortfolioHoldingNotFoundError(f"Holding {holding_id} no encontrada en '{account_id}'")

        def _parse_price(raw, error_message):
            if raw is None or raw == "":
                return None
            try:
                value = float(raw)
            except (TypeError, ValueError):
                raise InvalidAmountError(error_message)
            if value < 0:
                raise InvalidAmountError(error_message)
            return value

        close_price = holding.close_price_usd
        if "closePrice" in data:
            close_price = _parse_price(data["closePrice"], "Precio de cierre inválido")

        current_price = holding.current_price_usd
        if "currentPrice" in data:
            current_price = _parse_price(data["currentPrice"], "Precio actual inválido")

        note = holding.note
        if "note" in data:
            raw_note = data["note"]
            note = raw_note.strip() if isinstance(raw_note, str) and raw_note.strip() else None

        self.repository.update_portfolio_holding(holding_id, close_price, note, current_price)
        return {"ok": True, "closePrice": close_price, "note": note, "currentPrice": current_price}
