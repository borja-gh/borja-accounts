from typing import Protocol

from domain.entities import Account, Movement


class MovementRepository(Protocol):
    def load(self, account_id: str) -> list[Movement]:
        """Devuelve los movimientos de la cuenta, ordenados por fecha
        (mergesort estable). Lanza una excepción de infraestructura si la
        cuenta no tiene datos o no se pueden leer."""
        ...

    def save(self, account_id: str, movements: list[Movement]) -> None:
        """Persiste la lista completa de movimientos en el orden dado."""
        ...

    def list_accounts(self) -> list[Account]:
        """Todas las cuentas existentes (N cuentas CASH + M cuentas
        INVESTMENT), en el orden en que se dieron de alta."""
        ...

    def get_account(self, account_id: str) -> Account:
        """La cuenta con ese id. Lanza una excepción de infraestructura si
        no existe."""
        ...

    def create_account(self, account: Account, initial_movement: Movement | None = None) -> None:
        """Da de alta una cuenta nueva (id único) y, si se pasa, su
        movimiento de saldo inicial -- ambos en una única transacción."""
        ...
