from domain.exceptions import InvalidAmountError, PortfolioHoldingNotFoundError


class UpdatePortfolioHoldingUseCase:
    """Edita close_price_usd/note de una holding existente -- son los
    únicos campos editables desde la UI (ver docs/ARCHITECTURE.md §0: sin
    seguimiento de valor de mercado en vivo, el PnL solo aparece cuando se
    rellena el precio de cierre real). `data` solo pisa las claves
    presentes -- omitir "closePrice"/"note" conserva el valor actual."""

    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str, holding_id: int, data: dict) -> dict:
        holdings = self.repository.list_portfolio_holdings(account_id)
        holding = next((h for h in holdings if h.id == holding_id), None)
        if holding is None:
            raise PortfolioHoldingNotFoundError(f"Holding {holding_id} no encontrada en '{account_id}'")

        close_price = holding.close_price_usd
        if "closePrice" in data:
            raw = data["closePrice"]
            if raw is None or raw == "":
                close_price = None
            else:
                try:
                    close_price = float(raw)
                except (TypeError, ValueError):
                    raise InvalidAmountError("Precio de cierre inválido")
                if close_price < 0:
                    raise InvalidAmountError("Precio de cierre inválido")

        note = holding.note
        if "note" in data:
            raw_note = data["note"]
            note = raw_note.strip() if isinstance(raw_note, str) and raw_note.strip() else None

        self.repository.update_portfolio_holding(holding_id, close_price, note)
        return {"ok": True, "closePrice": close_price, "note": note}
