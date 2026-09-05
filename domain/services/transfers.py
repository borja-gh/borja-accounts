"""
Traducción de isTransferIn/isTransferOut/ibkrTransfers (index.html):
detección de transferencias por heurística de texto sobre `Concepto` -- no
hay una relación explícita todavía (un `transfer_link_id` real es decisión
de un bloque posterior, ver docs/ARCHITECTURE.md). Originalmente hardcodeada
a "Openbank"/"OB" (una única contraparte posible); generalizada aquí para
N/M cuentas: cualquier "Ingreso" con concepto "Desde <cuenta>" es una
entrada, cualquier "Transferencia" (o concepto "A <cuenta>") es una salida.
El nombre de la contraparte se extrae del propio concepto -- riesgo
conocido y aceptado: un movimiento manual con concepto "Desde algo" que no
sea una transferencia real se clasificaría igual como si lo fuera. Un
`transfer_link_id` explícito eliminaría la ambigüedad, pero es over-kill
para una app de un solo usuario.
"""
from dataclasses import dataclass

from domain.entities import Movement

_IN_PREFIX = "desde "
_OUT_PREFIX = "a "


def is_transfer_in(m: Movement) -> bool:
    if m.type != "Ingreso":
        return False
    return (m.concept or "").lower().startswith(_IN_PREFIX)


def is_transfer_out(m: Movement) -> bool:
    if m.type == "Transferencia":
        return True
    return (m.concept or "").lower().startswith(_OUT_PREFIX)


def _counterpart_label(concept: str, prefix: str) -> str:
    c = concept or ""
    if not c.lower().startswith(prefix):
        return c
    return c[len(prefix):].strip().title()


@dataclass
class TransferItem:
    fecha: str
    dir: str  # 'in' | 'out'
    label: str
    concepto: str
    total: float


def list_transfers(movements: list[Movement]) -> list[TransferItem]:
    items = []
    for m in movements:
        if is_transfer_in(m):
            items.append(TransferItem(
                fecha=m.occurred_at.strftime("%Y-%m-%d %H:%M:%S"), dir="in",
                label=f"← {_counterpart_label(m.concept, _IN_PREFIX)}",
                concepto=m.concept, total=m.amount,
            ))
        elif is_transfer_out(m):
            items.append(TransferItem(
                fecha=m.occurred_at.strftime("%Y-%m-%d %H:%M:%S"), dir="out",
                label=f"→ {_counterpart_label(m.concept, _OUT_PREFIX)}",
                concepto=m.concept, total=m.amount,
            ))
    items.sort(key=lambda t: t.fecha, reverse=True)
    return items
