"""
Detección de transferencias entre cuentas.

Las dos patas nacen con el mismo `transfer_link_id`
(TransferBetweenAccountsUseCase). Un Ingreso solo es transferencia
entrante si lleva ese id: «Desde el trabajo» cuenta como ingreso.
Una Transferencia (tipo) es siempre una salida.

El CSV de import no trae el id: se reconstruye al abrir/guardar SQLite
(ver infrastructure/persistence/sqlite/transfer_links.py).
"""
from dataclasses import dataclass

from domain.entities import Movement


def is_transfer_in(m: Movement) -> bool:
    return m.type == "Ingreso" and m.transfer_link_id is not None


def is_transfer_out(m: Movement) -> bool:
    return m.type == "Transferencia"


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
                label=f"← {_counterpart_label(m.concept, 'desde ')}",
                concepto=m.concept, total=m.amount,
            ))
        elif is_transfer_out(m):
            items.append(TransferItem(
                fecha=m.occurred_at.strftime("%Y-%m-%d %H:%M:%S"), dir="out",
                label=f"→ {_counterpart_label(m.concept, 'a ')}",
                concepto=m.concept, total=m.amount,
            ))
    items.sort(key=lambda t: t.fecha, reverse=True)
    return items
