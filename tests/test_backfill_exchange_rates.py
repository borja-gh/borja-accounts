import hashlib
import json
import os
import sqlite3
import sys
from datetime import datetime

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from application.use_cases.create_account import CreateAccountUseCase
from domain.entities import Movement
from domain.services.ledger import LedgerService
from infrastructure.persistence.sqlite.repository import SQLiteMovementRepository
from scripts import backfill_exchange_rates


@pytest.fixture
def database(tmp_path):
    db_path = tmp_path / "synthetic.db"
    repository = SQLiteMovementRepository(str(db_path))
    account = CreateAccountUseCase(repository, LedgerService()).execute({
        "name": "Synthetic Investment",
        "kind": "INVESTMENT",
        "currency": "USD",
    })
    movement = Movement(
        account_id=account.id,
        occurred_at=datetime(2026, 1, 2, 12, 30),
        type="Ingreso",
        concept="Synthetic deposit",
        amount=100,
    )
    repository.save(account.id, LedgerService().recalculate_balances([movement]))
    return db_path, repository, account.id, movement.occurred_at


def _write_corrections(path, account_id, occurred_at, amount=100):
    path.write_text(json.dumps([{
        "account_id": account_id,
        "occurred_at": occurred_at.strftime("%Y-%m-%d %H:%M:%S.%f"),
        "concept": "Synthetic deposit",
        "amount": amount,
        "exchange_rate": 1.25,
    }]), encoding="utf-8")


def test_dry_run_validates_without_changing_database_or_creating_backup(monkeypatch, tmp_path, database, capsys):
    db_path, repository, account_id, occurred_at = database
    corrections_path = tmp_path / "corrections.json"
    _write_corrections(corrections_path, account_id, occurred_at)
    monkeypatch.setattr("sys.argv", ["backfill_exchange_rates", "--db-path", str(db_path), "--corrections-file", str(corrections_path)])

    backfill_exchange_rates.main()

    movement = repository.load(account_id)[0]
    assert movement.amount == 100
    assert movement.exchange_rate is None
    assert not (tmp_path / "backups").exists()
    assert "Dry-run" in capsys.readouterr().out


def test_apply_creates_backup_before_persisting_synthetic_correction(monkeypatch, tmp_path, database, capsys):
    db_path, repository, account_id, occurred_at = database
    corrections_path = tmp_path / "corrections.json"
    _write_corrections(corrections_path, account_id, occurred_at)
    monkeypatch.setattr("sys.argv", ["backfill_exchange_rates", "--db-path", str(db_path), "--corrections-file", str(corrections_path), "--apply"])

    backfill_exchange_rates.main()

    movement = repository.load(account_id)[0]
    assert movement.amount == 125
    assert movement.exchange_rate == 1.25
    backups = list((tmp_path / "backups").glob("synthetic.db.pre-exchange-rate-*"))
    assert len(backups) == 1
    backup_movement = SQLiteMovementRepository(str(backups[0])).load(account_id)[0]
    assert backup_movement.amount == 100
    assert backup_movement.exchange_rate is None
    assert "Correcciones aplicadas" in capsys.readouterr().out


def test_apply_rejects_non_unique_match_without_writing_or_backup(monkeypatch, tmp_path, database):
    db_path, repository, account_id, occurred_at = database
    corrections_path = tmp_path / "corrections.json"
    _write_corrections(corrections_path, account_id, occurred_at, amount=999)
    monkeypatch.setattr("sys.argv", ["backfill_exchange_rates", "--db-path", str(db_path), "--corrections-file", str(corrections_path), "--apply"])

    with pytest.raises(SystemExit, match="sin coincidencia única"):
        backfill_exchange_rates.main()

    movement = repository.load(account_id)[0]
    assert movement.amount == 100
    assert movement.exchange_rate is None
    assert not (tmp_path / "backups").exists()


def test_dry_run_does_not_migrate_legacy_database(monkeypatch, tmp_path, database):
    db_path, _, account_id, occurred_at = database
    corrections_path = tmp_path / "corrections.json"
    _write_corrections(corrections_path, account_id, occurred_at)
    with sqlite3.connect(db_path) as connection:
        connection.execute("ALTER TABLE movements DROP COLUMN exchange_rate")
    before = hashlib.sha256(db_path.read_bytes()).digest()
    monkeypatch.setattr("sys.argv", ["backfill_exchange_rates", "--db-path", str(db_path), "--corrections-file", str(corrections_path)])

    backfill_exchange_rates.main()

    assert hashlib.sha256(db_path.read_bytes()).digest() == before


def test_apply_backs_up_legacy_database_before_repository_migration(monkeypatch, tmp_path, database):
    db_path, _, account_id, occurred_at = database
    corrections_path = tmp_path / "corrections.json"
    _write_corrections(corrections_path, account_id, occurred_at)
    with sqlite3.connect(db_path) as connection:
        connection.execute("ALTER TABLE movements DROP COLUMN exchange_rate")
    monkeypatch.setattr("sys.argv", ["backfill_exchange_rates", "--db-path", str(db_path), "--corrections-file", str(corrections_path), "--apply"])

    backfill_exchange_rates.main()

    backup_path = next((tmp_path / "backups").glob("synthetic.db.pre-exchange-rate-*"))
    with sqlite3.connect(backup_path) as backup, sqlite3.connect(db_path) as current:
        backup_columns = {row[1] for row in backup.execute("PRAGMA table_info(movements)")}
        current_columns = {row[1] for row in current.execute("PRAGMA table_info(movements)")}
    assert "exchange_rate" not in backup_columns
    assert "exchange_rate" in current_columns


def test_corrections_file_is_required(monkeypatch):
    monkeypatch.setattr("sys.argv", ["backfill_exchange_rates", "--db-path", "synthetic.db"])

    with pytest.raises(SystemExit) as error:
        backfill_exchange_rates.main()

    assert error.value.code == 2
