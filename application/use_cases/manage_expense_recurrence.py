from domain.exceptions import InvalidExpenseRecurrenceError, MovementNotFoundError


class ManageExpenseRecurrenceUseCase:
    def __init__(self, repository):
        self.repository = repository

    def list(self, account_id: str) -> list[dict]:
        recurrence_by_concept = {}
        for movement in self.repository.load(account_id):
            if movement.type == "Gasto":
                recurrence_by_concept[movement.concept] = movement.recurrente
        return [
            {"concepto": concept, "recurrente": recurrente}
            for concept, recurrente in sorted(recurrence_by_concept.items(), key=lambda item: item[0].casefold())
        ]

    def update(self, account_id: str, data: dict) -> dict:
        concept = data.get("concepto")
        recurrente = data.get("recurrente")
        if not isinstance(concept, str) or not concept.strip() or type(recurrente) is not bool:
            raise InvalidExpenseRecurrenceError("Se requiere un concepto y un valor booleano recurrente")

        concept = concept.strip()
        movements = self.repository.load(account_id)
        matches = [movement for movement in movements if movement.type == "Gasto" and movement.concept == concept]
        if not matches:
            raise MovementNotFoundError("No hay gastos con ese concepto en la cuenta")

        for movement in matches:
            movement.recurrente = recurrente
        self.repository.save(account_id, movements)
        return {"ok": True, "concepto": concept, "recurrente": recurrente}
