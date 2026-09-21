# Arquitectura — estado actual

Panel financiero personal **local**: N cuentas CASH + M cuentas INVESTMENT, un único usuario, **sin autenticación**. FastAPI hexagonal en la **raíz del repo** + frontend React. Puerto **8000**.

Este documento describe lo que **hay**. Lo que no está implementado vive en §2; no es arquitectura vigente.

## 0. Decisiones vigentes

| Decisión | Qué hay hoy | Estado |
|---|---|---|
| Store principal | SQLite vía `MovementRepository`. CSV = import/export + fixture de tests. | **Hecho** |
| Filtros del dashboard | Un PeriodSelector (KPIs) + un RangeFilterBar (gráficos/listas) por vista. No hay filtro independiente por panel. | **Hecho** |
| Limpieza UI | Sin Bal./Crec./ROI Hist., sin media móvil, sin chips Top del mes, sin donut, sin quick-picks. | **Hecho** |
| Frontend | React + TypeScript + Vite en `frontend/`. Hexagonal en la raíz (`app/`, `domain/`, …). | **Hecho** (el layout `backend/` + `frontend/` **no existe**) |
| Puerto | FastAPI en **8000** (`127.0.0.1`). | **Hecho** |
| Composición de carteras | `portfolio_holdings` (una fila por aportación). `close_price_usd` / `note` / `current_price_usd` editables. Una cartera legado cerrada puede seguir en `movements` (`Inversión` / `Inversión_r`) sin ticker. | **Hecho** |
| Precio de mercado | Bajo demanda, yfinance, botón explícito. Nunca un job automático. | **Hecho** |
| Transferencias cross-currency | Tipo de cambio **explícito** (`movements.exchange_rate`), con botón «Consultar ahora» (yfinance). Destino = origen × rate, 2 decimales. Sin aplicar la cotización a ciegas. | **Hecho** |
| Enlace de transferencias | `movements.transfer_link_id`. Un Ingreso es transferencia solo con enlace. Borrar una pata borra la otra. CSV legado se re-enlaza al cargar/guardar. | **Hecho** |
| Alta de holdings | `POST .../portfolio-holdings` desde la UI. Exige caja ≥ capital. Persiste `Inversión` a coste (no mueve saldo). | **Hecho** |
| Fecha de venta | El cierre pide `fecha`; el backend ya la aceptaba. | **Hecho** |
| Divisa interna | Una cuenta no mezcla divisas: todo movimiento en `accounts.currency`. Solo EUR y USD (`_SUPPORTED_CURRENCIES`). | **Hecho** |
| Saldo INVESTMENT | Sin `cash_override`. Saldo = balance final de `build_investment_ledger`. Caja = Saldo − En carteras. En carteras es desglose, no se suma al Saldo. | **Hecho** |
| Tema | `accounts.theme`, 6 paletas, por cuenta (default clay/CASH, forest/INVESTMENT). | **Hecho** |
| Presupuestos CASH | `cash_budgets`, agregado por cuenta y período mensual/anual; gasto real = `Gasto` − `Devolución`. | **Hecho** |
| Asistente SQL | `gemini-3.8-flash` genera una única consulta por petición; SQLite ejecuta en modo read/write y devuelve resultado o error al modelo. | **En implementación** |
| Integración IBKR / CPGW | No hay `BrokerGateway`, ni adapter CPGW, ni órdenes. `clientportal.gw.zip` puede estar en disco y está en `.gitignore`; **no está integrado**. | **No implementado** — §2 |
| Esquema relacional to-be (`transfers`, `assets`, `positions`, `trades`) | No existe. `transfer_link_id` sí, en `movements`. | **Parcial** — §2 |
| Media móvil 30d / `topMerchants` | Eliminados del backend y de la API. | **Hecho** |

## 1. Estado actual

### Layout del repo

No es un monorepo `backend/` + `frontend/`. No existe el directorio `backend/`.

```
borja-accounts/
├── app/main.py              FastAPI: routing, estáticos de frontend/dist/, traducción DomainError → JSON
├── domain/                  Entidades, value objects, servicios puros (sin I/O)
├── application/             Casos de uso + puertos (Protocol)
│   └── ports/
│       ├── repository.py    MovementRepository
│       └── market_data.py   MarketDataProvider (precios on-demand)
├── infrastructure/
│   ├── persistence/sqlite/  Store activo (schema + SQLiteMovementRepository)
│   │                         + ejecutor SQL read/write con límites
│   ├── persistence/csv/     Adapter CSV: import one-off + harness de tests (no es el store de la app)
│   ├── market_data/         YFinanceProvider
│   └── ai/                  Cliente Vertex AI / Gemini
├── frontend/                React + TypeScript + Vite (build → frontend/dist/, servido por FastAPI)
├── tests/                   Golden master del backend (pytest)
└── scripts/                 migrate_csv_to_sqlite.py, backfill_exchange_rates.py
```

