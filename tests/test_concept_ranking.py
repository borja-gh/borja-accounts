from datetime import datetime
from zoneinfo import ZoneInfo

from domain.entities import Movement
from domain.services.gastos import compute_gastos_ranking


TZ = ZoneInfo("Europe/Madrid")
REFERENCE = datetime(2026, 10, 15, 12, tzinfo=TZ)


def movement(concept: str, date: str, amount: float, recurrente: bool = False,
             subconcept: str | None = None) -> Movement:
    return Movement(
        account_id="cash",
        occurred_at=datetime.fromisoformat(date).replace(tzinfo=TZ),
        type="Gasto",
        concept=concept,
        amount=amount,
        recurrente=recurrente,
        subconcept=subconcept,
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
        ("Nuevo", 40.0),
        ("Anterior", 30.0),
    ]
    assert [entry["mesesEvaluados"] for entry in result["entries"]] == [3, 3]


def test_media_recurrente_desde_aparicion_y_puntual_sobre_todo_el_registro():
    movements = [
        Movement(
            account_id="cash", occurred_at=datetime(2026, 1, 1, tzinfo=TZ),
            type="Saldo Inicial", concept="Apertura", amount=1000,
        ),
        movement("Recurrente", "2026-04-12", 70, recurrente=True),
        movement("Puntual", "2026-10-12", 70),
    ]

    result = compute_gastos_ranking(movements, "all", None, REFERENCE, "media")
    entries = {entry["concepto"]: entry for entry in result["entries"]}

    assert entries["Recurrente"]["valor"] == 10.0
    assert entries["Recurrente"]["recurrente"] is True
    assert (entries["Recurrente"]["mesesConGasto"], entries["Recurrente"]["mesesEvaluados"]) == (1, 7)
    assert entries["Puntual"]["valor"] == 7.0
    assert entries["Puntual"]["recurrente"] is False
    assert (entries["Puntual"]["mesesConGasto"], entries["Puntual"]["mesesEvaluados"]) == (1, 10)


def test_total_mode_is_unchanged():
    result = compute_gastos_ranking(
        [movement("A", "2026-04-12", 70)], "all", None, REFERENCE, "total"
    )

    assert [(entry["concepto"], entry["valor"]) for entry in result["entries"]] == [
        ("A", 70.0),
    ]


def test_breakdown_groups_subconcepts_without_changing_parent_recurrence_or_average():
    movements = [
        movement("Concierto", "2026-04-12", 70, recurrente=True, subconcept="Artista A"),
        movement("Concierto", "2026-05-12", 20, recurrente=True, subconcept="Artista B"),
        movement("Concierto", "2026-05-13", 10, recurrente=True),
    ]

    result = compute_gastos_ranking(movements, "all", None, REFERENCE, "media")
    entry = result["entries"][0]

    assert entry["valor"] == 14.29
    assert entry["recurrente"] is True
    assert entry["mesesEvaluados"] == 7
    assert entry["desglose"] == [
        {"subconcepto": None, "valor": 1.43},
        {"subconcepto": "Artista A", "valor": 10.0},
        {"subconcepto": "Artista B", "valor": 2.86},
    ]


def test_breakdown_is_omitted_when_only_one_subconcept_value_exists():
    result = compute_gastos_ranking(
        [movement("Café", "2026-10-12", 8, subconcept="Desayuno")],
        "all", None, REFERENCE, "total",
    )

    assert result["entries"][0]["desglose"] == []
