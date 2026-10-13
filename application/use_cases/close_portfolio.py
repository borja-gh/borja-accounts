import math

import pandas as pd

from domain.entities import Movement
from domain.exceptions import InvalidAmountError, PortfolioHoldingNotFoundError
from domain.services.ledger import LedgerService
from domain.services.portfolio_holdings import holding_sale_concept

from .shared import parse_fecha


class ClosePortfolioUseCase:
    def __init__(self, repository, ledger: LedgerService):
        self.repository = repository
        self.ledger = ledger

    def execute(self, account_id: str, data: dict) -> dict:
        portfolio = data.get("portfolio")
        open_holdings = [
            holding for holding in self.repository.list_portfolio_holdings(account_id)
            if holding.portfolio == portfolio and holding.close_price_usd is None
        ]
        if not open_holdings:
            raise PortfolioHoldingNotFoundError(f"No hay posiciones abiertas en la cartera '{portfolio}'")

        raw_prices = data.get("prices")
        if not isinstance(raw_prices, list):
            raise InvalidAmountError("Faltan los precios de cierre de la cartera")
        prices = {}
        for item in raw_prices:
            try:
                holding_id = int(item["holdingId"])
                close_price = float(item["closePrice"])
            except (KeyError, TypeError, ValueError):
                raise InvalidAmountError("Precio de cierre inválido")
            if not math.isfinite(close_price) or close_price < 0:
                raise InvalidAmountError("Precio de cierre inválido")
            prices[holding_id] = round(close_price, 2)

        holding_ids = {holding.id for holding in open_holdings}
        if len(prices) != len(raw_prices) or set(prices) != holding_ids:
            raise InvalidAmountError("Debe incluirse exactamente una cotización para cada posición abierta")
        if not data.get("fecha"):
            raise InvalidAmountError("Introduce la fecha de cierre")
        close_at = parse_fecha(data)

        movements = list(self.repository.load(account_id))
        for holding in open_holdings:
            concept = holding_sale_concept(holding)
            invested = next(
                (m for m in movements if m.type == "Inversión" and m.concept == concept),
                None,
            )
            returned = next(
                (m for m in movements if m.type == "Inversión_r" and m.concept == concept),
                None,
            )
            if invested is None:
                movements.append(Movement(
                    account_id=account_id,
                    occurred_at=pd.Timestamp(holding.contributed_at),
                    type="Inversión",
                    concept=concept,
                    amount=holding.capital_usd,
                ))
            proceeds = round(holding.shares * prices[holding.id], 2)
            if returned is None:
                movements.append(Movement(
                    account_id=account_id,
                    occurred_at=close_at,
                    type="Inversión_r",
                    concept=concept,
                    amount=proceeds,
                ))
            else:
                returned.amount = proceeds
                returned.occurred_at = close_at

        movements.sort(key=lambda movement: movement.occurred_at)
        movements = self.ledger.recalculate_balances(movements)
        self.repository.save_portfolio_closure(account_id, prices, movements)
        return {"ok": True, "portfolio": portfolio, "closed": len(open_holdings)}
