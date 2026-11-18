from dataclasses import replace

from domain.exceptions import InvalidAmountError, PortfolioHoldingNotFoundError
from domain.services.ledger import LedgerService
from domain.services.portfolio_holdings import holding_sale_concept

from .shared import clean_text

INVESTMENT_TYPES = ("Inversión", "Inversión_r")
CONCEPT_SEPARATOR = " · "


class RenamePortfolioUseCase:
    """Renombra una cartera en todo su historial: los lotes de holdings
    (abiertos y cerrados), sus conceptos persistidos y el histórico legado
    sin lotes que usa el mismo nombre. Todo en una transacción. Renombrar
    ambas partes a la vez mantiene la exclusión de legado frente a holdings
    (ver compute_open_investment_summary). El nombre no puede contener el
    separador del concepto: el historial lo usa para separar cartera y ticker."""

    def __init__(self, repository, ledger: LedgerService):
        self.repository = repository
        self.ledger = ledger

    def execute(self, account_id: str, data: dict) -> dict:
        current = clean_text(data.get("portfolio"))
        new = clean_text(data.get("newName"))
        if not current or not new:
            raise InvalidAmountError("Indica la cartera y el nuevo nombre")
        if CONCEPT_SEPARATOR in new:
            raise InvalidAmountError(f"El nombre de la cartera no puede contener '{CONCEPT_SEPARATOR.strip()}'")

        holdings = self.repository.list_portfolio_holdings(account_id)
        affected = [h for h in holdings if h.portfolio == current]
        movements = list(self.repository.load(account_id))
        has_legacy = any(m.type in INVESTMENT_TYPES and m.concept == current for m in movements)
        if not affected and not has_legacy:
            raise PortfolioHoldingNotFoundError(f"No existe la cartera '{current}'")
        if new == current:
            return {"ok": True, "portfolio": new, "holdings": len(affected)}

        taken = {h.portfolio for h in holdings} | {
            m.concept for m in movements if m.type in INVESTMENT_TYPES
        }
        if new in taken:
            raise InvalidAmountError(f"Ya existe una cartera llamada '{new}'")

        renamed = [replace(h, portfolio=new) for h in affected]
        concept_map = {holding_sale_concept(old): holding_sale_concept(lot) for old, lot in zip(affected, renamed)}
        concept_map[current] = new
        for movement in movements:
            if movement.type in INVESTMENT_TYPES and movement.concept in concept_map:
                movement.concept = concept_map[movement.concept]

        movements = self.ledger.recalculate_balances(movements)
        self.repository.save_holdings_and_movements(account_id, renamed, movements)
        return {"ok": True, "portfolio": new, "holdings": len(renamed)}
