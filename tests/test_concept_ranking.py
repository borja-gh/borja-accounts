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

    entry = result["entries"][0]
    assert (entry["concepto"], entry["valor"]) == ("A", 10.0)
    assert (entry["mesesConGasto"], entry["mesesEvaluados"]) == (1, 7)
    assert entry["desviacion"] == 24.49
    assert result["meses"] == [
        "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]
    assert entry["mensual"] == [70.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]


def test_average_uses_selected_range_for_existing_and_new_concepts():
    movements = [
        movement("Anterior", "2026-01-10", 100),
        movement("Anterior", "2026-10-10", 90),
        movement("Nuevo", "2026-09-10", 60),
        movement("Nuevo", "2026-10-11", 60),
    ]

    result = compute_gastos_ranking(movements, "3m", None, REFERENCE, "media")

    assert [(entry["concepto"], entry["valor"]) for entry in result["entries"]] == [
        ("Nuevo", 60.0),
        ("Anterior", 30.0),
    ]
    assert [entry["mesesEvaluados"] for entry in result["entries"]] == [2, 3]


def test_total_mode_is_unchanged():
    result = compute_gastos_ranking(
        [movement("A", "2026-04-12", 70)], "all", None, REFERENCE, "total"
    )

    assert [(entry["concepto"], entry["valor"]) for entry in result["entries"]] == [
        ("A", 70.0),
    ]
