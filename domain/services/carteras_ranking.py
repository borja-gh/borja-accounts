"""Traducción de la parte de cálculo de chartCarteras (index.html, cuenta INVESTMENT)."""
from datetime import datetime

from domain.entities import Movement
from domain.services.concept_ranking import rank_by_concept


def compute_carteras_ranking(movements: list[Movement], range_type: str, year: int | str | None,
                              reference: datetime, mode: str = "media", limit: int = 12,
                              currency_symbol: str = "€") -> dict:
    entries, hover_suffix, _has_items = rank_by_concept(
        movements, "Inversión", range_type, year, reference, mode, limit, currency_symbol=currency_symbol,
    )
    return {
        "entries": [{"concepto": c, "valor": v} for c, v in entries],
        "hoverSuffix": hover_suffix,
    }
