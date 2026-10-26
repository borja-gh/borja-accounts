from dataclasses import replace

from domain.entities import Movement


def expense_amount(movement: Movement) -> float:
    if movement.type == "Gasto":
        return movement.amount
    if movement.type == "Devolución":
        return -movement.amount
    return 0.0


def net_expense_movements(movements: list[Movement]) -> list[Movement]:
    recurrence = {m.concept: m.recurrente for m in movements if m.type == "Gasto"}
    # Other types preserve the account's first month for non-recurring averages.
    return [
        replace(m, type="Gasto", amount=expense_amount(m), recurrente=recurrence.get(m.concept, False))
        if m.type == "Devolución" else m
        for m in movements
    ]
