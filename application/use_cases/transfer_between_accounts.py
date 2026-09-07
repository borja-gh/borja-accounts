from domain.entities import Movement
from domain.exceptions import InvalidTransferError
from domain.services.ledger import LedgerService

from .shared import parse_fecha, parse_total


def _parse_exchange_rate(data: dict) -> float | None:
    raw = data.get("exchangeRate")
    if raw is None or raw == "":
        return None
    try:
        rate = float(raw)
    except (TypeError, ValueError):
        raise InvalidTransferError("Tipo de cambio inválido")
    if rate <= 0:
        raise InvalidTransferError("El tipo de cambio debe ser mayor que cero")
    return rate


class TransferBetweenAccountsUseCase:
    def __init__(self, repository, ledger: LedgerService, known_accounts):
        self.repository = repository
        self.ledger = ledger
        self.known_accounts = known_accounts

    def execute(self, data: dict) -> tuple[float, float]:
        origen = data.get("origen", "")
        destino = data.get("destino", "")
        if origen not in self.known_accounts or destino not in self.known_accounts or origen == destino:
            raise InvalidTransferError("Cuentas inválidas")

        total = parse_total(data)
        fecha = parse_fecha(data)

        cuenta_origen = self.repository.get_account(origen)
        cuenta_destino = self.repository.get_account(destino)
        exchange_rate = _parse_exchange_rate(data)

        if cuenta_origen.currency != cuenta_destino.currency:
            if exchange_rate is None:
                raise InvalidTransferError(
                    f"Introduce el tipo de cambio {cuenta_origen.currency}→{cuenta_destino.currency}"
                )
            total_destino = round(total * exchange_rate, 2)
        else:
            exchange_rate = None
            total_destino = total

        # Prepara ambas listas completas antes de escribir ninguna — es la
        # única propiedad de atomicidad que tiene el adapter CSV.
        movs_o = self.repository.load(origen)
        nuevo_o = Movement(account_id=origen, occurred_at=fecha, type="Transferencia",
                            concept=f"A {destino.upper()}", amount=total, exchange_rate=exchange_rate)
        movs_o = self.ledger.recalculate_balances(sorted(movs_o + [nuevo_o], key=lambda m: m.occurred_at))

        movs_d = self.repository.load(destino)
        nuevo_d = Movement(account_id=destino, occurred_at=fecha, type="Ingreso",
                            concept=f"Desde {origen.upper()}", amount=total_destino, exchange_rate=exchange_rate)
        movs_d = self.ledger.recalculate_balances(sorted(movs_d + [nuevo_d], key=lambda m: m.occurred_at))

        self.repository.save(origen, movs_o)
        self.repository.save(destino, movs_d)

        return movs_o[-1].balance, movs_d[-1].balance
