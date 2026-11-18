from dataclasses import replace

import pandas as pd

from domain.exceptions import InsufficientCashError, InvalidAmountError, InvalidDateError, PortfolioHoldingNotFoundError
from domain.services.holding_amounts import resolve_edited_amounts
from domain.services.ledger import LedgerService
from domain.services.portfolio_holdings import holding_sale_concept

from .create_portfolio_holding import available_cash
from .shared import clean_text, optional_non_negative_number, optional_positive_number, parse_fecha

CLOSED_LOT_MESSAGE = "El lote está cerrado: no se pueden cambiar títulos, precio medio, invertido ni fecha de compra"


class EditPortfolioHoldingUseCase:
    """Edición de las características de un lote (PATCH). Solo los campos
    enviados cambian. Títulos, precio medio e invertido se rederivan entre
    sí (ver domain/services/holding_amounts.py) y solo se tocan en lotes
    abiertos: en uno cerrado el invertido ya está en Inversión_r y el saldo.
    El ticker forma parte del concepto persistido del lote, así que se
    reescribe en sus Inversión/Inversión_r para no duplicar el capital."""

    def __init__(self, repository, ledger: LedgerService):
        self.repository = repository
        self.ledger = ledger

    def execute(self, account_id: str, holding_id: int, data: dict) -> dict:
        holdings = self.repository.list_portfolio_holdings(account_id)
        holding = next((h for h in holdings if h.id == holding_id), None)
        if holding is None:
            raise PortfolioHoldingNotFoundError(f"Holding {holding_id} no encontrada en '{account_id}'")

        ticker = holding.ticker
        if "ticker" in data:
            ticker = clean_text(data["ticker"]).upper()
            if not ticker:
                raise InvalidAmountError("El ticker no puede estar vacío")
        company = holding.company
        if "company" in data:
            company = clean_text(data["company"]) or ticker
        fee = holding.fee_usd
        if "fee" in data:
            fee = optional_non_negative_number(data["fee"], "Comisión inválida")

        shares, price, capital = resolve_edited_amounts(
            (holding.shares, holding.price_usd, holding.capital_usd),
            (
                optional_positive_number(data.get("shares"), "Número de títulos inválido", 4),
                optional_positive_number(data.get("price"), "Precio inválido", 4),
                optional_positive_number(data.get("capital"), "Capital inválido", 2),
            ),
        )

        contributed_at = holding.contributed_at
        if "contributedAt" in data:
            if not data["contributedAt"]:
                raise InvalidDateError("Fecha inválida")
            contributed_at = parse_fecha({"fecha": data["contributedAt"]}).strftime("%Y-%m-%d %H:%M:%S")

        amounts_changed = (shares, price, capital) != (holding.shares, holding.price_usd, holding.capital_usd)
        date_changed = contributed_at != holding.contributed_at
        is_open = holding.close_price_usd is None
        if (amounts_changed or date_changed) and not is_open:
            raise InvalidAmountError(CLOSED_LOT_MESSAGE)

        updated = replace(
            holding,
            ticker=ticker,
            company=company,
            shares=shares,
            price_usd=price,
            capital_usd=capital,
            fee_usd=fee,
            contributed_at=contributed_at,
            current_price_usd=None if ticker != holding.ticker else holding.current_price_usd,
        )
        if updated == holding:
            return {"ok": True, "id": holding_id}

        movements = list(self.repository.load(account_id))
        if capital > holding.capital_usd:
            caja = available_cash(movements, holdings, self.ledger, account_id)
            delta = round(capital - holding.capital_usd, 2)
            if delta > caja:
                raise InsufficientCashError(
                    f"No hay caja suficiente (disponible {caja:.2f}, hace falta {delta:.2f}). "
                    "El Saldo ya incluye lo invertido: transfiere o aporta antes de ampliar el lote."
                )

        old_concept = holding_sale_concept(holding)
        new_concept = holding_sale_concept(updated)
        for movement in movements:
            if movement.concept != old_concept or movement.type not in ("Inversión", "Inversión_r"):
                continue
            movement.concept = new_concept
            if movement.type == "Inversión" and is_open:
                movement.amount = capital
                if date_changed:
                    movement.occurred_at = pd.Timestamp(contributed_at)

        movements = sorted(movements, key=lambda m: m.occurred_at)
        movements = self.ledger.recalculate_balances(movements)
        self.repository.save_holdings_and_movements(account_id, [updated], movements)
        return {"ok": True, "id": holding_id}
