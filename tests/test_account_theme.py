import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from application.use_cases.create_account import CreateAccountUseCase
from application.use_cases.update_account_theme import UpdateAccountThemeUseCase
from domain.exceptions import AccountNotFoundError, InvalidAccountError
from domain.services.ledger import LedgerService
from infrastructure.persistence.sqlite.repository import SQLiteMovementRepository


@pytest.fixture
def repository():
    fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.remove(db_path)
    yield SQLiteMovementRepository(db_path)
    os.remove(db_path)


def test_create_account_sin_theme_usa_el_default_por_kind(repository):
    use_case = CreateAccountUseCase(repository, LedgerService())
    cash = use_case.execute({"name": "Cuenta cash", "kind": "CASH"})
    investment = use_case.execute({"name": "Cuenta inversion", "kind": "INVESTMENT"})
    assert cash.theme == "clay"
    assert investment.theme == "forest"


def test_create_account_theme_invalido_lanza_error(repository):
    use_case = CreateAccountUseCase(repository, LedgerService())
    with pytest.raises(InvalidAccountError):
        use_case.execute({"name": "Cuenta rara", "kind": "CASH", "theme": "no-existe"})


def test_update_account_theme_round_trip(repository):
    account = CreateAccountUseCase(repository, LedgerService()).execute({"name": "Cuenta cash", "kind": "CASH"})
    UpdateAccountThemeUseCase(repository).execute(account.id, {"theme": "slate"})
    assert repository.get_account(account.id).theme == "slate"


def test_update_account_theme_cuenta_inexistente(repository):
    with pytest.raises(AccountNotFoundError):
        UpdateAccountThemeUseCase(repository).execute("no-existe", {"theme": "slate"})


def test_update_account_theme_invalido_lanza_error(repository):
    account = CreateAccountUseCase(repository, LedgerService()).execute({"name": "Cuenta cash", "kind": "CASH"})
    with pytest.raises(InvalidAccountError):
        UpdateAccountThemeUseCase(repository).execute(account.id, {"theme": "no-existe"})


def test_ensure_schema_sobre_datos_preexistentes_sin_columna_theme(repository):
    """Simula cash1/investment1 reales: filas ya insertadas antes de que
    existiera la columna theme deben quedar con theme=NULL sin romper
    ensure_schema() en el siguiente arranque."""
    with repository._connect() as conn:
        conn.execute("ALTER TABLE accounts DROP COLUMN theme")
        conn.execute("INSERT INTO accounts (id, name, kind, currency) VALUES ('legacy1', 'Legacy', 'CASH', 'EUR')")

    reopened = SQLiteMovementRepository(repository.db_path)
    account = reopened.get_account("legacy1")
    assert account.theme is None
