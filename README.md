# Cuentas — Panel de control financiero personal

Interfaz web local para llevar cuentas de ahorro (CASH) e inversión (INVESTMENT). Las cuentas se crean desde la interfaz; los movimientos se guardan en una base SQLite local. Los CSV solo se usan para importar o exportar movimientos.

La aplicación está pensada para un único usuario, sin autenticación, y solo escucha en `127.0.0.1`. El uso básico no requiere Google Cloud ni credenciales.

Consulta [Contribuir](CONTRIBUTING.md) para preparar el entorno de desarrollo y [LICENSE](LICENSE) para los términos de uso.

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
├── run.sh                ← Arranque (build de frontend + uv run uvicorn, puerto 8001)
├── accounts.db           ← Base de datos SQLite (en .gitignore, es la que usa la app)
├── backups/               ← Copias locales de bases de datos (en .gitignore)
├── <id-cuenta>.csv       ← Un CSV por cuenta (import/export, ya no activo; en .gitignore)
├── <id-cuenta>.example.csv ← Fixture sintético versionado (mismo formato, sin datos reales)
├── scripts/migrate_csv_to_sqlite.py ← Importa movimientos de los CSV a SQLite (una cuenta ya existente)
├── docs/info/BACKLOG.md        ← Trabajo pendiente
└── tests/                 ← Suite de regresión del backend (ver tests/README.md)
```

No existe un directorio `backend/`. El layout hexagonal vive en la raíz.

---

## Instalar y arrancar

Requisitos: [uv](https://docs.astral.sh/uv/), Bash 3.2 o posterior y Node.js 24.15 o posterior, dentro de la serie 24. `npm` se instala con Node.js; `uv` instala Python 3.13 para la aplicación. No hace falta instalar Google Cloud CLI ni configurar credenciales para el uso básico.

La matriz de CI es Ubuntu 24.04 x86_64 y macOS 15 arm64; ejecuta pruebas backend con Python 3.11 y 3.13, pruebas y build del frontend con Node.js 24.15.0, y un smoke HTTP del launcher con reinicio y recuperación de SQLite. El launcher usa Python 3.13, instalado por `uv`; la matriz backend no selecciona ni cambia la versión del launcher. La CI usa runners sin escritorio y no sustituye la validación visual de un escritorio Linux ni acredita otras versiones o arquitecturas.

Descarga el archivo `borja-accounts-0.1.0-beta.2.tar.gz` de la [release](https://github.com/borja-gh/borja-accounts/releases/tag/v0.1.0-beta.2), comprueba su suma con `SHA256SUMS` y descomprímelo:

```bash
shasum -a 256 -c SHA256SUMS
tar -xzf borja-accounts-0.1.0-beta.2.tar.gz
cd borja-accounts-0.1.0-beta.2
./run.sh
```

En Linux, usa `sha256sum -c SHA256SUMS` en lugar de `shasum -a 256 -c SHA256SUMS`.

El launcher instala dependencias desde los lockfiles, compila el frontend y sirve la aplicación en **http://127.0.0.1:8001**. Si no hay navegador o escritorio, abre esa URL manualmente; para no intentar abrir el navegador, ejecuta `ACCOUNTS_OPEN_BROWSER=0 ./run.sh`.

En una base vacía, pulsa **+ Crear tu primera cuenta**, elige nombre, tipo (Ahorro o Inversión) y divisa (EUR o USD). El saldo inicial es opcional; si es distinto de cero se registra como movimiento de apertura. El tipo y la divisa no se pueden cambiar después. En la cuenta creada, usa **Añadir movimiento** para registrar el primero. En inversión, **+ Holding** permite registrar las posiciones por ticker. No se cargan datos de ejemplo ni personales automáticamente.

Para parar, pulsa Ctrl+C en la terminal donde está ejecutándose el launcher. Al volver a arrancar, las cuentas y movimientos siguen ahí.

### Datos, actualización y recuperación

La base SQLite se guarda por defecto en `accounts.db` en la raíz del repositorio. Puedes usar otra ruta definiendo `BORJA_ACCOUNTS_DB` antes de arrancar; la interfaz no cambia esa ubicación.

Antes de actualizar, para la aplicación y copia el fichero indicado por `BORJA_ACCOUNTS_DB`, o `accounts.db` si la variable no está configurada, a una ubicación segura fuera del código. Descarga y descomprime la nueva versión en otra carpeta; arráncala indicando la misma ruta absoluta de la base:

```bash
BORJA_ACCOUNTS_DB="/ruta/absoluta/accounts.db" ./run.sh
```

La actualización no modifica intencionadamente la base de datos, pero no crea una copia de seguridad automática. Guarda también los ficheros `-wal` y `-shm` junto a la base si existen. Para recuperar una copia, para la aplicación, guarda aparte la base actual y sus ficheros acompañantes, reemplaza la base por la copia elegida y restaura sus acompañantes; después arranca de nuevo.

La release distribuye un snapshot de fuentes sin historial Git. Usa el archivo de la release para instalar la beta.

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

Cada CSV (uno por cuenta) tiene las mismas cinco columnas. Es el formato que entiende `scripts/migrate_csv_to_sqlite.py`, no la estructura interna de `accounts.db` (esquema en `infrastructure/persistence/sqlite/schema.py`):

| Columna  | Tipo     | Descripción                               |
|----------|----------|-------------------------------------------|
| Fecha    | datetime | Fecha y hora del movimiento               |
| Tipo     | string   | Categoría del movimiento (ver tabla)      |
| Concepto | string   | Descripción libre                         |
| Total    | float    | Importe en la divisa de la cuenta (siempre positivo) |
| Saldo    | float    | Saldo acumulado calculado automáticamente |

> La divisa no es una columna del CSV: vive en `accounts.currency`. El importe está en la divisa nativa de la cuenta, incluidas las transferencias entre cuentas de distinta divisa, que se convierten al tipo de cambio confirmado por el usuario al registrarlas.

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

Muestra los saldos **agregados por divisa nativa** y el desglose por cuenta. Si hay cuentas EUR y USD, añade una estimación del capital total con selector EUR/USD, calculada con el tipo de cambio al contado consultado a yfinance. La estimación no sustituye ni modifica los saldos nativos. Con 2 o más cuentas, el botón "⇄ Transferencia" abre el modal de transferencia.

### Selector de cuenta (tabs)

Una pestaña por cuenta (nombre de la cuenta, no una marca fija). Pestaña **"+ Cuenta"** para el alta. Cada vista es CASH o INVESTMENT según `account.kind`; el hero muestra un badge de kind (`Cash` / `Inversión`). Al cambiar de pestaña el componente se remonta (`key={account.id}`): los filtros vuelven a su valor por defecto.

Sin cuentas, un onboarding vacío invita a crear la primera.

---

### Vista CASH

#### KPIs

Cuatro tarjetas. El **PeriodSelector** (esquina del hero: **Mes** / **Trimestre** / **Año** / **Personalizado**) solo afecta a estas tarjetas, no a los gráficos:

- **Saldo actual** — último balance del ledger (siempre el saldo real, **sin filtrar** por período)
- **Ingresos** — `Nómina` + `Ingreso` en el período, **excluyendo** transferencias entrantes (el `Ingreso` lleva `transfer_link_id`). Un ingreso «Desde el trabajo» cuenta como ingreso.
- **Gastos** — `Gasto` − `Devolución` en el período, conservando valores negativos
- **Balance** — ingresos − gastos (ambos ya netos). No es el cambio bruto de saldo: transferencias, apuestas e inversiones no pesan aquí, para que los tres KPIs de flujo cuadren entre sí

(`domain/services/kpi.py`, `net_flows`.)

Las devoluciones reducen el gasto de su propia fecha, concepto y subconcepto; no se reasignan al mes original. Una devolución sin subconcepto se agrupa en **Otros**. La misma regla se aplica a los KPIs, presupuestos, rankings, comparativas, histogramas y series temporales. Los movimientos conservan su tipo e importe originales. La suma de los netos mensuales coincide con el neto del intervalo completo.

Cada KPI de ingresos/gastos/balance muestra un delta `↑ +X vs ant.` comparando con el período equivalente anterior. Para gastos la lógica se invierte: bajar es positivo.

Si el gasto del mes calendario actual va por encima (o por debajo) de la media de los 3 meses anteriores con datos, aparece un aviso suave bajo los KPIs (`GastoAlert`), en la divisa de la cuenta. La media incluye meses con gastos o devoluciones aunque su neto sea cero o negativo; si la media no es positiva, el aviso muestra importes sin porcentaje.

### Asistente SQL

El asistente consulta la SQLite de la aplicación mediante Vertex AI. En cada petición el usuario elige el modo, el scope y el texto de consulta; no existe una sesión de contexto implícita entre peticiones.

#### Activación explícita

El asistente está desactivado por defecto. **Configurar asistente**, visible también cuando está desactivado, permite indicar el proyecto de Google Cloud y elegir una preferencia global de arranque:

- **Activar por defecto**: comprueba ADC al abrir la aplicación tras arrancar el servidor; si falla, mantiene el producto básico disponible y muestra cómo configurar las credenciales.
- **Desactivado**: no consulta credenciales ni contacta con Vertex AI al arrancar.
- **Preguntar siempre**: al abrir la aplicación tras cada arranque ofrece activarlo o continuar sin asistente, sin pedir credenciales hasta aceptar.

La preferencia y el ID de proyecto se guardan en SQLite; no se guardan claves ni contraseñas. **Guardar preferencia** afecta al próximo arranque. **Activar en esta sesión** y **Desactivar esta sesión** cambian el estado del proceso local sin modificar la preferencia; todas las pestañas comparten esa sesión hasta detener el servidor. Recargar el navegador no inicia otra sesión. La visibilidad del panel dentro de cada cuenta se configura por separado.

Para preparar ADC, instala Google Cloud CLI y ejecuta en Terminal:

```bash
gcloud auth application-default login
```

Después guarda el ID del proyecto en el formulario y activa la sesión. La aplicación valida ADC sin iniciar un login automáticamente. La comprobación de credenciales no verifica permisos del proyecto ni disponibilidad del modelo; esas condiciones se resuelven al realizar una consulta. El modelo permanece en `gemini-3.8-flash`.

`GOOGLE_CLOUD_PROJECT` proporciona el proyecto inicial si no hay preferencia guardada. `ACCOUNTS_ASSISTANT_ENABLED=0` o `1` fuerza la decisión inicial del proceso sin sobrescribir la preferencia. Si no está definida, se usa el modo guardado.

`GET /api/assistant/status` devuelve `enabled`, `activeProject`, `startupMode`, `project`, `promptOnStart` y `error`. `project` es el proyecto guardado para futuras activaciones; `activeProject` identifica el de la sesión actual. `PUT /api/assistant/preferences` recibe `{ "startupMode": "enabled|disabled|ask", "project": "id-proyecto" }`. `PUT /api/assistant/session` recibe `{ "enabled": true|false }`; si falla ADC, devuelve el estado desactivado y un error accionable. Si está desactivado, `POST /api/assistant` responde `503` en JSON y no construye el proveedor.

#### Flujo de lectura

La UI envía `POST /api/assistant` con un cuerpo de este tipo:

```json
{
  "prompt": "¿Cuántos movimientos hay por tipo?",
  "mode": "read",
  "scope": {
    "accountIds": ["*"]
  }
}
```

El panel construye el scope con `accountIds` y, cuando se rellenan los filtros, con `from` y `to`. El valor `['*']` representa todas las cuentas.

El backend valida el scope antes de llamar al LLM. `accountIds` debe contener ids existentes o únicamente `"*"`; `from` y `to` son fechas ISO inclusivas y `from` no puede ser posterior a `to`.

Antes de cada petición, el backend obtiene las tablas y columnas permitidas directamente de SQLite mediante `PRAGMA table_info` y las añade a las instrucciones del modelo. Así, el asistente usa el esquema que realmente existe en la base local, incluidas columnas añadidas por migraciones. El agente recibe `USERINPUT`, `SCOPE` y `MODE` en una conversación. En lectura dispone de `read_sql`; en modo escritura también puede proponer `write_sql`. Gemini decide si necesita llamar una herramienta, recibe su resultado como respuesta de herramienta y puede iterar antes de redactar la respuesta final. Una petición permite hasta veinte llamadas SQL; el límite es del caso de uso, no un control automático del SDK.

Cada llamada se valida y ejecuta en el backend. El ejecutor limita las tablas permitidas, la duración, el número de filas y el tamaño de cada resultado. Las lecturas contra `main.*` se deniegan; la conexión principal es de solo lectura. El scope se aplica en SQLite antes de exponer filas temporales al SQL. Los presupuestos mensuales se incluyen cuando su mes se solapa con el rango seleccionado. Si una sentencia falla, el error vuelve al agente para que pueda corregirla dentro del presupuesto de llamadas.

La respuesta se representa como Markdown. Cada llamada SQL recibe un ID independiente y una descripción del modelo. La llamada se conserva temporalmente en SQLite durante 24 horas; las lecturas ejecutadas pueden guardarse individualmente, conservando su ID, y no se agrupan bajo una consulta padre. La biblioteca permite filtrar, renombrar, ejecutar o eliminar cada consulta. Solo se guardan consultas de lectura completadas.

Ejecutar una consulta guardada vuelve a ejecutar exactamente la SQL almacenada en modo solo lectura, usando también el scope persistido. No invoca el LLM; la UI presenta las filas actuales de SQLite en una tabla.

Al usar el asistente, hacia Vertex AI (Google) se envían el texto de la petición, el scope elegido, el esquema de las tablas permitidas y el resultado acotado de cada consulta SQL ejecutada. Los movimientos que devuelva una consulta forman parte de ese resultado. No se envía la base de datos completa. Sin habilitar el asistente, estas funciones no envían datos a Vertex AI. La cabecera consulta el tipo de cambio a yfinance al mostrar la estimación agregada de cuentas EUR y USD. Las consultas de precios de holdings y del tipo de cambio de una transferencia se solicitan desde sus controles; el usuario confirma el cambio usado en una transferencia.

#### Flujo de escritura

El modo **Escritura** permite al agente leer primero y después llamar a `write_sql` si la petición lo requiere. Esa herramienta solo valida y guarda la propuesta temporal: no la ejecuta. La UI presenta la SQL exacta y, al pulsar **Confirmar escritura**, llama a `POST /api/assistant/pending/{id}/execute`. El backend ejecuta esa misma SQL dentro de una transacción. Guardas SQLite impiden modificar filas fuera de las cuentas y fechas seleccionadas; el modo write no admite subconsultas. Las escrituras no se ofrecen para guardar o repetir desde la biblioteca.

Placeholder de escritura para normalizar un concepto existente, sin cambiar el tipo de movimiento:

```json
{
  "prompt": "Cambia los conceptos exactamente iguales a 'clases' por 'Educación'. No cambies otros campos.",
  "mode": "write",
  "scope": {
    "accountIds": ["*"]
  }
}
```

La sentencia que podría proponer el agente para este ejemplo es:

```sql
UPDATE movements
SET concept = 'Educación'
WHERE concept = 'clases';
```

La SQL propuesta se revisa y confirma de forma explícita. Activar el modo Escritura no ejecuta cambios por sí solo.

### Total por tipo y concepto

La vista Movimientos incluye un cálculo determinista independiente del asistente. Permite elegir tipo, concepto con autocomplete basado en el histórico y rango Desde/Hasta propio; suma los importes de ese concepto en la cuenta activa. Para `Gasto`, descuenta las devoluciones de la misma ventana y muestra **Gastado neto**; `Devolución` mantiene su total propio. El rango es inclusivo y sus límites vacíos abarcan todo el histórico. La etiqueta de acción depende del tipo (`Gastado`, `Ingresado`, `Devuelto`, `Invertido`, entre otras). No llama al LLM.

#### Uso directo de la API

El endpoint también puede invocarse desde otra interfaz local. El cliente debe conservar la misma secuencia de propuesta y confirmación para `write`:

```bash
curl -s http://localhost:8001/api/assistant \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "¿Cuántas cuentas hay de cada tipo?",
    "mode": "read",
    "scope": {"accountIds": ["*"]}
  }'
