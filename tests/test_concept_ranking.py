from datetime import datetime
from zoneinfo import ZoneInfo

from domain.entities import Movement
from domain.services.gastos import compute_gastos_ranking


TZ = ZoneInfo("Europe/Madrid")
REFERENCE = datetime(2026, 10, 15, 12, tzinfo=TZ)


def movement(concept: str, date: str, amount: float) -> Movement:
    return Movement(
        account_id="cash",
        occurred_at=datetime.fromisoformat(date).replace(tzinfo=TZ),
        type="Gasto",
        concept=concept,
        amount=amount,
    )


def test_average_divides_by_months_since_first_occurrence_even_without_later_spend():
    result = compute_gastos_ranking(
        [movement("A", "2026-04-12", 70)], "all", None, REFERENCE, "media"
    )

    assert result["entries"] == [{"concepto": "A", "valor": 10.0}]


def test_average_uses_selected_range_for_existing_and_new_concepts():
    movements = [
        movement("Anterior", "2026-01-10", 100),
        movement("Anterior", "2026-10-10", 90),
        movement("Nuevo", "2026-09-10", 60),
        movement("Nuevo", "2026-10-11", 60),
    ]

    result = compute_gastos_ranking(movements, "3m", None, REFERENCE, "media")

    assert result["entries"] == [
        {"concepto": "Nuevo", "valor": 60.0},
        {"concepto": "Anterior", "valor": 30.0},
    ]


def test_total_mode_is_unchanged():
    result = compute_gastos_ranking(
        [movement("A", "2026-04-12", 70)], "all", None, REFERENCE, "total"
    )

    assert result["entries"] == [{"concepto": "A", "valor": 70.0}]
