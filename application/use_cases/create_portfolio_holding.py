from dataclasses import replace

from domain.entities import Movement, PortfolioHolding
from domain.exceptions import InsufficientCashError, InvalidAccountError, InvalidAmountError
from domain.services.ledger import LedgerService
from domain.services.portfolio_holdings import (
    build_investment_ledger,
    compute_open_investment_summary,
    holding_sale_concept,
)
from domain.value_objects import AccountKind

from .shared import parse_fecha


def available_cash(movements, holdings, ledger: LedgerService, account_id: str) -> float:
    """Caja = Saldo a coste − capital en lotes abiertos. Comprar no mueve
    el saldo; despliega caja hacia «En carteras»."""
    combined = build_investment_ledger(account_id, movements, holdings, ledger) if holdings else movements
    saldo = combined[-1].balance if combined else 0.0
    deployed = compute_open_investment_summary(movements, holdings).capital_usd
    return round(float(saldo) - deployed, 2)


class CreatePortfolioHoldingUseCase:
    """Alta de un lote desde la UI. Persiste la fila y su Inversión a coste
    (no mueve el saldo). Exige caja disponible ≥ capital."""

    def __init__(self, repository, ledger: LedgerService):
        self.repository = repository
        self.ledger = ledger

    def execute(self, account_id: str, data: dict) -> dict:
        account = self.repository.get_account(account_id)
        if account.kind != AccountKind.INVESTMENT:
            raise InvalidAccountError("Solo una cuenta de inversión admite holdings")

        portfolio = (data.get("portfolio") or "").strip()
        ticker = (data.get("ticker") or "").strip().upper()
        company = (data.get("company") or "").strip() or ticker
        if not portfolio:
            raise InvalidAmountError("La cartera no puede estar vacía")
        if not ticker:
            raise InvalidAmountError("El ticker no puede estar vacío")

        shares = _positive_number(data.get("shares"), "Número de títulos inválido")
        price = _positive_number(data.get("price"), "Precio inválido")
        raw_capital = data.get("capital")
        capital = round(shares * price, 2) if raw_capital in (None, "") else _positive_number(
            raw_capital, "Capital inválido"
        )
        fee = None
        if data.get("fee") not in (None, ""):
            fee = _non_negative_number(data.get("fee"), "Comisión inválida")

        contributed_at = parse_fecha(data)
        contributed_at_str = contributed_at.strftime("%Y-%m-%d %H:%M:%S")

        movements = list(self.repository.load(account_id))
        holdings = self.repository.list_portfolio_holdings(account_id)
        caja = available_cash(movements, holdings, self.ledger, account_id)
        if capital > caja:
            raise InsufficientCashError(
                f"No hay caja suficiente (disponible {caja:.2f}, hace falta {capital:.2f}). "
                "El Saldo ya incluye lo invertido: transfiere o aporta antes de comprar."
            )

        holding = PortfolioHolding(
            id=0, account_id=account_id, portfolio=portfolio, ticker=ticker,
            company=company, shares=shares, price_usd=price, capital_usd=capital,
            fee_usd=fee, contributed_at=contributed_at_str, source_file="ui",
        )
        holding_id = self.repository.add_portfolio_holding(holding)
        holding = replace(holding, id=holding_id)

        movements.append(Movement(
            account_id=account_id, occurred_at=contributed_at, type="Inversión",
            concept=holding_sale_concept(holding), amount=capital,
        ))
        movements = sorted(movements, key=lambda m: m.occurred_at)
        movements = self.ledger.recalculate_balances(movements)
        self.repository.save(account_id, movements)

        return {
            "ok": True,
            "id": holding_id,
            "portfolio": portfolio,
            "ticker": ticker,
            "capital": capital,
            "caja": round(caja - capital, 2),
        }


def _positive_number(raw, message: str) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise InvalidAmountError(message)
    if value <= 0:
        raise InvalidAmountError(message)
    return round(value, 2)


def _non_negative_number(raw, message: str) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise InvalidAmountError(message)
    if value < 0:
        raise InvalidAmountError(message)
    return round(value, 2)
