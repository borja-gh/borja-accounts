#!/usr/bin/env python3
"""
Corrige retroactivamente las 5 transferencias reales cash1 (EUR) <->
investment1 (USD) registradas antes de que TransferBetweenAccountsUseCase
exigiera un tipo de cambio explícito (ver docs/ARCHITECTURE.md §0,
"Transferencias entre cuentas de distinta divisa").

El importe que ya existe en la BD para cada transferencia (idéntico en
ambas patas hoy) es el valor real en EUR -- el usuario lo registró
mirando siempre el extracto de Openbank (EUR), incluida la única
transferencia en sentido investment1 -> cash1. cash1 no se toca en
ningún caso: su número ya es el correcto. Solo se corrige la pata de
investment1, multiplicando por la tasa EUR/USD de esa fecha exacta para
obtener el equivalente real en USD (la divisa nativa de esa cuenta).

Tasas: referencia diaria del BCE para cada fecha exacta, obtenidas vía la
API pública api.frankfurter.dev (agregador de datos del BCE). 2026-08-30
es domingo -- el BCE no publica esa fecha, se usa el último día hábil
anterior (2026-08-28), igual que hace la propia API.

Reglas de seguridad (mismo patrón que scripts/migrate_csv_to_sqlite.py):
- --dry-run (por defecto): no escribe nada, solo muestra qué cambiaría.
- --apply: escribe de verdad. Antes hace un backup íntegro de la DB en
  backups/accounts.db.pre-exchange-rate-<timestamp>.
- Localiza cada movimiento por (account_id, occurred_at, concept, amount)
  exacto -- si no encuentra una coincidencia exacta, aborta sin tocar nada
  (mejor fallar ruidoso que corregir el movimiento equivocado).
- Solo escribe en investment1. cash1 nunca se abre en modo escritura.

Uso:
    python scripts/backfill_exchange_rates.py --db-path accounts.db
    python scripts/backfill_exchange_rates.py --db-path accounts.db --apply
"""
import argparse
import datetime
import os
import shutil
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

from domain.services.ledger import LedgerService  # noqa: E402
from infrastructure.persistence.sqlite.repository import SQLiteMovementRepository  # noqa: E402

_ACCOUNT = "investment1"

# (occurred_at, concept, amount_eur_actual, tasa_eur_usd_de_esa_fecha)
# amount_corregido_usd = amount_eur_actual * tasa. BCE vía api.frankfurter.dev.
_CORRECTIONS = [
    ("2026-06-05 00:00:00.000000", "Desde OPENBANK", 1000.0, 1.1640),
    ("2026-07-14 00:00:00.000000", "Desde OPENBANK", 500.0, 1.1405),
    ("2026-07-27 00:00:00.000000", "A OPENBANK", 321.58, 1.1389),
    ("2026-07-30 00:00:00.000000", "Desde OPENBANK", 1300.0, 1.1476),
    # 2026-08-30 es domingo, sin cotización BCE -> último hábil 2026-08-28.
    ("2026-08-30 00:00:00.000000", "Desde OPENBANK", 1100.0, 1.1643),
]


def _find_movement(movements, occurred_at, concept, amount):
    matches = [
        m for m in movements
        if m.occurred_at.strftime("%Y-%m-%d %H:%M:%S.%f") == occurred_at
        and m.concept == concept
        and abs(m.amount - amount) < 1e-9
    ]
    if len(matches) != 1:
        raise SystemExit(
            f"Esperaba exactamente 1 movimiento para {_ACCOUNT}/{occurred_at}/{concept}/{amount}, "
            f"encontrados {len(matches)} -- abortando sin tocar nada."
        )
    return matches[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db-path", required=True)
    parser.add_argument("--apply", action="store_true", help="Escribe de verdad (por defecto es dry-run)")
    args = parser.parse_args()

    if not os.path.isfile(args.db_path):
        raise SystemExit(f"No existe {args.db_path}")

    repo = SQLiteMovementRepository(args.db_path)
    ledger = LedgerService()

    movements = repo.load(_ACCOUNT)
    for occurred_at, concept, amount_eur, rate in _CORRECTIONS:
        mov = _find_movement(movements, occurred_at, concept, amount_eur)
        new_amount = round(amount_eur * rate, 2)
        print(f"{_ACCOUNT} · {occurred_at} · {concept!r}: {mov.amount:.2f} -> {new_amount:.2f} (tasa EUR/USD={rate})")
        mov.amount = new_amount
        mov.exchange_rate = rate

    movements.sort(key=lambda m: m.occurred_at)
    old_balance = movements[-1].balance
    ledger.recalculate_balances(movements)
    new_balance = movements[-1].balance
    print(f"\nSaldo final {_ACCOUNT}: {old_balance:.2f} -> {new_balance:.2f}")
    print("cash1: sin cambios.")

    if not args.apply:
        print("\nDry-run -- nada escrito. Repite con --apply para persistir.")
        return

    backups_dir = os.path.join(REPO_ROOT, "backups")
    os.makedirs(backups_dir, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = os.path.join(backups_dir, f"accounts.db.pre-exchange-rate-{timestamp}")
    shutil.copy2(args.db_path, backup_path)
    print(f"\nBackup: {backup_path}")

    repo.save(_ACCOUNT, movements)
    print("Aplicado.")


if __name__ == "__main__":
    main()
