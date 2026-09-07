#!/usr/bin/env python3
"""
Corrige retroactivamente los movimientos reales de investment1 (USD) que
se registraron con su importe anotado en EUR en vez de convertir a la
divisa nativa de la cuenta. Objetivo: ninguna cuenta mezcla divisas
internamente -- todas las métricas/movimientos de investment1 quedan en
USD (ver docs/ARCHITECTURE.md §0, "Transferencias entre cuentas de
distinta divisa" y la nota sobre Cartera 1).

Primera tanda (ya aplicada, 2026-09-07): las 5 transferencias reales
cash1<->investment1 -- ver historial de commits, esos movimientos ya NO
coinciden con su importe original y no se repiten aquí.

Segunda tanda (este script): el resto de movimientos reales de
investment1 anotados en EUR -- confirmados uno a uno con el usuario, no
asumidos por concepto:
- Apertura de cuenta (Saldo Inicial, 11/03/2026)
- Ingreso "Openbank" y "Ingreso" "Revolut" (12/03/2026)
- Cartera 1 (Inversión 12/03/2026 + Inversión_r 27/07/2026) -- el legado
  histórico documentado en README/ARCHITECTURE, hasta ahora tratado como
  "EUR por diseño"; deja de ser un caso especial de divisa distinta.
- Ingreso "Dividendos" (30/08/2026)

Tasas: referencia diaria del BCE para cada fecha exacta, vía la API
pública api.frankfurter.dev. Fines de semana sin cotización usan el
último día hábil anterior (la propia API ya lo resuelve así).

Reglas de seguridad (mismo patrón que scripts/migrate_csv_to_sqlite.py):
- --dry-run (por defecto): no escribe nada, solo muestra qué cambiaría.
- --apply: escribe de verdad. Antes hace un backup íntegro de la DB en
  backups/accounts.db.pre-exchange-rate-<timestamp>.
- Localiza cada movimiento por (occurred_at, concept, amount) exacto --
  si no encuentra una coincidencia exacta, aborta sin tocar nada.

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
    ("2026-03-11 12:08:37.886000", "Apertura de cuenta", 300.0, 1.1581),
    ("2026-03-12 10:24:07.357000", "Openbank", 10.0, 1.1547),
    ("2026-03-12 10:41:52.946000", "Revolut", 5.0, 1.1547),
    ("2026-03-12 12:32:58.289000", "Cartera 1", 311.7, 1.1547),
    ("2026-07-27 00:00:00.000000", "Cartera 1", 321.58, 1.1389),
    # 2026-08-30 es domingo, sin cotización BCE -> último hábil 2026-08-28.
    ("2026-08-30 00:00:00.000000", "Dividendos", 40.0, 1.1643),
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
