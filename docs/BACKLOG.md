# Backlog

Trabajo pendiente. No comprometido salvo que se retome explícitamente.

## Asistente SQL LLM (en curso)

Backend inicial: `POST /api/assistant`, `gemini-3.8-flash`, modos `read`/`write`, scope interactivo por petición, máximo dos intentos de consulta. Sin previsiones todavía.

- Completar UI del asistente y evaluación de previsiones.
- Mejorar exposición en front de respuesta de agente.
- Guardar y reejecutar consultas SQL del agente: flujo **prompt → consulta generada → ver consulta → guardar → lista de consultas guardadas** (título + ejecutar).

## UI / producto

- Dashboard configurable por cuenta (la composición de módulos sigue siendo fija).
- Previsiones futuras dentro de una capa LLM (la previsión mensual determinista quedó retirada).

## Integraciones y broker

- `BrokerGateway`, adapters CPGW / manual, sync de posiciones, `place_order` / `cancel_order`, frescura `Quote { LIVE, STALE, MANUAL }`.
- Client Portal Gateway de IBKR como parte de la app (lectura o escritura). El zip gitignored no cuenta como integración.
- Trading (manual confirmado o algorítmico).
- Bloque 6 del plan histórico (IBKR real).

## Infraestructura / esquema

- Monorepo `backend/` + `frontend/` y árbol to-be con `interfaces/api/routers`, SQLAlchemy, entidades `Asset`/`Position`/`Portfolio`/`Trade`.
- Esquema relacional to-be (`transfers`, `portfolios`, `assets`, `positions`, `trades`; saldo no persistido). `transfer_link_id` en `movements` ya está.
- Multiusuario / autenticación de la app.
- Postgres, colas, cache, DI container, CQRS, event sourcing.
- Más divisas que EUR/USD.

## Otros

- Empaquetado OSS (LICENSE, CONTRIBUTING). Bloque 7 del plan histórico.