Regla de dependencia: `domain` no importa `application`/`infrastructure`. `application` depende de `domain` + puertos. `infrastructure` implementa los puertos. `app/main.py` orquesta casos de uso.

El frontend solo habla con FastAPI (`/api/...`). En `npm run dev`, Vite proxifica `/api` a `127.0.0.1:8000`.

### Esquema SQLite real

Cuatro tablas. **No** existen `transfers`, `portfolios`, `assets`, `positions` ni `trades`.

```
accounts
  id TEXT PK
  name TEXT
  kind TEXT CHECK (CASH | INVESTMENT)
  currency TEXT DEFAULT 'EUR'
  theme TEXT                    -- ALTER TABLE; paletas clay/forest/slate/plum/amber/teal

movements
  id TEXT PK
  account_id TEXT FK → accounts
  occurred_at TEXT
  type TEXT
  concept TEXT
  amount REAL
  balance REAL                  -- persistido por fila; se recalcula entero en cada escritura
  exchange_rate REAL            -- ALTER TABLE; NULL si origen y destino comparten divisa
  transfer_link_id TEXT         -- ALTER TABLE; UUID compartido por las dos patas; NULL si no es transferencia

portfolio_holdings
  id INTEGER PK
  account_id TEXT FK → accounts
  portfolio, ticker, company, shares, price_usd, capital_usd, fee_usd,
  contributed_at, source_file
  close_price_usd, note         -- ALTER TABLE
  current_price_usd             -- ALTER TABLE; precio de mercado bajo demanda (yfinance), no un stream en vivo

cash_budgets
  id INTEGER PK
  account_id TEXT FK → accounts
  period_type TEXT CHECK (month | year)
  year INTEGER
  month INTEGER                  -- 1..12 para month; 0 para year
  amount REAL                    -- importe agregado no negativo
```

`cash_override` existió en `accounts` y se elimina al abrir la DB si aún está (`ALTER TABLE ... DROP COLUMN`). El KPI Saldo de INVESTMENT sale del ledger fusionado (`build_investment_ledger`), no de un snapshot manual.

Las transferencias **no** tienen tabla propia: son dos movimientos (origen `Transferencia`, destino `Ingreso` con concepto `Desde <id>`) enlazados por `transfer_link_id`. Un Ingreso sin enlace (p.ej. «Desde el trabajo») es ingreso real. Borrar una pata borra la otra. El CSV de import se re-enlaza por concepto+día al cargar/guardar (`transfer_links.backfill_transfer_links`).

### Frontend y filtros

Cada vista de cuenta (`CashAccountView` / `InvestmentAccountView`) tiene **dos** controles, no uno por panel:

1. **PeriodSelector** — solo KPIs. CASH: Mes / Trimestre / Año / Personalizado. INVESTMENT: Mes / Trimestre / Año (el backend de investment-kpis no tiene rama `custom`).
2. **RangeFilterBar** — un único rango compartido por gráficos + apuestas (CASH) o gráficos + carteras (INVESTMENT). Default: `Todo` (`all`). Opciones de calendario (`Mes` / `3 meses` / `6 meses` / años) + chip Personalizado. La tabla de movimientos no usa este rango: tiene buscador propio.

Al cambiar de pestaña el componente se remonta (`key={account.id}`): los filtros vuelven al default; no hay estado de filtro vivo por pestaña.

Limpieza de UI ya aplicada: sin chips «Top del mes», sin columnas Bal. Hist. / Crec. Hist. (apuestas) ni Bal. Hist. / ROI Hist. (carteras), sin media móvil 30d **pintada**, sin donut de gastos, sin quick-picks de importe.

### Precios de mercado

Puerto `MarketDataProvider` + adapter `infrastructure/market_data/yfinance_provider.py`. El botón «Precios actuales» llama `POST /api/accounts/{cuenta}/portfolio-holdings/refresh-prices`. Cada ticker se consulta con try/except propio. El PnL de una holding usa `close_price_usd` si ya se vendió; si no, `current_price_usd` (no realizado). El PnL de cartera aparece cuando **todas** sus holdings tienen algún precio.

