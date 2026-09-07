import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from application.use_cases.create_account import CreateAccountUseCase
from application.use_cases.transfer_between_accounts import TransferBetweenAccountsUseCase
from domain.exceptions import InvalidTransferError
from domain.services.ledger import LedgerService
from infrastructure.persistence.sqlite.repository import SQLiteMovementRepository


@pytest.fixture
def repository():
    fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.remove(db_path)
    yield SQLiteMovementRepository(db_path)
    os.remove(db_path)


@pytest.fixture
def accounts(repository):
    ledger = LedgerService()
    create = CreateAccountUseCase(repository, ledger)
    eur_account = create.execute({"name": "Cuenta EUR", "kind": "CASH", "currency": "EUR", "initialBalance": 1000})
    usd_account = create.execute({"name": "Cuenta USD", "kind": "INVESTMENT", "currency": "USD", "initialBalance": 1000})
    eur_account_2 = create.execute({"name": "Cuenta EUR 2", "kind": "CASH", "currency": "EUR", "initialBalance": 500})
    return eur_account, usd_account, eur_account_2


def _use_case(repository, known_accounts):
    return TransferBetweenAccountsUseCase(repository, LedgerService(), known_accounts)


def test_misma_divisa_no_exige_tipo_de_cambio(repository, accounts):
    eur_account, _, eur_account_2 = accounts
    use_case = _use_case(repository, {eur_account.id, eur_account_2.id})
    saldo_origen, saldo_destino = use_case.execute(
        {"origen": eur_account.id, "destino": eur_account_2.id, "total": 100, "fecha": "2026-12-01"}
    )
    assert saldo_origen == 900
    assert saldo_destino == 600
    movs_destino = repository.load(eur_account_2.id)
    assert movs_destino[-1].amount == 100
    assert movs_destino[-1].exchange_rate is None


def test_distinta_divisa_sin_tipo_de_cambio_lanza_error(repository, accounts):
    eur_account, usd_account, _ = accounts
    use_case = _use_case(repository, {eur_account.id, usd_account.id})
    with pytest.raises(InvalidTransferError):
        use_case.execute({"origen": eur_account.id, "destino": usd_account.id, "total": 100, "fecha": "2026-12-01"})


def test_distinta_divisa_aplica_conversion_y_persiste_el_rate(repository, accounts):
    eur_account, usd_account, _ = accounts
    use_case = _use_case(repository, {eur_account.id, usd_account.id})
    saldo_origen, saldo_destino = use_case.execute(
        {"origen": eur_account.id, "destino": usd_account.id, "total": 100, "fecha": "2026-12-01", "exchangeRate": 1.1}
    )
    assert saldo_origen == 900
    assert saldo_destino == 1110  # 1000 + 100*1.1

    mov_origen = repository.load(eur_account.id)[-1]
    mov_destino = repository.load(usd_account.id)[-1]
    assert mov_origen.amount == 100
    assert mov_origen.exchange_rate == 1.1
    assert mov_destino.amount == 110.0
    assert mov_destino.exchange_rate == 1.1


def test_tipo_de_cambio_invalido_lanza_error(repository, accounts):
    eur_account, usd_account, _ = accounts
    use_case = _use_case(repository, {eur_account.id, usd_account.id})
    with pytest.raises(InvalidTransferError):
        use_case.execute({
            "origen": eur_account.id, "destino": usd_account.id, "total": 100,
            "fecha": "2026-12-01", "exchangeRate": 0,
        })
