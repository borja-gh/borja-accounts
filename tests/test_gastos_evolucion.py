from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from domain.entities import Movement
from domain.exceptions import InvalidDateError
from domain.services.gastos_evolucion import compute_gastos_evolucion

TZ = ZoneInfo("Europe/Madrid")
REFERENCE = datetime(2026, 10, 15, tzinfo=TZ)


def movement(date, amount, concept="Comida", subconcept=None, kind="Gasto"):
    return Movement(
        account_id="cash", occurred_at=datetime.fromisoformat(date).replace(tzinfo=TZ),
        type=kind, concept=concept, subconcept=subconcept, amount=amount,
    )


def test_monthly_sum_includes_gaps_and_subtracts_refunds_in_their_subconcept():
    result = compute_gastos_evolucion([
        movement("2026-07-01", 1000, kind="Ingreso"),
        movement("2026-08-31T23:59:59", 10.10, subconcept="Super"),
        movement("2026-08-15", 20.20, subconcept="Super"),
        movement("2026-10-01", 5),
        movement("2026-10-02", 7, subconcept="Otros"),
        movement("2026-10-03", 15, concept="Ocio"),
        movement("2026-10-03", 10, kind="Devolución"),
    ], "all", None, REFERENCE)

    assert result["meses"] == ["2026-07", "2026-08", "2026-09", "2026-10"]
    assert result["gastos"] == [0, 30.3, 0, 17]
    food = result["conceptos"][0]
    assert food["gastos"] == [0, 30.3, 0, 2]
    assert {item["subconcepto"]: item["gastos"] for item in food["subconceptos"]} == {
        "Super": [0, 30.3, 0, 0], "Otros": [0, 0, 0, 7], None: [0, 0, 0, -5],
    }


@pytest.mark.parametrize("range_type,year,months,values", [
    ("3m", None, ["2026-08", "2026-09", "2026-10"], [0, 0, 20]),
    ("1m", None, ["2026-10"], [20]),
    ("custom", "2026-07:2026-09", ["2026-07", "2026-08", "2026-09"], [10, 0, 0]),
    ("custom", "2026-08:2026-08", ["2026-08"], [0]),
])
def test_ranges_keep_zero_months_and_catalog(range_type, year, months, values):
    result = compute_gastos_evolucion([
        movement("2026-07-31", 10), movement("2026-10-01", 20),
    ], range_type, year, REFERENCE)
    assert result["meses"] == months
    assert result["gastos"] == values
    assert result["conceptos"][0]["concepto"] == "Comida"


def test_year_and_empty_account():
    result = compute_gastos_evolucion([], "year", "2025", REFERENCE)
    assert result["meses"] == [f"2025-{month:02d}" for month in range(1, 13)]
    assert result["gastos"] == [0] * 12
    assert result["conceptos"] == []
    assert len(compute_gastos_evolucion([], "year", "2026", REFERENCE)["meses"]) == 10


def test_catalog_is_not_limited_to_ranking_top_twenty():
    result = compute_gastos_evolucion([
        movement("2026-10-01", 1, concept=f"Concept {index}") for index in range(25)
    ], "all", None, REFERENCE)
    assert len(result["conceptos"]) == 25
    assert result["gastos"] == [25]


def test_invalid_custom_range_is_rejected():
    with pytest.raises(InvalidDateError):
        compute_gastos_evolucion([], "custom", "2026-10:2026-01", REFERENCE)


def test_http_report_is_scoped_and_reflects_movement_changes(tmp_path, monkeypatch):
    import importlib.util
    from pathlib import Path

    from fastapi.testclient import TestClient

    monkeypatch.setenv("BORJA_ACCOUNTS_DB", str(tmp_path / "expenses.db"))
    spec = importlib.util.spec_from_file_location(
        "app_expense_evolution_test", Path(__file__).resolve().parents[1] / "app" / "main.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    client = TestClient(module.app)
    first = client.post("/api/accounts", json={"name": "First", "kind": "CASH"}).json()["id"]
    second = client.post("/api/accounts", json={"name": "Second", "kind": "CASH"}).json()["id"]
    item = movement("2026-10-05", 42.50, subconcept="Super")
    item.account_id = first
    module.repository.save(first, [item])
    path = f"/api/accounts/{first}/gastos-evolucion?range=custom&year=2026-09:2026-10"
    result = client.get(path)
    assert result.status_code == 200
    assert result.json()["gastos"] == [0, 42.50]
    assert result.json()["conceptos"][0]["subconceptos"] == [{"subconcepto": "Super", "gastos": [0, 42.50]}]
    assert client.get(f"/api/accounts/{second}/gastos-evolucion").json()["conceptos"] == []
    item.amount = 60
    module.repository.save(first, [item])
    assert client.get(path).json()["gastos"] == [0, 60]
    module.repository.save(first, [])
    assert client.get(path).json()["gastos"] == [0, 0]
    assert client.get("/api/accounts/missing/gastos-evolucion").status_code == 404
    assert client.get(f"/api/accounts/{first}/gastos-evolucion?range=custom&year=invalid").status_code == 400
