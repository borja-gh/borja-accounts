"""
Golden master: compara el comportamiento actual del backend (app/main.py)
contra snapshot_backend.json, congelado originalmente contra app.py (Flask)
sobre CSV -- ver docs/ARCHITECTURE.md §7.

Ningún cambio de comportamiento intencional se da por válido si este test
no pasa contra el snapshot ya revisado. Si el cambio es deliberado, se
regenera con generate_snapshot.py y se documenta por qué en el commit —
nunca se regenera solo para que un test en rojo se calle.
"""
import json
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)

sys.path.insert(0, HERE)
from scenario import run_scenario  # noqa: E402


def _load(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return json.load(f)


def test_backend_matches_snapshot():
    expected = _load("snapshot_backend.json")
    actual = run_scenario(REPO_ROOT)
    assert actual == expected


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
