# Notas de release

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
