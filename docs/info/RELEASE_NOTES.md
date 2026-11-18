# Notas de release

## 0.1.0-beta.3

Beta local de borja-accounts para macOS y Linux. No añade tablas ni columnas: la actualización no requiere migración.

### Carteras

- Edición de cada lote: ticker, empresa, títulos, precio medio, invertido, comisión y fecha de compra. Títulos, precio medio e invertido se derivan entre sí: al cambiar títulos o invertido se recalcula el precio medio; al cambiar el precio medio, el invertido. En lotes cerrados solo se editan ticker, empresa y comisión.
- Renombrado de cartera con todos sus lotes, abiertos y cerrados, y su historial.
- Las filas del historial de carteras se despliegan para ver los lotes vendidos, con la acción de renombrar.

### Indicadores

- Cabecera con ingresos, gastos y balance entre todas las cuentas, con periodos mensual, trimestral, anual y personalizado, y selección de divisa. Los ingresos suman el resultado realizado de las carteras de inversión y los ingresos de las cuentas cash. Los gastos solo cuentan las cuentas cash.
- Los periodos trimestrales usan el trimestre natural (ene–mar, abr–jun, jul–sep, oct–dic), tanto en cuentas cash como en inversión.

### API

- `PATCH /api/accounts/{cuenta}/portfolio-holdings/{id}`: edición de características de un lote.
- `POST /api/accounts/{cuenta}/portfolio-holdings/rename-portfolio`: renombrado de cartera.
- `GET /api/accounts/{cuenta}/portfolio-holdings/closed`: lotes vendidos.
- `GET /api/kpis/consolidated`: indicadores entre cuentas.

### Actualización y datos

La actualización no cambia el esquema. Haz una copia de la base antes de actualizar y arranca indicando su ruta con `BORJA_ACCOUNTS_DB`.

### Estado de distribución

La CI verifica instalación, pruebas, build, arranque HTTP, reinicio y recuperación en Ubuntu 24.04 x86_64 y macOS 15 arm64, sin escritorio. La validación visual de un escritorio Linux y de otros navegadores no está incluida.

La distribución es el archivo de fuentes `borja-accounts-0.1.0-beta.3.tar.gz`, acompañado de `SHA256SUMS`. Contiene el código de la versión sin historial Git, datos locales ni configuración OpenRig. Requiere `uv` y Node.js 24.15 o posterior dentro de la serie 24; el launcher instala Python 3.13.

Las referencias y cachés de pull requests de GitHub requieren una purga independiente gestionada por GitHub Support; la comprobación de ramas y tags no acredita esa eliminación del servidor.

## 0.1.0-beta.2

Beta local de borja-accounts para macOS y Linux. La aplicación almacena las cuentas y movimientos localmente en SQLite, y permite crear una cuenta CASH o INVESTMENT desde la interfaz antes de registrar su primer movimiento. La importación de CSV es opcional.

La beta se instala desde el código fuente y se ejecuta en `127.0.0.1:8001`. El asistente financiero es opcional: su configuración permite indicar el proyecto de Google Cloud, elegir activación predeterminada, desactivación o pregunta en cada arranque, y activar o desactivar la sesión sin reiniciar. Las preferencias se guardan en SQLite; las credenciales se gestionan mediante Google ADC. Un fallo de credenciales mantiene disponible el producto básico y muestra instrucciones para configurarlas.

Cuando se utiliza el asistente, la pregunta, el alcance seleccionado, el esquema disponible y los resultados acotados de cada consulta se envían a Vertex AI; no se envía la base de datos completa. El modelo es `gemini-3.8-flash`.

### Interfaz

- Recurrencia de gastos con un control de apertura accesible y estados de foco y expansión.
- Filtros de movimientos con etiquetas y distribución adaptable, también al aparecer el subconcepto.
- Acciones de movimientos alineadas y desplazamiento horizontal contenido en la tabla.
- Capital por cartera en un barplot de carteras abiertas: longitud y escala de calor según el importe, con los tonos del tema de la cuenta.
- Alta y duplicado de movimientos en inversión configurables desde Personalizar vista; el panel de total por tipo y concepto se limita a cuentas de ahorro.

### Actualización y datos

La actualización conserva el esquema financiero y añade una tabla de preferencias del asistente. Haz una copia de la base antes de actualizar y arranca indicando su ruta con `BORJA_ACCOUNTS_DB`. Las vistas personalizadas conservan su selección; Añadir movimiento se puede activar desde Personalizar vista en inversión. El golden master financiero se mantiene sin cambios.

### Estado de distribución

La CI verifica instalación, pruebas, build, arranque HTTP, reinicio y recuperación en Ubuntu 24.04 x86_64 y macOS 15 arm64, sin escritorio. La validación visual de un escritorio Linux y de otros navegadores no está incluida.

La distribución es el archivo de fuentes `borja-accounts-0.1.0-beta.2.tar.gz`, acompañado de `SHA256SUMS`. Contiene el código de la versión sin historial Git, datos locales ni configuración OpenRig. Requiere `uv` y Node.js 24.15 o posterior dentro de la serie 24; el launcher instala Python 3.13.

El paquete no incluye historial Git. La verificación del repositorio inspecciona los objetos alcanzables, incluidos archivos borrados y mensajes de commits y tags, para detectar material privado y secretos de alta señal. Usa el archivo de la release para instalar la beta.

Las referencias y cachés de pull requests de GitHub requieren una purga independiente gestionada por GitHub Support; la comprobación de ramas y tags no acredita esa eliminación del servidor.
