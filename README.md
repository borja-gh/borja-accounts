# Cuentas — Panel de control financiero personal

Interfaz web local para llevar el seguimiento de N cuentas de ahorro (CASH) y M cuentas de inversión (INVESTMENT) -- se dan de alta desde la propia interfaz (pestaña "+ Cuenta" en el selector de cuentas). Permite añadir movimientos, visualizar estadísticas y analizar apuestas/inversiones, con los datos guardados en SQLite. Un CSV por cuenta (nombrado `<id-de-cuenta>.csv`) sigue existiendo como formato de import/export, pero ya no es la base de datos activa (herencia histórica).

Ejemplo de cuentas: `Personal Account 1` (CASH, EUR) e `Investment Account 1` (INVESTMENT, USD). El id interno (p.ej. `personal-account-1`) sale del slug del nombre al crear la cuenta (`CreateAccountUseCase`), no es un valor que se elija a mano.

Un usuario, sin autenticación, solo en `localhost`. La UI habla de cuentas por **nombre** y **kind** (CASH / INVESTMENT), no de marcas de banco. Los nombres `Openbank`/`IBKR` aparecen en el fixture de tests (`tests/scenario.py`) a propósito; el detalle está en `tests/README.md`, no aquí.

---

## Estructura de archivos

```
borja-accounts/
├── app/main.py          ← Backend FastAPI (servidor, API y estático de frontend/dist/)
├── domain/               ← Entidades, value objects, servicios de dominio puros
├── application/           ← Casos de uso + puertos (Protocol) de repositorio y market data
├── infrastructure/        ← Adapter SQLite (store activo), CSV (import/tests), yfinance
├── frontend/             ← Frontend React + TypeScript + Vite (ver frontend/README.md)
│   ├── src/               ← Componentes, features, cliente API
│   └── dist/              ← Build de producción (gitignored, `npm run build`)
├── pyproject.toml        ← Dependencias Python (gestionadas con uv)
├── uv.lock               ← Lockfile de dependencias
├── run.sh                ← Arranque (build de frontend + uv run uvicorn, puerto 8000)
├── accounts.db           ← Base de datos SQLite (en .gitignore, es la que usa la app)
├── backups/               ← Backups con timestamp de accounts.db antes de cada migración de datos reales (en .gitignore)
├── <id-cuenta>.csv       ← Un CSV por cuenta (import/export, ya no activo; en .gitignore)
├── <id-cuenta>.example.csv ← Fixture sintético versionado (mismo formato, sin datos reales)
├── scripts/migrate_csv_to_sqlite.py ← Importa movimientos de los CSV a SQLite (una cuenta ya existente)
├── docs/ARCHITECTURE.md   ← Source of truth de arquitectura (estado actual + decisiones + fuera de alcance)
└── tests/                 ← Suite de regresión del backend (ver tests/README.md)
```

No existe un directorio `backend/`. El layout hexagonal vive en la raíz.

---

## Puesta en marcha

