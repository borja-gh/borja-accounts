import re
import unicodedata
from datetime import datetime

from domain.entities import Account, Movement
from domain.exceptions import InvalidAccountError
from domain.services.ledger import LedgerService
from domain.value_objects import AccountKind


def _slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-")
    return slug or "cuenta"


class CreateAccountUseCase:
    def __init__(self, repository, ledger: LedgerService):
        self.repository = repository
        self.ledger = ledger

    def execute(self, data: dict) -> Account:
        name = (data.get("name") or "").strip()
        if not name:
            raise InvalidAccountError("El nombre de la cuenta no puede estar vacío")

        kind_raw = data.get("kind", "")
        try:
            kind = AccountKind(kind_raw)
        except ValueError:
            raise InvalidAccountError(f"Tipo de cuenta '{kind_raw}' no válido")

        try:
            initial_balance = float(data.get("initialBalance") or 0)
        except (TypeError, ValueError):
            raise InvalidAccountError("Saldo inicial inválido")

        existing_ids = {a.id for a in self.repository.list_accounts()}
        base_slug = _slugify(name)
        account_id = base_slug
        suffix = 2
        while account_id in existing_ids:
            account_id = f"{base_slug}-{suffix}"
            suffix += 1

        account = Account(id=account_id, name=name, kind=kind)

        initial_movement = None
        if initial_balance != 0:
            movimiento = Movement(
                account_id=account_id, occurred_at=datetime.now(),
                type="Saldo Inicial", concept="Apertura de cuenta", amount=initial_balance,
            )
            initial_movement = self.ledger.recalculate_balances([movimiento])[0]

        self.repository.create_account(account, initial_movement)

        return account
