# Cuentas — Panel de control financiero personal

Interfaz web local para llevar el seguimiento de N cuentas de ahorro (CASH) y M cuentas de inversión (INVESTMENT) -- se dan de alta desde la propia interfaz (botón "+ Nueva cuenta" en el header). Permite añadir movimientos, visualizar estadísticas y analizar apuestas/inversiones, con los datos guardados en SQLite. Un CSV por cuenta (nombrado `<id-de-cuenta>.csv`) sigue existiendo como formato de import/export, pero ya no es la base de datos activa.

Cuentas reales hoy: `cash1` (Openbank, CASH, EUR) e `investment1` (IBKR, INVESTMENT, USD).

---

## Estructura de archivos

```
borja-accounts/
├── app/main.py          ← Backend FastAPI (servidor, API y estático de frontend/dist/)
├── domain/               ← Entidades, value objects, servicios de dominio puros
├── application/           ← Casos de uso + puertos (Protocol) de repositorio
├── infrastructure/        ← Adapter SQLite del puerto de repositorio
├── frontend/             ← Frontend React + TypeScript + Vite
│   ├── src/               ← Componentes, features, cliente API
│   └── dist/              ← Build de producción (gitignored, `npm run build`)
├── index.html            ← Frontend vanilla previo al rewrite a React (ya no se sirve;
│                            se conserva solo porque tests/run_frontend_harness.mjs lo
│                            sigue usando como referencia del golden master, ver tests/README.md)
├── pyproject.toml        ← Dependencias Python (gestionadas con uv)
├── uv.lock               ← Lockfile de dependencias
├── run.sh                ← Arranque (build de frontend + uv run uvicorn, puerto 8000)
├── accounts.db           ← Base de datos SQLite (en .gitignore, es la que usa la app)
├── backups/               ← Backups con timestamp de accounts.db antes de cada migración de datos reales (en .gitignore)
├── <id-cuenta>.csv       ← Un CSV por cuenta (import/export, ya no activo; en .gitignore)
├── <id-cuenta>.example.csv ← Fixture sintético versionado (mismo formato, sin datos reales)
├── scripts/migrate_csv_to_sqlite.py ← Importa movimientos de los CSV a SQLite (una cuenta ya existente)
├── docs/ARCHITECTURE.md   ← Historia del refactor a hexagonal + decisiones de dominio (inversión, IBKR)
└── tests/                 ← Golden-master harness (temporal, ver docs/ARCHITECTURE.md §7)
```

---

## Puesta en marcha

