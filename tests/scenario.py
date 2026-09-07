"""
Escenario determinista contra la app FastAPI actual (app/main.py), ejecutado
siempre sobre una copia aislada de cash1.example.csv / investment1.example.csv,
importada a una base SQLite temporal — nunca contra los CSV ni la DB
reales. Dos capas de aislamiento a propósito (ver memoria de proyecto sobre
el incidente del Bloque 2): os.chdir(tmp) Y una BORJA_ACCOUNTS_DB apuntando
a un fichero temporal explícito, para que un futuro cambio en cualquiera de
las dos rutas de resolución no abra por accidente el estado real.

`run_scenario()` devuelve un dict serializable que sirve tanto para congelar
el snapshot inicial (generate_snapshot.py) como para compararlo en cada
bloque futuro del refactor (test_golden_master.py). Cualquier cambio de
comportamiento intencional se congela de nuevo ejecutando
`generate_snapshot.py` a mano — nunca se actualiza el snapshot para que un
test en rojo se calle solo.

El snapshot congelado se generó originalmente contra el app.py (Flask) que
existía hasta el Bloque 1, sobre CSV. Que este escenario siga pasando contra
FastAPI + SQLite, sin regenerar el snapshot, ES la prueba de paridad entre
las tres generaciones del backend.

Las cuentas del fixture se llamaban 'openbank'/'ibkr' hasta el commit de
generalización N/M -- se renombraron a 'cash1'/'investment1' (mismo dataset,
mismo kind) para que el fixture no dependa de dos IDs de cuenta específicos.
Ese rename obligó a regenerar los tres snapshots (backend, frontend,
frontend_values); las claves de este dict cambiaron en el mismo commit.
"""
import importlib.util
import os
import shutil
import sys
import tempfile

from fastapi.testclient import TestClient

# Mismo instante que FIXED_NOW en run_frontend_harness.mjs -- ambos harnesses
# deben congelar "ahora" en el mismo punto para que sus resultados casen.
FIXED_REFERENCE_NOW = "2026-07-15T12:00:00+00:00"

# Las cuentas del fixture ya no las siembra ensure_schema() (una DB nueva no
# debe brotar cuentas que nadie pidió, ver domain/value_objects.py y el
# modelo de alta dinámica en app/main.py) -- este harness las crea aquí
# explícitamente, igual que cualquier cuenta real se crea vía POST
# /api/accounts.
#
# `name` se deja como "Openbank"/"IBKR" a propósito (coincide con las
# cuentas reales tras el rename de id: mismo nombre, id nuevo). Esto no es
# solo cosmético -- domain/services/transfers.py deriva el `label` del
# propio Concepto ("Desde OPENBANK" -> "← Openbank"), y ese Concepto es
# texto libre del CSV del fixture (build_fixture.py), no algo calculado a
# partir de `name`. Que "← Openbank" siga apareciendo en
# investment1_transferencias_report_3m es correcto solo porque el dataset
# sintético dice literalmente "OPENBANK" -- si el `name` de aquí cambiara
# sin tocar el Concepto del fixture (o viceversa), dejarían de coincidir
# por accidente, no por diseño.
_FIXTURE_ACCOUNTS = [
    ("cash1", "Openbank", "CASH"),
    ("investment1", "IBKR", "INVESTMENT"),
]


