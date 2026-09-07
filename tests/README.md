# Golden master

> Infraestructura **temporal** de la transición (ver `docs/ARCHITECTURE.md` §7).
> Referencia `app.py`/`index.html` (vanilla, ya no servidos) a propósito -- es
> lo que protege el refactor mientras dura. Se retira cuando el refactor se dé
> por cerrado sin reservas; esta carpeta pasa a ser la suite de tests normal
> del proyecto.

Congela el comportamiento actual de `app.py` (Flask) e `index.html` (SPA vanilla)
para que el refactor descrito en `docs/ARCHITECTURE.md` se pueda validar bloque
a bloque sin arriesgar los datos reales (`cash1.csv`/`investment1.csv`, en `.gitignore`).

## Piezas

- **`build_fixture.py`** — genera `cash1.example.csv`/`investment1.example.csv` (versionados) a partir de un dataset sintético declarado en el propio script. Cubre: gastos recurrentes en 4+ conceptos a través de 7 meses, nómina, ingreso puntual, devolución sobre un gasto existente, una apuesta abierta y dos cerradas (una ganadora, una perdedora con pérdida total), una inversión abierta y dos cerradas (una ganadora, una perdedora), una transferencia entre cuentas con su ingreso emparejado, y dos movimientos con timestamp idéntico (valida la estabilidad del `mergesort`). Roto desde que `app.py` (Flask original) se eliminó en el Bloque 1 -- ver la nota al principio del propio script.
- **`scenario.py`** — `run_scenario()`: ejecuta una secuencia determinista contra `app/main.py` (FastAPI) real (vía `TestClient`, nunca un servidor HTTP real) sobre una **copia** del fixture en un directorio temporal. Nunca toca `cash1.csv`/`investment1.csv` reales. También siembra `portfolio_holdings` ("Cartera Prueba": AAPL sin cerrar, MSFT con `close_price_usd`/`note` ya rellenos) para ejercitar el modelo de carteras por ticker sin seguimiento de valor de mercado en vivo (ver `docs/ARCHITECTURE.md` §0 y §4). Los nombres `Openbank`/`IBKR` de `_FIXTURE_ACCOUNTS` (líneas 46-58 del propio script) se mantienen a propósito, no es deuda de branding pendiente: `domain/services/transfers.py` deriva el label de transferencia del `Concepto` literal del CSV del fixture (`build_fixture.py`, roto desde el Bloque 1 y no regenerable hoy), no de `name` — cambiar uno sin el otro rompería esa coincidencia por accidente.
- **`generate_snapshot.py`** — congela `snapshot_backend.json` a partir de `run_scenario()`. Solo se ejecuta a mano cuando un cambio de comportamiento es intencional.
- **`run_frontend_harness.mjs`** — ejecuta el `<script>` inline de `index.html` **verbatim** (extraído por regex, nunca transcrito a mano) dentro de un `vm` context de Node con stubs mínimos de `document`/`Plotly`/`fetch` y el reloj fijado a `Date` = `2026-07-15T12:00:00.000Z`, `TZ=Europe/Madrid`. Toma como fixture los mismos datos que ya devolvió el backend (`snapshot_backend.json`), para no mantener el dataset dos veces. Salida: `snapshot_frontend.json`.
- **`test_golden_master.py`** — pytest que regenera ambos snapshots en memoria y los compara contra los ficheros congelados.

## Por qué el TZ está fijado a `Europe/Madrid` y no a `UTC`

Es la zona horaria real del usuario, y varios cálculos de calendario (`calendarMonthStart`, los filtros `1m`/`3m`/`6m`/`año`) dependen de los componentes de fecha *locales* — fijar `UTC` haría que el golden master validara un comportamiento que nadie experimenta en el navegador real.

**Bug histórico, ya corregido** (ver el commit que corrige `domain/services/kpi.py`, `monthKey()` y `periodSlices()`): `monthKey()` y la rama `kpiType === 'mes'` de `periodSlices` calculaban el "mes anterior" con `new Date(y, m, 1).toISOString().slice(0, 7)`. En un TZ de offset positivo como `Europe/Madrid`, esa conversión a UTC cruza medianoche hacia atrás y resolvía al mes anterior al que realmente correspondía — de forma muy visible en `topMerchantsHtml()` ("Top del mes"), que llegó a mostrar los conceptos del mes **anterior** bajo la etiqueta "este mes". El equivalente en el backend (`domain/services/kpi.py`, ya migrado en el Bloque 4) tenía el mismo bug y se corrigió a la vez. El fix: no pasar por UTC para decidir a qué mes de calendario pertenece una fecha — usar siempre los componentes locales del instante, igual que ya hacía correctamente `calendarMonthStart()`.

Los snapshots (`snapshot_backend.json`, `snapshot_frontend.json`) capturan el comportamiento **ya corregido**. Cualquier futuro cambio de comportamiento intencional sigue el mismo protocolo: se regeneran a mano y el commit documenta los números antes/después.

## Regenerar (solo tras un cambio de comportamiento intencional y revisado)

```bash
python tests/generate_snapshot.py
node tests/run_frontend_harness.mjs > tests/snapshot_frontend.json
```

## Ejecutar

```bash
pytest tests -v
```
