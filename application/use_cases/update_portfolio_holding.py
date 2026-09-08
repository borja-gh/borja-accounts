import pandas as pd

from domain.entities import Movement
from domain.exceptions import InvalidAmountError, PortfolioHoldingNotFoundError
from domain.services.ledger import LedgerService
from domain.services.portfolio_holdings import holding_sale_concept

from .shared import parse_fecha


class UpdatePortfolioHoldingUseCase:
    """Edita close_price_usd/note/current_price_usd. Cerrar (pasar de
    closePrice vacío a un precio) es un hecho de caja: persiste Inversión
    (coste del lote) + Inversión_r (shares × precio) y recálcula el saldo
    por el P&L neto, igual que un cierre legado. Reescribir el precio de
    un lote ya vendido actualiza el Inversión_r."""

    def __init__(self, repository, ledger: LedgerService):
        self.repository = repository
        self.ledger = ledger

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

        if close_price is not None:
            self._realize_sale(account_id, holding, close_price, data)

        self.repository.update_portfolio_holding(holding_id, close_price, note, current_price)
        return {"ok": True, "closePrice": close_price, "note": note, "currentPrice": current_price}

    def _realize_sale(self, account_id: str, holding, close_price: float, data: dict) -> None:
        proceeds = round(holding.shares * close_price, 2)
        concept = holding_sale_concept(holding)
        close_at = parse_fecha(data) if data.get("fecha") else pd.Timestamp.now()
        buy_at = pd.Timestamp(holding.contributed_at)

        movements = list(self.repository.load(account_id))
        inv = next((m for m in movements if m.type == "Inversión" and m.concept == concept), None)
        inv_r = next((m for m in movements if m.type == "Inversión_r" and m.concept == concept), None)

        if inv is None:
            movements.append(Movement(
                account_id=account_id, occurred_at=buy_at, type="Inversión",
                concept=concept, amount=holding.capital_usd,
            ))
        if inv_r is None:
            movements.append(Movement(
                account_id=account_id, occurred_at=close_at, type="Inversión_r",
                concept=concept, amount=proceeds,
            ))
        else:
            inv_r.amount = proceeds
            if data.get("fecha"):
                inv_r.occurred_at = close_at

        movements = sorted(movements, key=lambda m: m.occurred_at)
        movements = self.ledger.recalculate_balances(movements)
        self.repository.save(account_id, movements)
