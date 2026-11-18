"""Relación entre títulos, precio medio e invertido de un lote.

shares × price_usd ≈ capital_usd. La igualdad es aproximada: el precio medio
que muestra el broker viene redondeado, así que el producto no cuadra al
céntimo. Con dos de los tres datos el tercero se deriva; al editar, se
recalcula el campo que el usuario no ha tocado.
"""
import math

from domain.exceptions import InvalidAmountError

TOLERANCE_REL = 0.001
TOLERANCE_ABS = 0.01

AMOUNTS_REQUIRED_MESSAGE = "Indica dos de estos datos: títulos, precio medio o invertido"
INCONSISTENT_MESSAGE = "Títulos × precio medio no cuadra con el invertido"


def is_consistent(shares: float, price: float, capital: float) -> bool:
    return abs(shares * price - capital) <= max(TOLERANCE_ABS, TOLERANCE_REL * capital)


def resolve_new_amounts(shares: float | None, price: float | None,
                        capital: float | None) -> tuple[float, float, float]:
    provided = sum(value is not None for value in (shares, price, capital))
    if provided < 2:
        raise InvalidAmountError(AMOUNTS_REQUIRED_MESSAGE)
    if provided == 3:
        if not is_consistent(shares, price, capital):
            raise InvalidAmountError(INCONSISTENT_MESSAGE)
        return shares, price, capital
    if shares is None:
        shares = round(capital / price, 4)
    elif price is None:
        price = round(capital / shares, 4)
    else:
        capital = round(shares * price, 2)
    return shares, price, capital


def resolve_edited_amounts(stored: tuple[float, float, float],
                           requested: tuple[float | None, float | None, float | None]) -> tuple[float, float, float]:
    """Orden (shares, price, capital). Un campo None significa «no enviado».
    Cambiar títulos o invertido recalcula el precio medio; cambiar el precio
    recalcula el invertido; si cambian los tres, deben cuadrar."""
    changed = {
        index for index, (new, old) in enumerate(zip(requested, stored))
        if new is not None and not math.isclose(new, old, rel_tol=0, abs_tol=1e-9)
    }
    if not changed:
        return stored
    shares, price, capital = (
        new if new is not None else old for new, old in zip(requested, stored)
    )
    if 1 not in changed:
        price = round(capital / shares, 4)
    elif 2 not in changed:
        capital = round(shares * price, 2)
    elif 0 not in changed:
        shares = round(capital / price, 4)
    elif not is_consistent(shares, price, capital):
        raise InvalidAmountError(INCONSISTENT_MESSAGE)
    return shares, price, capital
