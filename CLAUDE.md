# borja-accounts

Panel financiero personal local de un único usuario. No tiene autenticación ni se expone fuera de `localhost`.

## Fuente de verdad

- `docs/ARCHITECTURE.md` describe la arquitectura y las decisiones vigentes.
- `README.md` documenta el comportamiento de producto, las invariantes financieras y la API.
- `tests/README.md` describe el golden master del backend y el protocolo para cambios intencionales de comportamiento.
- Si estos documentos discrepan con el código, comprueba primero la suite de regresión y actualiza la documentación afectada como parte del mismo cambio.

## Stack y layout

- Backend: Python 3.11+, FastAPI y Uvicorn. La aplicación HTTP vive en `app/main.py`.
- Frontend: React, TypeScript y Vite en `frontend/`; `frontend/dist/` se sirve desde FastAPI.
- Persistencia activa: SQLite mediante `SQLiteMovementRepository`. Los CSV son import/export y fixtures de pruebas, no el store de runtime.
- No existe un directorio `backend/` ni un monorepo backend/frontend.

```text
app/                         HTTP, composición y traducción de errores
domain/                      Entidades, value objects y servicios puros
application/use_cases/       Casos de uso
application/ports/           Contratos de infraestructura
infrastructure/              SQLite, CSV de import/tests y yfinance
frontend/                    Cliente React
tests/                       Golden master y regresión backend
```

Regla de dependencias: `domain` no importa `application` ni `infrastructure`; `application` usa `domain` y puertos; `infrastructure` implementa puertos; `app/main.py` compone todo.

## Invariantes de negocio relevantes

- Una cuenta tiene `kind` `CASH` o `INVESTMENT`, una única divisa interna (`EUR` o `USD`) y se crea desde la UI.
- `movements.balance` se recalcula completo en cada escritura. El orden estable por fecha usa `mergesort`; no perder microsegundos de `occurred_at` sin validar el efecto.
- Una transferencia son dos movimientos enlazados por `transfer_link_id`; un `Ingreso` sin ese enlace es ingreso real. Al borrar una pata, se elimina la otra.
- En cuentas INVESTMENT, `Saldo` se deriva de `build_investment_ledger`. `En carteras` es un desglose a coste, no una cifra que se sume al saldo. `Caja = Saldo - En carteras`.
- Las holdings abiertas añaden movimientos `Inversión` sintéticos al ledger; no persistir esas filas como si fueran movimientos originales.
- Los precios y FX de yfinance se consultan bajo demanda y deben ser confirmados por el usuario cuando afecten a una transferencia. No hay refresco automático.

## Fuera de alcance actual

- No hay integración IBKR/Client Portal Gateway, `BrokerGateway`, órdenes ni trading.
- No hay multiusuario, autenticación, Postgres, colas, cache, CQRS ni event sourcing.
- El asistente SQL LLM está en implementación inicial: `gemini-3.8-flash` genera una única consulta por petición y el backend devuelve el resultado o el error después de ejecutarla en SQLite. El modo `read` es de solo lectura; el modo `write` requiere confirmación explícita. No dar al modelo permisos fuera del modo y scope recibidos.

## Backlog vigente

- Presupuestos agregados mensuales/anuales para cuentas CASH: implementados en el commit actual.
- Dashboard configurable por cuenta: aparcado; la composición de módulos sigue siendo fija.
- Previsión mensual determinista: retirada; las previsiones futuras deben vivir dentro de la capa LLM pendiente de diseño.
- Asistente SQL LLM: primera fase en curso; máximo dos intentos de consulta y sin previsiones todavía.

## Desarrollo y verificación

```bash
uv sync
(cd frontend && npm install)
./run.sh

uv run pytest tests/ -q
(cd frontend && npx vitest run)
(cd frontend && npm run build)
```

- Ejecuta comandos TypeScript, Vitest y build desde `frontend/`; no uses `npx tsc` desde la raíz.
- El escenario backend usa una copia temporal de fixtures y no toca los CSV ni la base real.
- Regenera `tests/snapshot_backend.json` únicamente ante un cambio de comportamiento financiero intencional, revisado y documentado.
- `accounts.db`, backups y CSV de datos reales son locales e ignorados por Git. No los sobrescribas durante diagnósticos o pruebas.

## Cambios

- Mantén la lógica financiera fuera de `app/main.py` y del frontend.
- Añade pruebas de regresión para toda regla financiera nueva o modificada.
- No introduzcas abstracciones o infraestructura futura sin un caso de uso vigente.
- Si cambian contratos HTTP, actualiza `frontend/src/api/client.ts`, `frontend/src/api/types.ts`, pruebas y documentación en el mismo cambio.