def _load_app_module(repo_root):
    spec = importlib.util.spec_from_file_location("app_under_test", os.path.join(repo_root, "app", "main.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _seed_sqlite_from_fixture(repo_root, csv_dir, db_path):
    sys.path.insert(0, repo_root)
    from domain.entities import Account, PortfolioHolding
    from domain.value_objects import AccountKind
    from infrastructure.persistence.csv.repository import ARCHIVOS, CSVMovementRepository
    from infrastructure.persistence.sqlite.repository import SQLiteMovementRepository

    archivos = {k: os.path.join(csv_dir, v) for k, v in ARCHIVOS.items()}
    csv_repo = CSVMovementRepository(archivos)
    sqlite_repo = SQLiteMovementRepository(db_path)
    for account_id, name, kind in _FIXTURE_ACCOUNTS:
        sqlite_repo.create_account(Account(id=account_id, name=name, kind=AccountKind(kind)))
    for account_id in ARCHIVOS:
        sqlite_repo.save(account_id, csv_repo.load(account_id))

    # "Cartera Tech"/"Cartera Bonos"/"Cartera Global" (investment1.example.csv)
    # se quedan como legado vía movements -- dan cobertura al path histórico
    # (compute_closed_positions) que sigue existiendo para Cartera 1 en
    # producción. "Cartera Prueba" es sintética y da cobertura al modelo de
    # holdings (ver docs/ARCHITECTURE.md): AAPL sigue abierta (sin
    # close_price_usd, pnl None) y MSFT ya se vendió (close_price_usd
    # relleno, pnl calculado, con nota) -- así se ejercita también que el
    # PnL de la cartera se queda en None mientras no estén todas cerradas.
    sqlite_repo.replace_portfolio_holdings("investment1", [
        PortfolioHolding(
            id=0, account_id="investment1", portfolio="Cartera Prueba",
            ticker="AAPL", company="Apple Inc.", shares=10.0, price_usd=100.0,
            capital_usd=1000.0, contributed_at="2026-05-01", source_file="test-fixture",
        ),
        PortfolioHolding(
            id=0, account_id="investment1", portfolio="Cartera Prueba",
            ticker="MSFT", company="Microsoft Corp.", shares=5.0, price_usd=200.0,
            capital_usd=1000.0, contributed_at="2026-05-01", source_file="test-fixture",
            close_price_usd=180.0, note="Vendida con pérdida",
        ),
    ])
    investment1 = sqlite_repo.get_account("investment1")
    investment1.currency = "USD"
    investment1.cash_override = 50.0
    sqlite_repo.update_account(investment1)


def run_scenario(repo_root):
    tmp = tempfile.mkdtemp(prefix="golden_master_")
    try:
        shutil.copy(os.path.join(repo_root, "cash1.example.csv"), os.path.join(tmp, "cash1.csv"))
        shutil.copy(os.path.join(repo_root, "investment1.example.csv"), os.path.join(tmp, "investment1.csv"))
        db_path = os.path.join(tmp, "test.db")
        _seed_sqlite_from_fixture(repo_root, tmp, db_path)

        cwd_before = os.getcwd()
        env_before = os.environ.get("BORJA_ACCOUNTS_DB")
        reference_env_before = os.environ.get("BORJA_ACCOUNTS_REFERENCE_NOW")
        os.chdir(tmp)
        os.environ["BORJA_ACCOUNTS_DB"] = db_path
        os.environ["BORJA_ACCOUNTS_REFERENCE_NOW"] = FIXED_REFERENCE_NOW
        try:
            appmod = _load_app_module(repo_root)
            client = TestClient(appmod.app)

            # GET / debe servir el shell HTML de la app. Hasta el Bloque 5
            # esto comparaba index.html byte a byte -- una vez el fichero
            # servido pasa a ser un build artifact (frontend/dist/index.html,
            # ver app/main.py), su hash cambia en cada `npm run build` y la
            # comparación exacta deja de tener sentido. Se debilita aquí,
            # ANTES de tocar app/main.py, para que el commit que enchufa
            # React sea el único que puede romper esta prueba.
            index_response = client.get("/")
            assert index_response.status_code == 200, "GET / no responde 200"
            assert index_response.headers["content-type"].startswith("text/html"), "GET / no sirve HTML"
            assert '<div id="root">' in index_response.text, "GET / no sirve el shell de la SPA (frontend/dist/index.html)"

            result = {}

            # --- Snapshot A: solo lectura sobre el fixture intacto ---
            result["initial_patrimonio"] = client.get("/api/patrimonio").json()
            result["initial_data_cash1"] = client.get("/api/data/cash1").json()
            result["initial_data_investment1"] = client.get("/api/data/investment1").json()

            # Endpoints de agregación (Bloque 4): el frontend deja de calcular
            # esto localmente y lo consume de aquí. run_frontend_harness.mjs
            # lee estas mismas claves para alimentar las funciones de
            # presentación (kpiCardsHtml, ...) y comparar contra
            # snapshot_frontend.json, que no se regenera.
            result["cash1_kpis_by_period"] = {
                period: client.get(f"/api/accounts/cash1/kpis?period={period}").json()
                for period in ("mes", "trimestre", "año")
            }
            # panelFilters.apuestas por defecto en index.html es {type: '3m'} --
            # coincide con el rango que ya capturó snapshot_frontend.json.
            result["cash1_apuestas_report_3m"] = client.get(
                "/api/accounts/cash1/apuestas?range=3m"
            ).json()
            result["investment1_kpis_by_period"] = {
                period: client.get(f"/api/accounts/investment1/investment-kpis?period={period}").json()
                for period in ("mes", "trimestre", "año")
            }
            # panelFilters.inversiones por defecto en index.html es {type: '3m'}.
            result["investment1_carteras_report_3m"] = client.get(
                "/api/accounts/investment1/carteras?range=3m"
            ).json()
            # panelFilters.transferencias por defecto en index.html es {type: '3m'}.
            result["investment1_transferencias_report_3m"] = client.get(
                "/api/accounts/investment1/transferencias?range=3m"
            ).json()
            result["cash1_gastos_mes_actual"] = client.get(
                "/api/accounts/cash1/gastos-mes-actual"
            ).json()
            # panelFilters.gastos por defecto es {type:'3m'}; gastosMode por defecto es 'media'.
            result["cash1_gastos_ranking_3m_media"] = client.get(
                "/api/accounts/cash1/gastos-ranking?range=3m&mode=media"
            ).json()
            # El harness frontend fuerza panelFilters.{saldo,mensual,gastos,carteras}=
            # {type:'all'} solo para las capturas "*_charts_all" (histórico completo)
            # -- ver run_frontend_harness.mjs.
            result["cash1_gastos_ranking_all_media"] = client.get(
                "/api/accounts/cash1/gastos-ranking?range=all&mode=media"
            ).json()
            result["cash1_saldo_evolucion_all"] = client.get(
                "/api/accounts/cash1/saldo-evolucion?range=all"
            ).json()
            result["cash1_mensual_evolucion_all"] = client.get(
                "/api/accounts/cash1/mensual-evolucion?range=all"
            ).json()
            result["investment1_saldo_evolucion_all"] = client.get(
                "/api/accounts/investment1/saldo-evolucion?range=all"
            ).json()
            # carterasMode por defecto en index.html es 'total' (a diferencia de
            # gastosMode, que es 'media').
            result["investment1_carteras_ranking_all_total"] = client.get(
                "/api/accounts/investment1/carteras-ranking?range=all&mode=total"
            ).json()
            # Rango libre mes/año inicio-fin (ver domain/services/period_filter.py):
            # marzo-mayo 2026, protege el modo "custom" en el golden master.
            result["cash1_saldo_evolucion_custom_mar_may"] = client.get(
                "/api/accounts/cash1/saldo-evolucion?range=custom&year=2026-03:2026-05"
            ).json()
            # Mismo rango libre, ahora como period de los KPIs (ver
            # compute_kpis rama "custom" en domain/services/kpi.py).
            result["cash1_kpis_custom_mar_may"] = client.get(
                "/api/accounts/cash1/kpis?period=custom&year=2026-03:2026-05"
            ).json()

            # --- Snapshot B: secuencia determinista de mutaciones ---
            steps = []

            def call(label, method, path, json_body=None):
                fn = getattr(client, method)
                resp = fn(path, json=json_body) if json_body is not None else fn(path)
                steps.append({
                    "label": label,
                    "method": method.upper(),
                    "path": path,
                    "request": json_body,
                    "status": resp.status_code,
                    "response": resp.json(),
                })

            call("alta_gasto_simple", "post", "/api/movimiento/cash1", {
                "tipo": "Gasto", "concepto": "Test Cafetería", "total": 4.50, "fecha": "2026-07-16",
            })
            call("alta_gasto_para_devolucion", "post", "/api/movimiento/cash1", {
                "tipo": "Gasto", "concepto": "Prueba Devolución X", "total": 30.00, "fecha": "2026-07-16",
            })
            call("alta_devolucion", "post", "/api/movimiento/cash1", {
                "tipo": "Devolución", "concepto": "Prueba Devolución X", "total": 30.00, "fecha": "2026-07-17",
            })
            call("cierre_parcial_cartera_global", "post", "/api/movimiento/investment1", {
                "tipo": "Inversión_r", "concepto": "Cartera Global", "total": 200.00, "fecha": "2026-07-16",
            })

            # idx de "Test Cafetería" tras las altas anteriores: se resuelve leyendo
            # el estado actual en vez de asumir una posición fija.
            data_cash1 = client.get("/api/data/cash1").json()
            idx_cafeteria = next(r["_idx"] for r in data_cash1 if r["Concepto"] == "Test Cafetería")
            # Cambia también la fecha (de 2026-07-16 a 2026-07-14) para
            # ejercitar el reordenamiento + recálculo de saldo tras editar
            # la fecha de un movimiento (ver EditMovementUseCase).
            call("edita_gasto_cafeteria", "put", "/api/movimiento/cash1", {
                "idx": idx_cafeteria, "tipo": "Gasto", "concepto": "Test Cafetería", "total": 5.00,
                "fecha": "2026-07-14",
            })

            call("borra_ultimo_cash1", "delete", "/api/movimiento/cash1")

            # exchangeRate obligatorio desde que TransferBetweenAccountsUseCase
            # exige conversión explícita entre cuentas de distinta divisa
            # (investment1 es USD, cash1 es EUR) -- ver docs/ARCHITECTURE.md §9.
            call("transferencia_investment1_a_cash1", "post", "/api/transferencia", {
                "origen": "investment1", "destino": "cash1", "total": 100.00, "fecha": "2026-07-18",
                "exchangeRate": 0.90,
            })

            result["mutation_steps"] = steps
            result["final_patrimonio"] = client.get("/api/patrimonio").json()
            result["final_data_cash1"] = client.get("/api/data/cash1").json()
            result["final_data_investment1"] = client.get("/api/data/investment1").json()

            return result
        finally:
            os.chdir(cwd_before)
            if env_before is None:
                os.environ.pop("BORJA_ACCOUNTS_DB", None)
            else:
                os.environ["BORJA_ACCOUNTS_DB"] = env_before
            if reference_env_before is None:
                os.environ.pop("BORJA_ACCOUNTS_REFERENCE_NOW", None)
            else:
                os.environ["BORJA_ACCOUNTS_REFERENCE_NOW"] = reference_env_before
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
