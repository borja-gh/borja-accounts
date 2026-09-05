#!/usr/bin/env python3
"""
Importa CSVs a SQLite (docs/ARCHITECTURE.md, Bloque 3). Uno por cuenta,
nombrado <account_id>.csv -- generalizado para N cuentas CASH + M cuentas
INVESTMENT (ya no asume exactamente openbank.csv/ibkr.csv). Las cuentas
deben existir de antemano en la DB destino (dadas de alta vía POST
/api/accounts, o ya presentes); este script solo importa movimientos, no
crea cuentas.

Reglas de seguridad:
- Se niega a escribir si la cuenta destino ya tiene movimientos en la DB,
  salvo --force.
- Tras importar, verifica invariantes (recuento de filas, saldo final,
  suma por tipo, secuencia ordenada completa) comparando el CSV leído
  contra lo que queda en SQLite. Si algo no cuadra, revierte la cuenta a
  su estado previo y aborta con un mensaje explícito.
- --dry-run: no escribe nada, solo informa qué haría.
- --csv-dir por defecto es la raíz del repo (ruta absoluta calculada desde
  este script), nunca el cwd del proceso -- una lección de un incidente
  real durante el Bloque 2, ver memoria de proyecto.
- Un CSV cuyo nombre no coincide con ninguna cuenta existente se ignora en
  silencio (puede ser cualquier otro fichero suelto en --csv-dir).

Uso:
    python scripts/migrate_csv_to_sqlite.py --db-path accounts.db --dry-run
    python scripts/migrate_csv_to_sqlite.py --db-path accounts.db
"""
import argparse
import os
import sys
from collections import defaultdict

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

from infrastructure.persistence.csv.repository import CSVMovementRepository  # noqa: E402
from infrastructure.persistence.sqlite.repository import SQLiteMovementRepository  # noqa: E402


def discover_csv_accounts(csv_dir: str, known_account_ids: set[str]) -> dict[str, str]:
    """Mapea account_id -> ruta de CSV, para cada cuenta conocida que tenga
    un <account_id>.csv en csv_dir."""
    found = {}
    for name in os.listdir(csv_dir):
        if not name.endswith(".csv"):
            continue
        account_id = name[:-len(".csv")]
        if account_id in known_account_ids:
            found[account_id] = os.path.join(csv_dir, name)
    return found


def _invariants(movements):
    by_type = defaultdict(float)
    for m in movements:
        by_type[m.type] += m.amount
    return {
        "count": len(movements),
        "final_balance": round(movements[-1].balance, 2) if movements else 0.0,
        "sum_by_type": {k: round(v, 2) for k, v in by_type.items()},
        "sequence": [(str(m.occurred_at), m.type, m.concept, round(m.amount, 2)) for m in movements],
    }


def migrate_account(account_id, csv_repo, sqlite_repo, force, dry_run):
    csv_movements = csv_repo.load(account_id)
    expected = _invariants(csv_movements)

    existing = sqlite_repo.load(account_id)
    if existing and not force:
        raise SystemExit(
            f"'{account_id}' ya tiene {len(existing)} movimientos en {sqlite_repo.db_path}. "
            f"Usa --force para sobrescribir."
        )

    if dry_run:
        print(f"[dry-run] {account_id}: importaría {expected['count']} filas, "
              f"saldo final {expected['final_balance']}")
        return

    sqlite_repo.save(account_id, csv_movements)
    actual = _invariants(sqlite_repo.load(account_id))

    if actual != expected:
        sqlite_repo.save(account_id, existing)  # revierte al estado previo
        raise SystemExit(
            f"Invariantes no coinciden tras importar '{account_id}' -- revertido, "
            f"la DB queda como estaba.\nesperado={expected}\nobtenido={actual}"
        )

    print(f"{account_id}: {expected['count']} filas importadas, "
          f"saldo final {expected['final_balance']} -- OK")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db-path", required=True, help="Ruta del fichero SQLite destino")
    parser.add_argument("--csv-dir", default=REPO_ROOT,
                         help="Directorio con openbank.csv/ibkr.csv (default: raíz del repo)")
    parser.add_argument("--force", action="store_true",
                         help="Sobrescribe si la cuenta ya tiene movimientos en la DB")
    parser.add_argument("--dry-run", action="store_true",
                         help="No escribe nada, solo informa")
    args = parser.parse_args()

    sqlite_repo = SQLiteMovementRepository(args.db_path)
    known_account_ids = {a.id for a in sqlite_repo.list_accounts()}
    archivos = discover_csv_accounts(args.csv_dir, known_account_ids)
    if not archivos:
        raise SystemExit(
            f"Ningún CSV en {args.csv_dir} corresponde a una cuenta existente en {args.db_path} "
            f"(cuentas conocidas: {sorted(known_account_ids) or 'ninguna'})"
        )
    csv_repo = CSVMovementRepository(archivos)

    for account_id in archivos:
        migrate_account(account_id, csv_repo, sqlite_repo, args.force, args.dry_run)


if __name__ == "__main__":
    main()
