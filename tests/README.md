# Golden master

Congela el comportamiento financiero del backend (`app/main.py`) contra un
fixture sintético, para que ningún cambio futuro rompa el cálculo de KPIs,
saldo, apuestas o carteras sin que alguien lo note y lo revise a propósito.
Nació para proteger el refactor Flask+vanilla → FastAPI+React
(`docs/ARCHITECTURE.md` Bloques 0-5, ya cerrados); hoy es la suite de
regresión normal del backend, no infraestructura temporal.

La mitad que comparaba contra el vanilla (`index.html`, `run_frontend_harness.mjs`,
`test_frontend_matches_snapshot`) se retiró: ya no aportaba nada que los
tests de componentes React (`frontend/src/**/*.test.tsx`) no cubrieran, y
comparaba contra una tecnología que ya no se sirve. `snapshot_frontend.json`
y `snapshot_frontend_values.json` se conservan como fixtures **congelados y
definitivos** -- ya no tienen generador vivo, pero siguen siendo el
"expected" que consumen esos tests de componentes (ver
`frontend/src/test/goldenMaster.ts` y `extract_frontend_values.py`).

## Piezas

- **`build_fixture.py`** — genera `cash1.example.csv`/`investment1.example.csv` (versionados) a partir de un dataset sintético declarado en el propio script. Cubre: gastos recurrentes en 4+ conceptos a través de 7 meses, nómina, ingreso puntual, devolución sobre un gasto existente, una apuesta abierta y dos cerradas (una ganadora, una perdedora con pérdida total), una inversión abierta y dos cerradas (una ganadora, una perdedora), una transferencia entre cuentas con su ingreso emparejado, y dos movimientos con timestamp idéntico (valida la estabilidad del `mergesort`). Roto desde que `app.py` (Flask original) se eliminó en el Bloque 1 -- ver la nota al principio del propio script.
- **`scenario.py`** — `run_scenario()`: ejecuta una secuencia determinista contra `app/main.py` (FastAPI) real (vía `TestClient`, nunca un servidor HTTP real) sobre una **copia** del fixture en un directorio temporal. Nunca toca `cash1.csv`/`investment1.csv` reales. También siembra `portfolio_holdings` ("Cartera Prueba": AAPL sin cerrar, MSFT con `close_price_usd`/`note` ya rellenos) para ejercitar el modelo de carteras por ticker sin seguimiento de valor de mercado en vivo (ver `docs/ARCHITECTURE.md` §0 y §4). Los nombres `Openbank`/`IBKR` de `_FIXTURE_ACCOUNTS` (líneas 46-58 del propio script) se mantienen a propósito, no es deuda de branding pendiente: `domain/services/transfers.py` deriva el label de transferencia del `Concepto` literal del CSV del fixture (`build_fixture.py`, roto desde el Bloque 1 y no regenerable hoy), no de `name` — cambiar uno sin el otro rompería esa coincidencia por accidente.
- **`generate_snapshot.py`** — congela `snapshot_backend.json` a partir de `run_scenario()`. Solo se ejecuta a mano cuando un cambio de comportamiento es intencional.
- **`extract_frontend_values.py`** — histórico: así se obtuvo `snapshot_frontend_values.json` a partir del ya retirado `snapshot_frontend.json`. Ya no es re-ejecutable de fondo a fondo (no hay generador vivo de `snapshot_frontend.json`); se conserva como documentación de origen.
- **`test_golden_master.py`** — pytest que regenera `snapshot_backend.json` en memoria (vía `run_scenario()`) y lo compara contra el fichero congelado.

## Por qué el TZ está fijado a `Europe/Madrid` y no a `UTC`

Es la zona horaria real del usuario, y varios cálculos de calendario (`calendarMonthStart`, los filtros `1m`/`3m`/`6m`/`año`) dependen de los componentes de fecha *locales* — fijar `UTC` haría que el golden master validara un comportamiento que nadie experimenta en el navegador real.

**Bug histórico, ya corregido** (ver el commit que corrige `domain/services/kpi.py`, `monthKey()` y `periodSlices()`): `monthKey()` y la rama `kpiType === 'mes'` de `periodSlices` calculaban el "mes anterior" con `new Date(y, m, 1).toISOString().slice(0, 7)`. En un TZ de offset positivo como `Europe/Madrid`, esa conversión a UTC cruza medianoche hacia atrás y resolvía al mes anterior al que realmente correspondía — de forma muy visible en `topMerchantsHtml()` ("Top del mes"), que llegó a mostrar los conceptos del mes **anterior** bajo la etiqueta "este mes". El equivalente en el backend (`domain/services/kpi.py`, ya migrado en el Bloque 4) tenía el mismo bug y se corrigió a la vez. El fix: no pasar por UTC para decidir a qué mes de calendario pertenece una fecha — usar siempre los componentes locales del instante, igual que ya hacía correctamente `calendarMonthStart()`.

Los snapshots capturan el comportamiento **ya corregido**. Cualquier futuro cambio de comportamiento intencional en el backend sigue el mismo protocolo: se regenera `snapshot_backend.json` a mano y el commit documenta los números antes/después. `snapshot_frontend.json`/`snapshot_frontend_values.json` ya no se regeneran nunca (sin generador vivo, ver arriba) — si algún día su contenido dejara de encajar con un cambio de UI intencional, se edita el test de componente afectado, con comentario explicando el porqué (mismo patrón que ya usan `SaldoChart.test.tsx`/`CarterasChart.test.tsx` para sus excepciones conocidas).

## Regenerar (solo tras un cambio de comportamiento intencional y revisado)

```bash
python tests/generate_snapshot.py
```

## Ejecutar

```bash
pytest tests -v
```
