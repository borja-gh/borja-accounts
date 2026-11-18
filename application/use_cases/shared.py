import math
from datetime import datetime

import pandas as pd

from domain.exceptions import InvalidAmountError, InvalidDateError


# Pérdida total de apuesta: importe recibido 0. El resto de tipos sigue
# exigiendo total > 0 (un Gasto 0 no es un movimiento).
_ALLOW_ZERO_TYPES = {"Apuestas_r"}


def parse_total(data: dict) -> float:
    try:
        total = float(data["total"])
    except (KeyError, TypeError, ValueError):
        raise InvalidAmountError("Importe inválido")
    if math.isnan(total) or math.isinf(total) or total < 0:
        raise InvalidAmountError("El importe debe ser mayor que cero")
    if total == 0 and data.get("tipo") not in _ALLOW_ZERO_TYPES:
        raise InvalidAmountError("El importe debe ser mayor que cero")
    return total


def parse_fecha(data: dict):
    try:
        return pd.to_datetime(data["fecha"]) if data.get("fecha") else datetime.now()
    except Exception:
        raise InvalidDateError("Fecha inválida")


def clean_text(raw) -> str:
    return raw.strip() if isinstance(raw, str) else ""


def optional_positive_number(raw, message: str, decimals: int) -> float | None:
    if raw is None or raw == "":
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise InvalidAmountError(message)
    if not math.isfinite(value) or value <= 0:
        raise InvalidAmountError(message)
    return round(value, decimals)


def optional_non_negative_number(raw, message: str) -> float | None:
    if raw is None or raw == "":
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise InvalidAmountError(message)
    if not math.isfinite(value) or value < 0:
        raise InvalidAmountError(message)
    return round(value, 2)