Requiere [uv](https://docs.astral.sh/uv/) instalado (`brew install uv` o ver su web).

Requiere también Node.js (frontend en `frontend/`, React + TypeScript + Vite).

```bash
uv sync
(cd frontend && npm install)

# Los CSV con datos reales están en .gitignore (uno por cuenta, <id-cuenta>.csv).
# En un clon nuevo, arranca a partir de los ejemplos:
cp cash1.example.csv cash1.csv
cp investment1.example.csv investment1.csv

# Las cuentas deben existir ya en accounts.db (alta vía POST /api/accounts, o
# ya presentes) antes de importar -- el script solo trae movimientos, no crea
# cuentas. Importa cualquier <id-cuenta>.csv que coincida con una cuenta existente:
uv run python scripts/migrate_csv_to_sqlite.py --db-path accounts.db

./run.sh
```

`run.sh` reconstruye `frontend/dist/` (`npm run build`) antes de arrancar uvicorn, para no servir nunca un build desactualizado.

Abre automáticamente el navegador por defecto en **http://localhost:8000** (también puedes abrirlo a mano).

El servidor corre con `uvicorn` sin `--reload`, para que el puerto se libere limpiamente con Ctrl+C.

---

## Formato de los CSV (import/export)

Cada CSV (uno por cuenta) tiene las mismas cinco columnas. Es el formato que entiende `scripts/migrate_csv_to_sqlite.py`, no la estructura interna de `accounts.db` (ver `docs/ARCHITECTURE.md` §2.1 para el esquema SQLite real):

| Columna  | Tipo     | Descripción                               |
|----------|----------|-------------------------------------------|
| Fecha    | datetime | Fecha y hora del movimiento               |
| Tipo     | string   | Categoría del movimiento (ver tabla)      |
| Concepto | string   | Descripción libre                         |
| Total    | float    | Importe en la divisa de la cuenta (siempre positivo) |
| Saldo    | float    | Saldo acumulado calculado automáticamente |

> La divisa no es una columna del CSV: vive en `accounts.currency` (p.ej. `investment1` es USD, el resto EUR). El importe del CSV siempre está en la divisa nativa de esa cuenta.

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
| Inversión     | Inversión     | Resta              | Dinero enviado a una cartera              |
| Inversión_r   | Retorno inv.  | Suma               | Retorno recibido al cerrar una cartera    |
| Transferencia | Transferencia | Resta              | Dinero enviado a otra cuenta               |

> El nombre en UI es solo visual. El valor que se guarda en el CSV y se valida en el backend siempre es el tipo interno.

---

## Lógica de saldo

El saldo se recalcula siempre desde cero (barrido completo) cada vez que se añade o borra un movimiento. Los registros se ordenan por fecha antes del cálculo (`mergesort` estable: si dos movimientos tienen la misma fecha exacta, se respeta el orden de inserción).

**Tipos que suman:** `Ingreso`, `Saldo Inicial`, `Nómina`, `Devolución`, `Apuestas_r`

**Tipos que restan:** todos los demás salvo el par `Inversión`/`Inversión_r` (`Gasto`, `Apuestas`, `Transferencia`)

**`Inversión`/`Inversión_r` son un caso especial, no positivo/negativo simple** (`domain/services/ledger.py::recalculate_balances`): abrir una posición (`Inversión`) **no mueve el saldo** — solo se acumula el capital invertido por concepto —, y cerrarla (`Inversión_r`) solo mueve el saldo por la ganancia o pérdida neta (retorno − invertido), no por el retorno bruto.

**`investment1` (INVESTMENT) no usa este saldo directamente para el KPI "Saldo".** Sus carteras abiertas viven en `portfolio_holdings` (ver más abajo, "Análisis de carteras"), no como filas `Inversión` en `movements` — el KPI Saldo de esa cuenta es `cash_override` (efectivo real reportado, snapshot manual en `accounts.cash_override`) + capital invertido (coste, no valor de mercado) en holdings abiertas. `movements.balance` de `investment1` sigue existiendo y alimenta el gráfico "Evolución del saldo" (capital aportado histórico), pero ya no es lo que muestra el KPI.

---

## Funcionalidades de la interfaz

> Esta sección describe el comportamiento funcional, que sigue siendo el
> mismo tras el Bloque 5 (rewrite a React) salvo las excepciones listadas
> en `docs/ARCHITECTURE.md` §0 (filtro de rango único por vista en vez de
> uno por panel, sin media móvil 30d, sin "Top del mes", sin quick-picks de
> importe, sin columnas Bal./Crec./ROI Hist.). Pendiente de reescribir a
> fondo con el detalle de UI ya actualizado.

### Header
Muestra el patrimonio total (Openbank + IBKR) y el desglose por cuenta. Contiene el botón de transferencia entre cuentas.

### Selector de cuenta (tabs)
Cambia entre la vista de Openbank y la de IBKR. Cada cuenta mantiene de forma independiente su propio estado de filtros: cambiar de pestaña no resetea ni contamina los filtros de la otra.

---

### Vista Openbank

#### KPIs
Cuatro tarjetas con un selector de período en la esquina superior derecha (**Mes** / **Trimestre** / **Año**):
- **Saldo actual** — último saldo del CSV (siempre el balance real, sin filtrar)
- **Ingresos** — suma exclusivamente de `Nómina` en el período seleccionado
- **Gastos** — suma exclusivamente de `Gasto` en el período seleccionado
- **Balance** — (todos los que suman: `Ingreso`, `Nómina`, `Devolución`, `Apuestas_r`, `Inversión_r`) − (todos los que restan: `Gasto`, `Apuestas`, `Inversión`, `Transferencia`)

Cada KPI de ingresos/gastos/balance muestra un delta `↑ +X€ vs ant.` comparando con el período equivalente anterior (mes anterior, trimestre anterior, año anterior). Para gastos la lógica se invierte: bajar es positivo. Cambiar el período solo actualiza las tarjetas, sin reconstruir la página.

#### Filtros por panel

Cada panel de datos tiene sus propios botones de filtro temporal integrados en su cabecera. Los filtros son independientes entre paneles.

**El filtro por defecto de todos los paneles es `3 meses`.** El panel de gastos arranca además en modo **Media/mes**.

Los rangos son **meses de calendario** (no ventanas rodantes de 30/90/180 días). Ejemplo en junio:
- `Mes` — solo junio (desde el día 1)
- `3 meses` — abril + mayo + junio
- `6 meses` — enero … junio

Opciones disponibles (se ocultan si no hay datos en ese rango):
- `Todo` — todos los registros del historial
- `6 meses` / `3 meses` / `Mes`
- Un botón por cada año con datos registrados

Los paneles con filtro temporal propio son: **Evolución del saldo**, **Evolución mensual**, **Gastos por concepto**, **Análisis de Apuestas** (y en IBKR: **Capital por cartera**, **Transferencias**, **Análisis de carteras**). La tabla de movimientos no usa filtro temporal: tiene su propio buscador.

> Cambiar un filtro de panel actualiza solo ese panel — el formulario de añadir movimientos nunca se reconstruye.

El selector de KPIs **Trimestre** también usa los últimos 3 meses de calendario (no un trimestre fiscal fijo).

#### Gráfico: Evolución del saldo
- Línea de saldo a lo largo del tiempo
- En Openbank: línea discontinua de media móvil 30 días (en IBKR no se muestra)
- Filtro temporal de panel

#### Gráfico: Evolución mensual
Barras verdes (ingresos) y rojas (gastos) por mes, con línea de balance neto. Respeta el filtro temporal del panel.

#### Gráfico: Gastos por concepto
**Ranking** — barras horizontales con los 20 conceptos `Gasto` mayores. Modos **Media/mes** (`Mes`→÷1, `3 meses`→÷3, `6 meses`→÷6) y **Total**. (El donut de peso porcentual que existió aquí se eliminó: dividir por los mismos `n_meses` en modo media no cambiaba las proporciones relativas entre sectores, así que no aportaba una vista distinta al ranking.)

Debajo: **Top del mes** — chips con los conceptos de gasto del mes calendario actual (clic → filtra la tabla de movimientos).

Si el gasto del mes va por encima (o por debajo) de la media de los 3 meses anteriores con datos, aparece un aviso suave bajo los KPIs.

#### Análisis de Apuestas

Sección con KPIs de resumen y dos subsecciones: posiciones abiertas e historial cerrado.

**Strip de KPIs (lifetime, no afectado por el filtro de período):**
- **Total apostado** — suma de todas las entradas `Apuestas` históricas
- **P&L neto** — balance acumulado de todas las apuestas cerradas
- **Win rate** — porcentaje de apuestas cerradas con balance positivo
- **En juego ahora** — posiciones abiertas actuales (concepto con `Apuestas` pero sin `Cobro apuesta`)

> Los KPIs son siempre históricos completos. El filtro de período solo controla qué filas aparecen en la tabla de historial.

**Posiciones abiertas** — tabla con las rondas que todavía no tienen cobro. Botón **Cerrar** en cada fila: abre un modal pre-rellenado con el concepto y la banca, donde se introduce el importe recibido y la fecha de cierre. Al confirmar se crea automáticamente el `Cobro apuesta` (`Apuestas_r`) correspondiente sin necesidad de añadirlo manualmente. Si la pérdida es total, se puede introducir 0 €.

**Historial cerrado** — tabla filtrada por fecha de cierre (`fr`) según el filtro de período activo:

| Columna     | Descripción                                            |
|-------------|--------------------------------------------------------|
| Concepto    | Nombre de la ronda (ej: "B365 - 12")                   |
| Inicio      | Fecha del primer `Apuestas` de esa ronda               |
| Cierre      | Fecha del último `Cobro apuesta` de esa ronda          |
| Banca       | Total apostado en esa ronda                            |
| Devuelto    | Total retornado en esa ronda                           |
| Balance     | Devuelto − Banca                                       |
| Crec.       | Crecimiento porcentual de la banca en esa ronda        |
| Bal. Hist.  | Balance acumulado hasta esa ronda (cumsum histórico)   |
| Crec. Hist. | Crecimiento histórico acumulado respecto a banca total |

#### Tabla de movimientos y buscador
La tabla muestra **los últimos 20 movimientos** por defecto. Cada fila (salvo `Saldo Inicial`) tiene **Duplicar** (rellena el formulario con fecha de hoy) y **Editar** (modal: tipo, concepto y total; la fecha no se cambia).

Encima hay un **buscador** (tipo / concepto / fecha) contra toda la cuenta. Con búsqueda activa se muestran hasta 500 resultados; **Limpiar** vuelve a los últimos 20.

Clic en un concepto de la tabla (o en un chip del top del mes) filtra por ese concepto. **Repetir último** rellena el formulario con el último movimiento cronológico.

#### Formulario: Añadir movimiento
A la derecha de la tabla. Autocompletado de concepto por frecuencia (prefijo, case-insensitive).
**Validaciones del servidor:**
- `Devolución`: el concepto debe coincidir con un `Gasto` registrado.
- `Cobro apuesta` (`Apuestas_r`): debe existir un `Apuestas` con el mismo concepto y no debe haber ya un `Cobro apuesta` con ese concepto (cada apuesta solo se puede cerrar una vez).
- `Retorno inv.` (`Inversión_r`): debe existir una `Inversión` con el mismo concepto.

**Autocompletado del concepto:**
- `Cobro apuesta` → apuestas abiertas (con `Apuestas` pero sin `Cobro apuesta` del mismo concepto)
- `Devolución` → conceptos de gastos registrados

#### Botón: Borrar último movimiento
Muestra un diálogo de confirmación con los detalles del último registro cronológico y, si se confirma, lo elimina y recalcula el saldo. No se puede borrar el `Saldo Inicial`.

---

### Vista IBKR

Vista de **cartera de inversión** (no cuenta corriente), con identidad visual propia (acento verde, monograma IK), en **USD** (`investment1.currency`):

- **KPIs:** Saldo (cash + capital invertido, coste — no valor de mercado) · Aportado neto (transferencias OB↔IBKR en el período) · En carteras (capital invertido, snapshot) · P&L cerrado (período)
- **Evolución del saldo** — traza "Capital aportado · histórico", sin media móvil (viene de `movements.balance`, no del modelo de holdings)
- **Capital por cartera** — ranking de conceptos `Inversión` legado (Media/mes o Total; solo aplica a la cartera histórica sin CSV, ver abajo)
- **Transferencias** — recibido / enviado / neto con Openbank + lista + atajo ⇄
- **Análisis de carteras** — carteras basadas en `portfolio_holdings` (composición real por ticker) + histórico legado, cerrar, historial
- **Movimientos + añadir** — misma potencia que Openbank (buscar, editar, duplicar, repetir)

#### Análisis de carteras

Cada cartera abierta real (importada de los CSV de `~/Desktop/Borja/Proyectos/carteras/` + reconciliada contra el panel de posiciones de IBKR) es una fila expandible con su **composición por ticker** (`portfolio_holdings`): precio medio, capital, precio de cierre y anotación libre. **No hay seguimiento de valor de mercado en vivo** — es un check de compra/cierre, no un tracker:

- El **precio de cierre** (`closePrice`) es un campo editable, vacío hasta que se vende esa aportación concreta. Se guarda al perder el foco (`onBlur`) vía `PUT /api/accounts/{cuenta}/portfolio-holdings/{id}`.
- El **PnL de un ticker** solo aparece cuando se rellena su precio de cierre.
- El **PnL de la cartera completa** solo aparece cuando **todos** sus tickers tienen precio de cierre.
- La **anotación** (`note`) es un campo de texto libre editable igual que el precio de cierre, sin efecto en ningún cálculo.

Una única cartera legado (histórica, sin CSV en `../carteras/`, ya cerrada) sigue viviendo en `movements` como flujo de caja (`Inversión`/`Inversión_r`) — se muestra igual que antes, sin composición por ticker.

Strip de KPIs lifetime + historial filtrado por fecha de cierre (solo aplica al legado: las carteras con holdings se cierran rellenando el precio de cierre de cada ticket, no con el modal de cierre de abajo).

---

### Cerrar apuesta (modal)

El botón **Cerrar** (solo en **Análisis de Apuestas**) abre un modal con concepto y banca (solo lectura), importe recibido (0 € = pérdida total) y fecha. Crea `Cobro apuesta` (`Apuestas_r`) automáticamente. Las carteras basadas en holdings ya no usan este modal — se cierran holding a holding desde "Análisis de carteras" (ver arriba).

---

### Transferencia entre cuentas
El botón "⇄ Transferencia" en el header abre un modal con origen, destino, importe y fecha. Al confirmar, registra automáticamente:
- `Transferencia` (resta) en la cuenta origen con concepto "A IBKR" / "A OPENBANK"
- `Ingreso` (suma) en la cuenta destino con concepto "Desde OPENBANK" / "Desde IBKR"

---

## API del backend

Todas las rutas viven en `app/main.py`, que solo enruta y traduce excepciones de dominio (`DomainError` → `{"error": ...}` + `status_code`) — la lógica financiera está en `application/use_cases/` + `domain/services/`.

| Método | Ruta                                              | Descripción                                          |
|--------|----------------------------------------------------|-------------------------------------------------------|
| GET    | `/`                                                | Sirve el build de React (`frontend/dist/index.html`)  |
| GET    | `/api/patrimonio`                                  | Saldo actual de todas las cuentas (`{id: saldo}`)     |
| GET    | `/api/accounts`                                    | Lista de cuentas con `id`/`name`/`kind`/`currency`/`saldo` |
| POST   | `/api/accounts`                                    | Da de alta una cuenta nueva (+ `Saldo Inicial`)       |
| GET    | `/api/data/{cuenta}`                               | Movimientos JSON (incluye `_idx` por fila)            |
| GET    | `/api/accounts/{cuenta}/kpis`                      | KPIs de cuenta CASH (saldo, ingresos, gastos, balance + deltas) |
| GET    | `/api/accounts/{cuenta}/ibkr-kpis`                  | KPIs de cuenta INVESTMENT (saldo, aportado, en carteras, PnL) |
| GET    | `/api/accounts/{cuenta}/saldo-evolucion`           | Serie temporal de saldo                                |
| GET    | `/api/accounts/{cuenta}/mensual-evolucion`         | Ingresos/gastos por mes                                |
| GET    | `/api/accounts/{cuenta}/carteras-ranking`          | Ranking de conceptos `Inversión` (legado, media/total) |
| GET    | `/api/accounts/{cuenta}/gastos-mes-actual`         | Gastos del mes calendario actual (para el aviso de KPIs) |
| GET    | `/api/accounts/{cuenta}/gastos-ranking`            | Ranking de conceptos `Gasto` (media/total)              |
| GET    | `/api/accounts/{cuenta}/transferencias`            | Transferencias con Openbank (recibido/enviado/neto)     |
| GET    | `/api/accounts/{cuenta}/carteras`                  | Reporte de carteras: holdings abiertas (por ticker) + legado + historial |
| PUT    | `/api/accounts/{cuenta}/portfolio-holdings/{id}`   | Edita `closePrice`/`note` de una holding                |
| GET    | `/api/accounts/{cuenta}/apuestas`                  | Reporte de apuestas: abiertas + historial cerrado       |
| POST   | `/api/movimiento/{cuenta}`                         | Añade un movimiento y recalcula el saldo                |
| PUT    | `/api/movimiento/{cuenta}`                         | Edita tipo/concepto/total (fecha intacta)               |
| DELETE | `/api/movimiento/{cuenta}`                         | Borra el último movimiento y recalcula el saldo         |
| POST   | `/api/transferencia`                               | Registra una transferencia en ambas cuentas             |

---

## Notas de arquitectura

- **Hexagonal.** `domain/` (entidades + servicios puros) no importa nada de `application`/`infrastructure`. `application/` depende solo de `domain` + puertos (`Protocol` en `application/ports/repository.py`). `infrastructure/persistence/sqlite/` es la única implementación real del puerto. Ver `docs/ARCHITECTURE.md` para la historia completa del refactor.
- **Filtros por panel, no por página.** Rangos `Mes` / `3 meses` / `6 meses` = meses de calendario. Cada panel y el buscador tienen estado independiente.
- **KPIs de apuestas/carteras son lifetime.** El filtro de período solo controla el historial cerrado (por fecha de cierre `fr`).
- **`portfolio_holdings` sin seguimiento de valor de mercado en vivo** (decisión explícita, ver `docs/ARCHITECTURE.md` §0 y §4): ninguna tabla de cotizaciones, ningún cálculo de valor de mercado en ningún punto del stack.
- **Identidad por cuenta.** Acento y fondo cambian según `kind`/cuenta (verde para IBKR); monogramas propios por cuenta.
- **`run.sh` abre el navegador por defecto** (`open` en macOS, `xdg-open` en Linux) y reconstruye `frontend/dist/` antes de arrancar.
- **Saldo chart:** sin media móvil en INVESTMENT; media 30d en CASH.
- **Fechas** en `%Y-%m-%d %H:%M:%S.%f` para ordenamiento estable con `mergesort`.
- **Plotly.js** desde CDN.
- Servidor solo en `localhost` (puerto 8000). No exponer a red pública.

---

## Añadir una cuenta nueva

Desde la propia interfaz: botón **"+ Nueva cuenta"** en el header (`POST /api/accounts`, ver `frontend/src/features/accounts/CreateAccountModal.tsx`) — nombre, tipo (CASH/INVESTMENT), divisa y saldo inicial. No hace falta tocar código ni SQL a mano; `TIPOS_POR_KIND` (no `TIPOS_POR_CUENTA`) ya deriva los tipos de movimiento válidos del `kind` de la cuenta, no de su id.

Si la cuenta nueva va a importar histórico desde un CSV externo: darla de alta primero desde la UI, después `uv run python scripts/migrate_csv_to_sqlite.py --db-path accounts.db` con el `<id-cuenta>.csv` correspondiente ya en la raíz del repo (el script solo trae movimientos a una cuenta ya existente, no crea cuentas).
