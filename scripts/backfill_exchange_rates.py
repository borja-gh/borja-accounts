#!/usr/bin/env python3
"""Apply explicit exchange-rate corrections to a SQLite database.

Corrections are provided in a separate JSON file as a list of objects with
account_id, occurred_at, concept, amount, and exchange_rate fields. Amount is
the value currently stored; the corrected amount is amount multiplied by
exchange_rate.

Dry-run is the default. Applying corrections creates a database backup beside
the database before writing.
"""
import argparse
import datetime
import json
import math
import os
import sqlite3
import sys
import tempfile

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

from domain.services.ledger import LedgerService  # noqa: E402
from infrastructure.persistence.sqlite.repository import SQLiteMovementRepository  # noqa: E402


_REQUIRED_FIELDS = {"account_id", "occurred_at", "concept", "amount", "exchange_rate"}


def _load_corrections(path):
    try:
        with open(path, encoding="utf-8") as corrections_file:
            corrections = json.load(corrections_file)
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"No se pudieron leer las correcciones: {exc}") from exc

    if not isinstance(corrections, list) or not corrections:
        raise SystemExit("El archivo de correcciones debe contener una lista JSON no vacía.")

    for index, correction in enumerate(corrections, start=1):
        if not isinstance(correction, dict) or set(correction) != _REQUIRED_FIELDS:
            fields = ", ".join(sorted(_REQUIRED_FIELDS))
            raise SystemExit(f"Corrección {index}: se requieren exactamente estos campos: {fields}.")
        if not all(isinstance(correction[field], str) and correction[field] for field in ("account_id", "occurred_at", "concept")):
            raise SystemExit(f"Corrección {index}: cuenta, fecha y concepto deben ser textos no vacíos.")
        if not isinstance(correction["amount"], (int, float)) or isinstance(correction["amount"], bool):
            raise SystemExit(f"Corrección {index}: amount debe ser numérico.")
        if not isinstance(correction["exchange_rate"], (int, float)) or isinstance(correction["exchange_rate"], bool):
            raise SystemExit(f"Corrección {index}: exchange_rate debe ser numérico.")
        if not math.isfinite(correction["amount"]) or not math.isfinite(correction["exchange_rate"]):
            raise SystemExit(f"Corrección {index}: amount y exchange_rate deben ser finitos.")
        if correction["amount"] <= 0 or correction["exchange_rate"] <= 0:
            raise SystemExit(f"Corrección {index}: amount y exchange_rate deben ser positivos.")

    return corrections


def _find_movement(movements, correction):
    matches = [
        movement for movement in movements
        if movement.occurred_at.strftime("%Y-%m-%d %H:%M:%S.%f") == correction["occurred_at"]
        and movement.concept == correction["concept"]
        and abs(movement.amount - correction["amount"]) < 1e-9
    ]
    if len(matches) != 1:
        raise SystemExit(f"Corrección sin coincidencia única (fila {correction['_row']}): abortando sin cambios.")
    return matches[0]


def _backup_database(db_path):
    db_dir = os.path.dirname(os.path.abspath(db_path))
    backups_dir = os.path.join(db_dir, "backups")
    os.makedirs(backups_dir, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup_path = os.path.join(backups_dir, f"{os.path.basename(db_path)}.pre-exchange-rate-{timestamp}")
    with sqlite3.connect(db_path) as source, sqlite3.connect(backup_path) as destination:
        source.backup(destination)
    return backup_path


def _copy_database(db_path):
    fd, copy_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        with sqlite3.connect(db_path) as source, sqlite3.connect(copy_path) as destination:
            source.backup(destination)
    except Exception:
        os.unlink(copy_path)
        raise
    return copy_path


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db-path", required=True, help="Ruta del fichero SQLite")
    parser.add_argument("--corrections-file", required=True, help="Archivo JSON externo con las correcciones")
    parser.add_argument("--apply", action="store_true", help="Persiste los cambios (por defecto solo valida)")
    args = parser.parse_args()

    if not os.path.isfile(args.db_path):
        raise SystemExit(f"No existe la base de datos indicada: {args.db_path}")

    corrections = _load_corrections(args.corrections_file)
    staged_db_path = _copy_database(args.db_path)
    try:
        staged_repository = SQLiteMovementRepository(staged_db_path)
        accounts = {account.id for account in staged_repository.list_accounts()}
        ledger = LedgerService()
        movements_by_account = {}
        targets = set()

        for index, correction in enumerate(corrections, start=1):
            correction["_row"] = index
            account_id = correction["account_id"]
            if account_id not in accounts:
                raise SystemExit(f"Corrección {index}: la cuenta indicada no existe; abortando sin cambios.")
            if account_id not in movements_by_account:
                movements_by_account[account_id] = staged_repository.load(account_id)
            movement = _find_movement(movements_by_account[account_id], correction)
            if movement.id in targets:
                raise SystemExit(f"Corrección {index}: movimiento duplicado; abortando sin cambios.")
            targets.add(movement.id)
            movement.amount = round(correction["amount"] * correction["exchange_rate"], 2)
            movement.exchange_rate = correction["exchange_rate"]

        for movements in movements_by_account.values():
            movements.sort(key=lambda movement: movement.occurred_at)
            ledger.recalculate_balances(movements)

        print(f"{len(corrections)} correcciones validadas.")
        if not args.apply:
            print("Dry-run: la base indicada no se ha modificado.")
            return

        backup_path = _backup_database(args.db_path)
        print(f"Backup creado: {backup_path}")
        repository = SQLiteMovementRepository(args.db_path)
        for account_id, movements in movements_by_account.items():
            repository.save(account_id, movements)
        print("Correcciones aplicadas.")
    finally:
        os.unlink(staged_db_path)


if __name__ == "__main__":
    main()
