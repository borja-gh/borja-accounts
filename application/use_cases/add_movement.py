from domain.entities import Movement
from domain.exceptions import InvalidExpenseRecurrenceError
from domain.services.ledger import LedgerService

from .shared import parse_fecha, parse_total


class AddMovementUseCase:
    def __init__(self, repository, ledger: LedgerService):
        self.repository = repository
        self.ledger = ledger

    def execute(self, account_id: str, data: dict) -> float:
        tipo = data.get("tipo", "")
        concepto = (data.get("concepto") or "").strip()
        total = parse_total(data)
        fecha = parse_fecha(data)

        account = self.repository.get_account(account_id)
        movements = self.repository.load(account_id)
        self.ledger.validate_type_and_concept(account.kind, movements, tipo, concepto)

        matching_expenses = [m for m in movements if tipo == "Gasto" and m.type == tipo and m.concept == concepto]
        if matching_expenses:
            recurrente = matching_expenses[0].recurrente
        elif tipo == "Gasto":
            recurrente = data.get("recurrente", True)
            if type(recurrente) is not bool:
                raise InvalidExpenseRecurrenceError("El valor recurrente debe ser booleano")
        else:
            recurrente = False
        nuevo = Movement(
            account_id=account_id, occurred_at=fecha, type=tipo, concept=concepto,
            amount=total, recurrente=recurrente,
        )
        movements = sorted(movements + [nuevo], key=lambda m: m.occurred_at)
        movements = self.ledger.recalculate_balances(movements)
        self.repository.save(account_id, movements)

        return movements[-1].balance