KPI **Saldo preventa** = Saldo + Σ(valor de mercado − coste) de holdings abiertas con precio; las que no tienen precio (o falló el fetch) se quedan a coste. **En carteras** es siempre a coste.

yfinance no es una API oficial: puede fallar o dar rate-limit por ticker. Riesgo conocido: un ticker que no cotiza en bolsa puede coincidir con el símbolo de otro instrumento y devolver un precio plausible pero incorrecto (caso real documentado: SPCX vs SpaceX).

### CSV

Formato de import/export (`scripts/migrate_csv_to_sqlite.py`), no el store activo. `infrastructure/persistence/csv/` sigue en el árbol porque el harness (`tests/scenario.py`) y el script de migración lo usan.

### Puertos de red

FastAPI en **8000**. El Client Portal Gateway de IBKR, **si** se llegara a usar, tiene **5000** fijado en su `conf.yaml`; por eso la app no ocupa ese puerto. Hoy el gateway no forma parte del runtime.

## 2. No implementado / fuera de alcance

No son «arquitectura objetivo» de este repo. Si se retoman, será trabajo nuevo, no continuidad de un plan de bloques activo.

- **`BrokerGateway`**, adapters CPGW / manual, sync de posiciones, `place_order` / `cancel_order`, frescura `Quote { LIVE, STALE, MANUAL }`.
- **Client Portal Gateway de IBKR** como parte de la app (lectura o escritura). El zip gitignored no cuenta como integración.
- **Monorepo `backend/` + `frontend/`** y el árbol to-be con `interfaces/api/routers`, SQLAlchemy, entidades `Asset`/`Position`/`Portfolio`/`Trade`.
- **Esquema relacional to-be** (`transfers`, `portfolios`, `assets`, `positions`, `trades`; saldo no persistido). `transfer_link_id` en `movements` **sí** está.
- **Trading** (manual confirmado o algorítmico).
- **Multiusuario / autenticación** de la app.
- **Postgres**, colas, cache, DI container, CQRS, event sourcing.
- **Más divisas** que EUR/USD.
- **Dashboard configurable**: sigue en backlog; la composición actual continúa siendo fija por vista.
- **Previsión mensual determinista**: retirada del backlog; las futuras previsiones se plantean dentro de una capa LLM todavía no implementada.
- **Asistente SQL LLM**: en implementación; el modelo genera SQL por petición y el backend devuelve el resultado o el error, con máximo dos intentos.
- **Bloque 6** del plan histórico (IBKR real) y **bloque 7** (empaquetado OSS: LICENSE, CONTRIBUTING, README portable de CPGW): **no hechos**. Los bloques 0–5 (golden master, FastAPI hexagonal, SQLite, lógica en backend, React) **sí**.

El plan de bloques 0–7, el golden-master harness contra `index.html` vanilla / `app.py` Flask, y las secciones antiguas §7/§8 **ya no rigen**. La suite de regresión del backend está en `tests/` (ver `tests/README.md`).

## 3. Inconsistencias conocidas

Las que exigían decisión (gráfico vs KPI, cierre de holding, cobro a 0, heurística de transferencia, En carteras vs Saldo) están **hechas**.

Cerrar un holding (`PUT .../portfolio-holdings/{id}` con `closePrice` y `fecha`) persiste `Inversión` + `Inversión_r` (`{cartera} · {ticker} #{id}`), saca el lote de «En carteras» y el P&L entra en el KPI. `GET /saldo-evolucion` recálcula igual que el KPI. `Apuestas_r` admite total 0. Alta de lote: `POST .../portfolio-holdings` (caja ≥ capital).

**Saldo** = capital a coste del libro (aportaciones ± PnL realizado). Abrir un lote no lo mueve. **En carteras** = capital a coste desplegado (desglose). **Caja** = Saldo − En carteras. No sumar Saldo + En carteras.

## 4. Notas pendientes (sin fecha)

No comprometidas. No son arquitectura vigente.

- Empaquetado OSS (LICENSE, CONTRIBUTING): no hecho.
- Asistente SQL LLM: `POST /api/assistant`, `gemini-3.8-flash`, scope interactivo por petición y modos `read`/`write`; la UI y la evaluación de previsiones siguen pendientes.