Requiere [uv](https://docs.astral.sh/uv/) (`brew install uv` u otro instalador de su web) y Node.js 20+ (el CI usa Node 20).

```bash
uv sync
(cd frontend && npm install)
./run.sh
```

`run.sh` reconstruye `frontend/dist/` (`npm run build`) y arranca uvicorn en **http://localhost:8000** (abre el navegador cuando el puerto responde). Sin `--reload`: Ctrl+C libera el puerto.

En un clon fresco **no hay `accounts.db`**. La UI muestra un onboarding vacío: crea la primera cuenta con **"+ Cuenta"**. Ese es el arranque. No copies CSVs ni lances el script de migración para ver la app.

### Importar un CSV (opcional; no es el arranque)

`scripts/migrate_csv_to_sqlite.py` solo trae movimientos a una cuenta **ya existente**. El id del fichero (`<id-cuenta>.csv`) debe coincidir con el id de esa cuenta (el slug del nombre al crearla).

```bash
# Ejemplo con los fixtures versionados, después de crear en la UI
# cuentas cuyo id sea cash1 / investment1:
cp cash1.example.csv cash1.csv
cp investment1.example.csv investment1.csv
uv run python scripts/migrate_csv_to_sqlite.py --db-path accounts.db
```

Si no hay cuentas en la BD, el script termina con «cuentas conocidas: ninguna».

---

## Formato de los CSV (import/export)

Cada CSV (uno por cuenta) tiene las mismas cinco columnas. Es el formato que entiende `scripts/migrate_csv_to_sqlite.py`, no la estructura interna de `accounts.db` (ver `docs/ARCHITECTURE.md` §1 para el esquema SQLite real):

| Columna  | Tipo     | Descripción                               |
|----------|----------|-------------------------------------------|
| Fecha    | datetime | Fecha y hora del movimiento               |
| Tipo     | string   | Categoría del movimiento (ver tabla)      |
| Concepto | string   | Descripción libre                         |
| Total    | float    | Importe en la divisa de la cuenta (siempre positivo) |
| Saldo    | float    | Saldo acumulado calculado automáticamente |

> La divisa no es una columna del CSV: vive en `accounts.currency` (p.ej. la cuenta de ejemplo `investment1` es USD, las CASH de ejemplo son EUR). El importe del CSV está siempre en la divisa nativa de esa cuenta -- incluidas las transferencias entrantes desde una cuenta en otra divisa, que se convierten al tipo de cambio introducido al registrar la transferencia (ver "Transferencia entre cuentas" más abajo). Antes de que existiera esa conversión, esas filas se guardaban con el importe crudo de origen sin convertir; el histórico real se corrigió retroactivamente con las tasas BCE de cada fecha -- ver `scripts/backfill_exchange_rates.py`.

---

## Tipos de movimiento

Válidos por `kind` de cuenta, no por cuenta individual -- cualquier cuenta CASH admite los mismos tipos que cualquier otra cuenta CASH, e igual para INVESTMENT (`domain/value_objects.py:TIPOS_POR_KIND`).

### CASH (cuentas de ahorro)

| Tipo interno  | Nombre en UI      | Efecto sobre saldo | Descripción                                |
|---------------|-------------------|--------------------|--------------------------------------------|
| Gasto         | Gasto             | Resta              | Cualquier gasto                            |
| Ingreso       | Ingreso           | Suma               | Entrada puntual de dinero                  |
| Nómina        | Nómina            | Suma               | Ingreso periódico (clases, sueldo...)      |
| Devolución    | Devolución        | Suma               | Reembolso de un gasto previo               |
| Apuestas      | Apuestas          | Resta              | Banca enviada a una ronda de apuestas      |
| Apuestas_r    | Cobro apuesta     | Suma               | Retorno recibido de una ronda de apuestas  |
| Transferencia | Transferencia     | Resta              | Dinero enviado a otra cuenta               |

### INVESTMENT (cuentas de inversión)

| Tipo interno  | Nombre en UI  | Efecto sobre saldo | Descripción                               |
|---------------|---------------|--------------------|--------------------------------------------|
| Gasto         | Gasto         | Resta              | Comisiones u otros gastos                 |
| Ingreso       | Ingreso       | Suma               | Entradas de dinero                        |
| Inversión     | Inversión     | No mueve el saldo  | Acumula invertido por concepto; el dinero sigue contando en el Saldo a coste |
| Inversión_r   | Retorno inv.  | Mueve el neto      | Solo (retorno − invertido de ese concepto), no el retorno bruto |
| Transferencia | Transferencia | Resta              | Dinero enviado a otra cuenta               |

> El nombre en UI es solo visual. El valor que se guarda en el CSV y se valida en el backend siempre es el tipo interno. `Saldo Inicial` existe como tipo interno al crear la cuenta; no se ofrece en el formulario de alta de movimientos.

---

## Lógica de saldo

El saldo se recalcula siempre desde cero (barrido completo) cada vez que se añade, edita o borra un movimiento. Los registros se ordenan por fecha antes del cálculo (`mergesort` estable: si dos movimientos tienen la misma fecha exacta, se respeta el orden de inserción).

**Tipos que suman:** `Ingreso`, `Saldo Inicial`, `Nómina`, `Devolución`, `Apuestas_r`

**Tipos que restan:** todos los demás salvo el par `Inversión`/`Inversión_r` (`Gasto`, `Apuestas`, `Transferencia`)

**`Inversión`/`Inversión_r` son un caso especial, no positivo/negativo simple** (`domain/services/ledger.py::recalculate_balances`): abrir una posición (`Inversión`) **no mueve el saldo** — solo se acumula el capital invertido por concepto —, y cerrarla (`Inversión_r`) solo mueve el saldo por la ganancia o pérdida neta (retorno − invertido), no por el retorno bruto.

**Una cuenta INVESTMENT con `portfolio_holdings` deriva el KPI "Saldo" y el gráfico «Capital aportado · histórico» del mismo ledger fusionado** (`GetSaldoEvolucionUseCase` recálcula; no pinta `movements.balance` crudo). `build_investment_ledger` añade una fila `Inversión` sintética (no persistida) por cartera **abierta**.

---

## Interfaz

### Header

Muestra el patrimonio total **agregado por divisa** (nunca suma EUR + USD en un solo número) y el desglose por cuenta. Con 2 o más cuentas, el botón "⇄ Transferencia" abre el modal de transferencia.

### Selector de cuenta (tabs)

Una pestaña por cuenta (nombre de la cuenta, no una marca fija). Pestaña **"+ Cuenta"** para el alta. Cada vista es CASH o INVESTMENT según `account.kind`; el hero muestra un badge de kind (`Cash` / `Inversión`). Al cambiar de pestaña el componente se remonta (`key={account.id}`): los filtros vuelven a su valor por defecto.

Sin cuentas, un onboarding vacío invita a crear la primera.

---

### Vista CASH

#### KPIs

Cuatro tarjetas. El **PeriodSelector** (esquina del hero: **Mes** / **Trimestre** / **Año** / **Personalizado**) solo afecta a estas tarjetas, no a los gráficos:

- **Saldo actual** — último balance del ledger (siempre el saldo real, **sin filtrar** por período)
- **Ingresos** — `Nómina` + `Ingreso` en el período, **excluyendo** transferencias entrantes (`is_transfer_in`: concepto que empieza por `Desde `)
- **Gastos** — `Gasto` − `Devolución` en el período, acotado a ≥ 0
- **Balance** — ingresos − gastos (ambos ya netos). No es el cambio bruto de saldo: transferencias, apuestas e inversiones no pesan aquí, para que los tres KPIs de flujo cuadren entre sí

(`domain/services/kpi.py`, `net_flows`.)

Cada KPI de ingresos/gastos/balance muestra un delta `↑ +X vs ant.` comparando con el período equivalente anterior. Para gastos la lógica se invierte: bajar es positivo.

Si el gasto del mes calendario actual va por encima (o por debajo) de la media de los 3 meses anteriores con datos, aparece un aviso suave bajo los KPIs (`GastoAlert`), en la divisa de la cuenta.

#### Rango de desglose y apuestas

Un único **RangeFilterBar** compartido por los tres gráficos y por Análisis de apuestas. **Default: `Todo`.** No hay filtro independiente por panel.

Los rangos son **meses de calendario** (no ventanas rodantes de 30/90/180 días). Ejemplo en junio:

- `Mes` — solo junio (desde el día 1)
- `3 meses` — abril + mayo + junio
- `6 meses` — enero … junio
- `Personalizado` — rango de meses inclusive

Opciones (se ocultan si no hay datos en ese rango): `Todo` / `6 meses` / `3 meses` / `Mes` / un botón por cada año con datos / chip Personalizado.

La tabla de movimientos no usa este rango: tiene su propio buscador.

El selector de KPIs **Trimestre** usa los últimos 3 meses de calendario (no un trimestre fiscal fijo).

#### Gráfico: Evolución del saldo

Línea de saldo a lo largo del tiempo, en la divisa de la cuenta. **No se pinta media móvil.** El backend sí calcula `mediaMovil` (30 días) en cuentas CASH (`GET /saldo-evolucion`); la UI la ignora (`SaldoChart.tsx`).

#### Gráfico: Evolución mensual

Barras de ingresos y gastos por mes, con línea de balance neto. Respeta el RangeFilterBar.

#### Gráfico: Gastos por concepto

**Ranking** — barras horizontales con los 20 conceptos `Gasto` mayores. Arranca en modo **Media/mes** (`Mes`→÷1, `3 meses`→÷3, `6 meses`→÷6); también hay **Total**. No hay donut. No hay chips «Top del mes».

#### Análisis de apuestas

KPIs de resumen (lifetime, no afectados por el rango) y dos tablas: posiciones abiertas e historial cerrado.

**Strip de KPIs (lifetime):**

- **Total apostado** — suma de todas las entradas `Apuestas` históricas
- **P&L neto** — balance acumulado de todas las apuestas cerradas
- **Win rate** — porcentaje de apuestas cerradas con balance positivo
- **En juego ahora** — posiciones abiertas (concepto con `Apuestas` pero sin `Cobro apuesta`)

> Los KPIs son siempre históricos completos. El RangeFilterBar solo controla qué filas aparecen en el historial cerrado (por fecha de cierre `fr`).

**Posiciones abiertas** — tabla con las rondas sin cobro. Botón **Cerrar**: modal pre-rellenado (concepto y banca); se introduce el importe recibido y la fecha. Confirmar crea el `Cobro apuesta` (`Apuestas_r`). **0 = pérdida total** (el API lo admite solo en este tipo). Neutro = devolver exactamente la banca.

**Historial cerrado** — columnas: Concepto, Inicio, Cierre, Banca, Devuelto, Balance, Crec. **No hay** Bal. Hist. ni Crec. Hist.

#### Tabla de movimientos y buscador

Por defecto **los últimos 20 movimientos**. Cada fila (salvo `Saldo Inicial` y las filas sintéticas de holdings, que no tienen `_idx`) tiene **Duplicar** (rellena el formulario con fecha de hoy) y **Editar** (modal: fecha, tipo, concepto y total).

Encima hay un **buscador** (tipo / concepto / fecha) contra toda la cuenta. Con búsqueda activa se muestran hasta 500 resultados; **Limpiar** vuelve a los últimos 20.

Clic en un concepto de la tabla filtra por ese concepto. **Repetir último** rellena el formulario con el último movimiento cronológico real.

#### Formulario: Añadir movimiento

A la derecha de la tabla. Autocompletado de concepto por frecuencia (prefijo, case-insensitive).

**Validaciones del servidor:**

- `Devolución`: el concepto debe coincidir con un `Gasto` registrado.
- `Cobro apuesta` (`Apuestas_r`): debe existir un `Apuestas` con el mismo concepto y no debe haber ya un `Cobro apuesta` con ese concepto (cada apuesta solo se puede cerrar una vez).
- `Retorno inv.` (`Inversión_r`): debe existir una `Inversión` con el mismo concepto.

**Autocompletado del concepto:**

- `Cobro apuesta` → apuestas abiertas
- `Devolución` → conceptos de gastos registrados

#### Botón: Borrar último movimiento

Diálogo de confirmación con el último registro cronológico real; si se confirma, lo elimina y recalcula el saldo. No se puede borrar el `Saldo Inicial`.

#### Eliminar cuenta

Botón en el hero. `DELETE /api/accounts/{cuenta}` borra la cuenta y su histórico.

---

### Vista INVESTMENT

Vista de cartera de inversión (no cuenta corriente), en la **divisa de esa cuenta** (`accounts.currency`; el ejemplo `investment1` es USD). El acento visual y el monograma se eligen por cuenta (tema por defecto: forest para cuentas nuevas INVESTMENT, editable en el hero).

Botón **Precios actuales** (`POST .../portfolio-holdings/refresh-prices`, yfinance) y banner con cuántas posiciones se actualizaron / qué tickers fallaron.

#### KPIs (cinco tarjetas)

PeriodSelector: **Mes** / **Trimestre** / **Año** (sin Personalizado). (`KpiCardsInvestment.tsx`, `domain/services/investment_kpi.py`)

- **Saldo** — cash + capital invertido a **coste** (ledger fusionado; no es valor de mercado)
- **Saldo preventa** — Saldo + Σ(valor de mercado − coste) de holdings abiertas que ya tienen `current_price_usd`; las demás se quedan a coste
- **Aportado neto** (período) — transferencias entrantes − salientes en el período (`is_transfer_in` / `is_transfer_out`)
- **En carteras** — capital invertido a coste (snapshot) + recuento de abiertas
- **P&L cerrado** (período) — suma de balances de posiciones `Inversión`/`Inversión_r` cerradas cuya fecha de cierre cae en el período

#### Rango de desglose y carteras

Un único **RangeFilterBar** (default `Todo`) para el gráfico de capital aportado, el ranking por cartera y Análisis de carteras. No hay sección de Transferencias en esta vista.

#### Gráfico: Capital aportado · histórico

Serie de `movements.balance` (capital aportado neto), sin media móvil. No es el valor de mercado del KPI Saldo preventa.

#### Gráfico: Capital por cartera

Ranking de `portfolio_holdings` proyectadas a movimientos sintéticos (`GetCarterasRankingUseCase`). **No incluye** el legado que solo vive en `movements` (`Inversión` / `Inversión_r` sin holdings). Incluye lotes ya cerrados (tienen `close_price_usd`). La UI arranca en modo **Total**.

#### Análisis de carteras

Cada cartera abierta con holdings es una fila expandible: ticker, empresa, precio medio, capital, precio actual (editable a mano o vía «Precios actuales»), PnL, estado, precio de cierre, anotación.

- El **PnL de un ticker** usa el precio de cierre si ya se vendió; si no, el último `current_price_usd`.
- El **PnL de la cartera** aparece cuando **todos** sus tickers tienen algún precio.
- **Cerrar** un lote es una **venta**: pide el precio, guarda `closePrice` y registra `Inversión` (coste) + `Inversión_r` (shares × precio) en el ledger. El saldo se mueve por el P&L neto; el lote sale de «En carteras»; el P&L entra en el KPI «P&L cerrado». El mismo endpoint edita `note` y `currentPrice` sin vender.
- La **anotación** no entra en ningún cálculo.

Una cartera legado (sin filas en `portfolio_holdings`, flujo `Inversión`/`Inversión_r` en `movements`) se muestra sin composición por ticker. El historial filtrado por fecha de cierre aplica a ese legado; las carteras con holdings se cierran holding a holding, no con el modal de cierre de apuestas.

Strip de KPIs de sección: capital invertido (abiertas) + historial cerrado.

#### Movimientos + añadir

Misma potencia que CASH (buscar, editar incluyendo fecha, duplicar, repetir, borrar último, eliminar cuenta).

No hay sección UI de transferencias de la cuenta. El endpoint `GET /api/accounts/{cuenta}/transferencias` existe y lo ejercita el golden master; ninguna vista lo consume.

---

### Cerrar apuesta (modal)

El botón **Cerrar** (solo en **Análisis de apuestas**, vista CASH) abre un modal con concepto y banca (solo lectura), importe recibido y fecha. Crea `Cobro apuesta` (`Apuestas_r`). **0 = pérdida total.**

---

### Transferencia entre cuentas

El botón "⇄ Transferencia" en el header (visible solo con 2 o más cuentas) abre un modal con origen, destino, importe y fecha. Al confirmar, registra:

- `Transferencia` (resta) en la cuenta origen, con el importe en su propia divisa
- `Ingreso` (suma) en la cuenta destino, con el importe convertido a la divisa de esa cuenta

**Si origen y destino tienen divisas distintas**, el modal pide el **tipo de cambio** (obligatorio; lo introduce el usuario -- no hay conversión automática contra una cotización externa). El importe en destino es `total origen × tipo de cambio`, redondeado a 2 decimales. El tipo se persiste en `movements.exchange_rate` en ambas patas. Si las divisas coinciden, no se pide y `exchange_rate` queda `NULL`.

---

## API del backend

Todas las rutas viven en `app/main.py`, que solo enruta y traduce excepciones de dominio (`DomainError` → `{"error": ...}` + `status_code`) — la lógica financiera está en `application/use_cases/` + `domain/services/`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Sirve el build de React (`frontend/dist/index.html`) |
| GET | `/api/patrimonio` | Saldo actual de todas las cuentas (`{id: saldo}`) |
| GET | `/api/accounts` | Lista con `id`/`name`/`kind`/`currency`/`theme`/`saldo` |
| POST | `/api/accounts` | Alta de cuenta (+ `Saldo Inicial`) |
| PUT | `/api/accounts/{cuenta}` | Cambia el `theme` |
| DELETE | `/api/accounts/{cuenta}` | Borra la cuenta y su histórico |
| GET | `/api/data/{cuenta}` | Movimientos JSON (incluye `_idx` en filas reales; las sintéticas de holdings no tienen `_idx`) |
| GET | `/api/accounts/{cuenta}/kpis` | KPIs CASH (saldo, ingresos, gastos, balance + deltas). `period=mes\|trimestre\|año\|custom` |
| GET | `/api/accounts/{cuenta}/investment-kpis` | KPIs INVESTMENT (saldo, **saldoPreventa**, aportado, en carteras, PnL + deltas) |
| GET | `/api/accounts/{cuenta}/saldo-evolucion` | Serie temporal de saldo. En CASH el JSON puede incluir `mediaMovil`; la UI no la usa |
| GET | `/api/accounts/{cuenta}/mensual-evolucion` | Ingresos/gastos por mes |
| GET | `/api/accounts/{cuenta}/carteras-ranking` | Ranking de conceptos `Inversión` (media/total) |
| GET | `/api/accounts/{cuenta}/gastos-mes-actual` | Alerta de gasto del mes + `topMerchants` (los chips no se pintan; solo se usa `alert`) |
| GET | `/api/accounts/{cuenta}/gastos-ranking` | Ranking de conceptos `Gasto` (media/total) |
| GET | `/api/accounts/{cuenta}/transferencias` | Recibido / enviado / neto + lista (heurística de Concepto). **Sin sección UI** |
| GET | `/api/accounts/{cuenta}/carteras` | Holdings abiertas (por ticker) + legado + historial |
| PUT | `/api/accounts/{cuenta}/portfolio-holdings/{id}` | Edita `closePrice` / `note` / `currentPrice` |
| POST | `/api/accounts/{cuenta}/portfolio-holdings/refresh-prices` | Refresca `current_price_usd` de holdings abiertas (yfinance) |
| GET | `/api/accounts/{cuenta}/apuestas` | Abiertas + historial cerrado |
| POST | `/api/movimiento/{cuenta}` | Añade un movimiento y recalcula el saldo |
| PUT | `/api/movimiento/{cuenta}` | Edita tipo / concepto / total / fecha |
| DELETE | `/api/movimiento/{cuenta}` | Borra el último movimiento y recalcula el saldo |
| POST | `/api/transferencia` | Transferencia entre cuentas (`exchangeRate` si las divisas difieren) |

---

## Notas de arquitectura

- **Hexagonal en la raíz**, no monorepo `backend/`. Ver `docs/ARCHITECTURE.md`.
- **Filtros:** PeriodSelector (solo KPIs) + RangeFilterBar (gráficos y listas) por vista. Rangos = meses de calendario. El buscador de movimientos es independiente.
- **KPIs de apuestas/carteras de sección son lifetime.** El rango solo recorta el historial cerrado (fecha de cierre `fr`).
- **`portfolio_holdings.current_price_usd`** se refresca a mano (yfinance). Puede fallar por ticker; un símbolo no cotizado puede colisionar con otro instrumento (ver `docs/ARCHITECTURE.md` §1).
- **Tema por cuenta** (`accounts.theme`, seis paletas). Default por `kind`, editable en el hero.
- **`run.sh`** abre el navegador por defecto y reconstruye `frontend/dist/` antes de arrancar.
- **Saldo chart:** sin media móvil en pantalla. El backend aún calcula `mediaMovil` en CASH.
- **Fechas** en `%Y-%m-%d %H:%M:%S.%f` para ordenamiento estable con `mergesort`.
- **Plotly.js** vía npm (`plotly.js-dist-min`), no CDN.
- Servidor solo en `localhost` (puerto 8000). Sin auth. No exponer a red pública.

---

## Añadir una cuenta nueva

Desde la propia interfaz: pestaña **"+ Cuenta"** (`POST /api/accounts`, `frontend/src/features/accounts/CreateAccountModal.tsx`) — nombre, tipo (CASH/INVESTMENT), divisa (EUR o USD), saldo inicial y tema. No hace falta tocar código ni SQL a mano; `TIPOS_POR_KIND` deriva los tipos del `kind`, no del id.

Si la cuenta nueva va a importar histórico desde un CSV externo: darla de alta primero desde la UI, después `uv run python scripts/migrate_csv_to_sqlite.py --db-path accounts.db` con el `<id-cuenta>.csv` correspondiente ya en la raíz del repo (el script solo trae movimientos a una cuenta ya existente, no crea cuentas).