```

Los errores de validación, conexión o ejecución llegan como respuesta JSON con `error`; las consultas del agente incluyen su propio `id`, descripción, SQL y estado. El cliente no debe ejecutar SQL por su cuenta.

#### Presupuesto de CASH

Las cuentas CASH permiten definir un presupuesto agregado mensual o anual. El estado muestra presupuesto, gasto real (`Gasto` − `Devolución`), restante, porcentaje consumido y exceso. Los presupuestos no se aplican a cuentas INVESTMENT ni se desglosan por concepto.

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

Línea de saldo a lo largo del tiempo, en la divisa de la cuenta. **No hay media móvil** (ni en pantalla ni en el API).

#### Gráfico: Evolución del gasto mensual

Panel CASH situado después de Gastos por concepto y antes de Movimientos. Muestra el gasto neto mensual (`Gasto` − `Devolución`), sin aplicar medias o recurrencia y conservando valores negativos. Permite seleccionar el total, un concepto o uno de sus subconceptos, sin el límite de conceptos del ranking. Los movimientos sin subconcepto aparecen como **Otros (sin subconcepto)**.

Tiene un rango temporal propio: todo el histórico, últimos meses de calendario, año o intervalo personalizado. Incluye meses sin gasto a cero; el histórico empieza en el primer movimiento de la cuenta y termina en el mes actual. Los años en curso terminan en el mes actual; los intervalos personalizados incluyen ambos meses extremos. El mes actual contiene lo registrado hasta el momento. Los selectores conservan el catálogo histórico al cambiar de rango.

El panel usa el tema y la divisa de la cuenta y se refresca al modificar movimientos. Se activa u oculta de forma independiente en **Personalizar vista**, con persistencia por cuenta. Forma parte de la vista predeterminada; las vistas personalizadas existentes conservan su selección y pueden activarlo desde ese diálogo. Los filtros se reinician al cambiar de cuenta, igual que en los demás gráficos.

#### Gráfico: Evolución mensual

Barras de ingresos y gastos por mes, con línea de balance neto. Respeta el RangeFilterBar.

#### Gráfico: Gastos por concepto

**Ranking** — barras horizontales con los 20 conceptos de mayor gasto neto en valor absoluto, conservando el signo y los conceptos totalmente compensados a cero. Las barras negativas se dibujan a la izquierda del cero. Cada concepto conserva su identidad propia; el subconcepto es un detalle opcional del movimiento, no una categoría padre común. La sección **Recurrencia de gastos**, debajo del ranking, permite clasificar cada concepto de la cuenta como recurrente o puntual; el cambio afecta a todos sus gastos y los nuevos movimientos heredan esa marca. Un concepto nuevo se guarda como recurrente y, tras guardarlo, un diálogo permite marcarlo puntual. En modo **Media/mes**, los recurrentes dividen el gasto del período por los meses desde su primera aparición hasta el fin del rango. Los puntuales dividen por todos los meses del rango; en `Todo`, desde el primer movimiento registrado en la cuenta hasta el mes actual. Los gastos existentes reciben `recurrente = false` al migrar la base de datos y se pueden clasificar desde esa sección. También hay modo **Total**.

El ranking y sus métricas (media, desviación, recurrencia e histograma diario neto) se mantienen agrupados por concepto padre. **Ver histograma** muestra la distribución de los netos diarios de los días con gastos o devoluciones, incluidos ceros y negativos, y el desglose presenta los importes netos por subconcepto en el rango activo; las filas del desglose no tienen histograma ni desviación propia. Un subconcepto nulo se etiqueta **Otros**; si solo hay un valor de subconcepto para el concepto en el rango, se omite el desglose. En movimientos, el subconcepto opcional se puede añadir y editar para cualquier tipo y se expone en su propia columna.

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

Por defecto **los últimos 20 movimientos**. Cada fila real (salvo `Saldo Inicial`) tiene **Duplicar**, **Editar** (fecha y hora, tipo, concepto, subconcepto e importe) y **Borrar** con confirmación por movimiento. Borrar una pata de transferencia elimina también su contraparte. El saldo inicial y las filas sintéticas de holdings quedan protegidos.

Encima hay un **buscador** (tipo / concepto / subconcepto / importe exacto / fecha) contra toda la cuenta. El filtro por subconcepto aparece cuando se define un concepto existente y sus sugerencias se limitan a ese concepto. El importe exacto acepta coma o punto decimal y se combina con los demás filtros. Con búsqueda activa se muestran hasta 500 resultados; **Limpiar** vuelve a los últimos 20.

Clic en un concepto de la tabla filtra por ese concepto.

#### Total por tipo y concepto

Permite sumar un concepto con un subconcepto opcional y un intervalo de fechas. El intervalo inicial es **Siempre** hasta **Hoy**; cada fecha se puede seleccionar de forma independiente. El resultado incluye el intervalo aplicado. Para `Gasto`, se calcula el gasto neto (`Gasto` − `Devolución`) por concepto, subconcepto y fechas; **Otros** agrupa los movimientos sin subconcepto.

#### Formulario: Añadir movimiento

A la derecha de la tabla. Autocompletado de concepto por frecuencia (prefijo, case-insensitive) y campo opcional de subconcepto para todos los tipos. Todos los formularios de fecha y hora usan un calendario y un selector de horas completas de `00:00` a `23:00`, sin AM/PM; se inicializan con la hora local actual. Este selector se aplica al alta y edición de movimientos, alta de holdings, transferencias y cierres de posiciones, carteras y apuestas. Si se registra un concepto de gasto nuevo, el backend lo detecta en la operación de alta; tras guardar, el formulario abre un diálogo para clasificarlo como recurrente o puntual.

**Validaciones del servidor:**

- `Devolución`: el concepto debe coincidir con un `Gasto` registrado.
- `Cobro apuesta` (`Apuestas_r`): debe existir un `Apuestas` con el mismo concepto y no debe haber ya un `Cobro apuesta` con ese concepto (cada apuesta solo se puede cerrar una vez).
- `Retorno inv.` (`Inversión_r`): debe existir una `Inversión` con el mismo concepto.

**Autocompletado del concepto:**

- `Cobro apuesta` → apuestas abiertas
- `Devolución` → conceptos de gastos registrados

#### Eliminar cuenta

Botón en el hero. `DELETE /api/accounts/{cuenta}` borra la cuenta y su histórico.

---

### Vista INVESTMENT

Vista de cartera de inversión (no cuenta corriente), en la **divisa de esa cuenta** (`accounts.currency`). El acento visual y el monograma se eligen por cuenta (tema por defecto: forest para cuentas nuevas INVESTMENT, editable en el hero).

Los campos de importes, precios, títulos y tipo de cambio aceptan coma o punto como separador decimal, sin separadores de miles. El alta de holdings usa el selector de fecha y hora común a toda la app (`00:00` a `23:00`).

Botón **Precios actuales** (`POST .../portfolio-holdings/refresh-prices`, yfinance) y banner con cuántas posiciones se actualizaron / qué tickers fallaron. Botón **+ Holding** abre el alta de un lote (`POST .../portfolio-holdings`): cartera, ticker, títulos, precio, fecha. Exige caja suficiente (Saldo − En carteras). Si la cuenta no es USD, se puede convertir un precio en USD con **Consultar ahora** (yfinance).

#### KPIs (cinco tarjetas)

PeriodSelector: **Mes** / **Trimestre** / **Año** (sin Personalizado). (`KpiCardsInvestment.tsx`, `domain/services/investment_kpi.py`)

- **Saldo** — cash + capital invertido a **coste** (ledger fusionado; no es valor de mercado). Comprar un lote **no saca** saldo: el dinero desplegado se ve en **En carteras**. Subtítulo: caja = Saldo − En carteras
- **Saldo preventa** — Saldo + Σ(valor de mercado − coste) de holdings abiertas que ya tienen `current_price_usd`; las demás se quedan a coste
- **Aportado neto** (período) — transferencias entrantes − salientes en el período (`transfer_link_id`)
- **En carteras** — capital invertido a coste (snapshot) + recuento de abiertas. Es un **desglose** del Saldo, no un extra: no sumar las dos tarjetas
- **P&L cerrado** (período) — suma de balances de posiciones `Inversión`/`Inversión_r` cerradas cuya fecha de cierre cae en el período

#### Rango de desglose y carteras

Un único **RangeFilterBar** (default `Todo`) para el gráfico de capital aportado y el historial del análisis de carteras. La distribución del capital y las carteras abiertas muestran el estado actual, independiente del rango. No hay sección de Transferencias en esta vista.

#### Gráfico: Capital aportado · histórico

Serie de `movements.balance` (capital aportado neto), sin media móvil. No es el valor de mercado del KPI Saldo preventa.

#### Gráfico: Capital por cartera

Barplot horizontal de todas las carteras abiertas, ordenadas por capital a coste, incluidos los conceptos legado abiertos. La longitud de cada barra y su color dentro de una escala de calor representan el importe; los tonos siguen el tema de la cuenta y los mayores importes son más oscuros. Muestra el importe en la divisa de la cuenta. No ofrece selector de total/media mensual ni incluye capital de posiciones cerradas.

La vista INVESTMENT permite añadir, duplicar y editar movimientos. El panel **Añadir movimiento** se configura en **Personalizar vista** y forma parte de la selección predeterminada. **Total por tipo y concepto** no se muestra ni se ofrece entre sus opciones; las selecciones antiguas de ese panel se ignoran.

#### Análisis de carteras

Cada cartera abierta con holdings es una fila expandible: ticker, empresa, precio medio, capital, precio actual (editable a mano o vía «Precios actuales»), PnL, estado, precio de cierre, anotación.

- El **PnL de un ticker** usa el precio de cierre si ya se vendió; si no, el último `current_price_usd`.
- El **PnL de la cartera** aparece cuando **todos** sus tickers tienen algún precio.
- **Cerrar** un lote es una **venta**: pide el precio y la **fecha de venta**, guarda `closePrice` y registra `Inversión` (coste, si no existía) + `Inversión_r` (shares × precio) en el ledger. El saldo se mueve por el P&L neto; el lote sale de «En carteras»; el P&L entra en el KPI «P&L cerrado». El mismo endpoint edita `note` y `currentPrice` sin vender.
- **Cerrar una posición sin cerrar la cartera** cierra todos los lotes abiertos del ticker elegido. Ese ticker pasa al histórico como `cartera · ticker`; los demás tickers permanecen abiertos en su cartera. Si se cierra la cartera entera, el histórico sigue agrupándose por cartera.
- La **anotación** no entra en ningún cálculo.

`POST /api/accounts/{cuenta}/portfolio-holdings/close-position` recibe `{ "portfolio": "Core", "ticker": "AAPL", "closePrice": 125.50, "fecha": "2026-10-13" }`. `closePrice` se aplica a todos los lotes abiertos de ese ticker en esa cartera; la respuesta informa cuántos lotes y acciones se cerraron.

Una cartera legado (sin filas en `portfolio_holdings`, flujo `Inversión`/`Inversión_r` en `movements`) se muestra sin composición por ticker. El historial filtrado por fecha de cierre aplica a ese legado.

Strip de KPIs de sección: capital invertido (abiertas) + historial cerrado.

#### Movimientos + añadir

Misma potencia que CASH (buscar, editar incluyendo fecha, duplicar, borrar por fila, eliminar cuenta).

No hay sección UI de transferencias de la cuenta. El endpoint `GET /api/accounts/{cuenta}/transferencias` existe y lo ejercita el golden master; ninguna vista lo consume.

---

### Cerrar apuesta (modal)

El botón **Cerrar** (solo en **Análisis de apuestas**, vista CASH) abre un modal con concepto y banca (solo lectura), importe recibido, fecha y hora, y subconcepto opcional. Crea `Cobro apuesta` (`Apuestas_r`). **0 = pérdida total.**

---

### Transferencia entre cuentas

El botón "⇄ Transferencia" en el header (visible solo con 2 o más cuentas) abre un modal con origen, destino, importe, subconcepto opcional compartido por ambas patas y fecha y hora. Al confirmar, registra:

- `Transferencia` (resta) en la cuenta origen, con el importe en su propia divisa
- `Ingreso` (suma) en la cuenta destino, con el importe convertido a la divisa de esa cuenta

**Si origen y destino tienen divisas distintas**, el modal pide el **tipo de cambio** (obligatorio). Botón **Consultar ahora** rellena el par EUR/USD vía yfinance; el usuario puede editarlo. El importe en destino es `total origen × tipo de cambio`, redondeado a 2 decimales. El tipo se persiste en `movements.exchange_rate` en ambas patas. Si las divisas coinciden, no se pide y `exchange_rate` queda `NULL`.

Las dos patas comparten `movements.transfer_link_id`. Borrar una (último movimiento de esa cuenta) borra la otra. Un Ingreso sin enlace no es transferencia.

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
| GET | `/api/fx` | Tipo de cambio al contado `base`→`quote` (EUR/USD, yfinance). El usuario confirma |
| GET | `/api/accounts/{cuenta}/investment-kpis` | KPIs INVESTMENT (saldo, **saldoPreventa**, **caja**, aportado, en carteras, PnL + deltas) |
| GET | `/api/accounts/{cuenta}/saldo-evolucion` | Serie temporal de saldo |
| GET | `/api/accounts/{cuenta}/gastos-mes-actual` | Alerta de gasto del mes (`alert`) |
| GET | `/api/accounts/{cuenta}/budget` | Presupuestos mensuales/anuales de una cuenta CASH |
| PUT | `/api/accounts/{cuenta}/budget` | Crea o actualiza un presupuesto por cuenta y período |
| DELETE | `/api/accounts/{cuenta}/budget/{id}` | Borra un presupuesto |
| GET | `/api/accounts/{cuenta}/budget-status` | Gasto real y estado del presupuesto (`period=month\|year`) |
| POST | `/api/assistant` | Ejecuta function calling iterativo para la petición, el modo y el scope; devuelve respuesta y consultas individuales |
| GET | `/api/assistant/status` | Estado de sesión, preferencia de arranque, proyecto y error de activación |
| PUT | `/api/assistant/preferences` | Guarda modo de arranque y proyecto; no modifica la sesión activa |
| PUT | `/api/assistant/session` | Activa o desactiva el asistente para el proceso local |
| POST | `/api/assistant/pending/{id}/save` | Guarda una consulta temporal de lectura conservando su ID |
| POST | `/api/assistant/pending/{id}/execute` | Ejecuta una propuesta de escritura confirmada por la UI |
| GET | `/api/assistant/saved` | Lista las consultas SQL guardadas |
| POST | `/api/assistant/saved` | Guarda título, pregunta, SQL de lectura y scope mediante el contrato existente |
| PUT | `/api/assistant/saved/{id}` | Renombra una consulta guardada |
| POST | `/api/assistant/saved/{id}/execute` | Ejecuta una SQL guardada en modo lectura con su scope, sin llamar al LLM |
| DELETE | `/api/assistant/saved/{id}` | Elimina una consulta guardada |
| POST | `/api/accounts/{cuenta}/portfolio-holdings` | Alta de un lote (exige caja ≥ capital) |
| PUT | `/api/accounts/{cuenta}/portfolio-holdings/{id}` | Edita `closePrice` / `note` / `currentPrice` (venta: `fecha` opcional) |
| POST | `/api/accounts/{cuenta}/portfolio-holdings/close-position` | Cierra los lotes abiertos de un ticker, dejando abierta la cartera |
| POST | `/api/accounts/{cuenta}/portfolio-holdings/close-portfolio` | Cierra todos los lotes abiertos de una cartera |
| GET | `/api/accounts/{cuenta}/mensual-evolucion` | Ingresos/gastos por mes |
| GET | `/api/accounts/{cuenta}/carteras-ranking` | Ranking de conceptos `Inversión` (media/total) |
| GET | `/api/accounts/{cuenta}/gastos-ranking` | Ranking de conceptos `Gasto` (media/total) |
| GET | `/api/accounts/{cuenta}/gastos-evolucion` | Netos mensuales `meses`, `gastos` y `conceptos` con `subconceptos`; acepta `range` y `year` como los demás gráficos |
| GET | `/api/accounts/{cuenta}/gastos/recurrentes` | Lista conceptos de gasto y su clasificación recurrente/puntual |
| PUT | `/api/accounts/{cuenta}/gastos/recurrentes` | Actualiza la clasificación de un concepto de gasto para todo su histórico |
| GET | `/api/accounts/{cuenta}/transferencias` | Recibido / enviado / neto + lista (`transfer_link_id`). **Sin sección UI** |
| GET | `/api/accounts/{cuenta}/carteras` | Holdings abiertas (por ticker) + legado + historial |
| POST | `/api/accounts/{cuenta}/portfolio-holdings/refresh-prices` | Refresca `current_price_usd` de holdings abiertas (yfinance) |
| GET | `/api/accounts/{cuenta}/apuestas` | Abiertas + historial cerrado |
| POST | `/api/movimiento/{cuenta}` | Añade un movimiento, devuelve el saldo y señala si es el primer gasto del concepto (`conceptoNuevo`) |
| PUT | `/api/movimiento/{cuenta}` | Edita tipo / concepto / subconcepto / total / fecha |
| DELETE | `/api/movimiento/{cuenta}` | Borra el último movimiento; si es una pata de transferencia, borra la otra |
| DELETE | `/api/movimiento/{cuenta}/{idx}` | Borra el movimiento seleccionado; si es una pata de transferencia, borra la otra |
| POST | `/api/transferencia` | Transferencia entre cuentas (`exchangeRate` si las divisas difieren) |

---

## Notas de arquitectura

- **Hexagonal en la raíz**, no monorepo `backend/`.
- **Filtros:** PeriodSelector (solo KPIs) + RangeFilterBar (gráficos y listas) por vista. Rangos = meses de calendario. El buscador de movimientos es independiente.
- **KPIs de apuestas/carteras de sección son lifetime.** El rango solo recorta el historial cerrado (fecha de cierre `fr`).
- **`portfolio_holdings.current_price_usd`** se refresca a mano (yfinance). Puede fallar por ticker; un símbolo no cotizado puede colisionar con otro instrumento.
- **Tema por cuenta** (`accounts.theme`, seis paletas). Default por `kind`, editable en el hero.
- **`run.sh`** abre el navegador por defecto y reconstruye `frontend/dist/` antes de arrancar.
- **Saldo chart:** sin media móvil.
- **Transferencias:** `transfer_link_id` en ambas patas. Tipo de cambio consultable con yfinance, confirmado por el usuario.
- **Holdings:** alta desde la UI; venta con fecha; caja = Saldo − En carteras.
- **Fechas** en `%Y-%m-%d %H:%M:%S.%f` para ordenamiento estable con `mergesort`.
- **Plotly.js** vía npm (`plotly.js-dist-min`), no CDN.
- Servidor solo en `localhost` (puerto 8001). Sin auth. No exponer a red pública.

---

## Añadir una cuenta nueva

Desde la propia interfaz: pestaña **"+ Cuenta"** (`POST /api/accounts`, `frontend/src/features/accounts/CreateAccountModal.tsx`) — nombre, tipo (CASH/INVESTMENT), divisa (EUR o USD), saldo inicial y tema. No hace falta tocar código ni SQL a mano; `TIPOS_POR_KIND` deriva los tipos del `kind`, no del id.

Si la cuenta nueva va a importar histórico desde un CSV externo: darla de alta primero desde la UI, después `uv run python scripts/migrate_csv_to_sqlite.py --db-path accounts.db` con el `<id-cuenta>.csv` correspondiente ya en la raíz del repo (el script solo trae movimientos a una cuenta ya existente, no crea cuentas).
