# Notas de release

## 0.1.0-beta.1

Beta local de borja-accounts para macOS y Linux. La aplicación almacena las cuentas y movimientos localmente en SQLite, y permite crear una cuenta CASH o INVESTMENT desde la interfaz antes de registrar su primer movimiento. La importación de CSV es opcional.

La beta se instala desde el código fuente y se ejecuta en `127.0.0.1:8001`. El asistente financiero es opcional y requiere activar `ACCOUNTS_ASSISTANT_ENABLED=1` y configurar Google Cloud ADC. Cuando se utiliza, la pregunta, el alcance seleccionado, el esquema disponible y los resultados acotados de cada consulta se envían a Vertex AI; no se envía la base de datos completa.

### Estado de distribución

La CI verifica instalación, pruebas, build, arranque HTTP, reinicio y recuperación en Ubuntu 24.04 x86_64 y macOS 15 arm64, sin escritorio. La validación visual de un escritorio Linux y de otros navegadores no está incluida.

La distribución es el archivo de fuentes `borja-accounts-0.1.0-beta.1.tar.gz`, acompañado de `SHA256SUMS`. Contiene el código de la versión sin historial Git, datos locales ni configuración OpenRig. Requiere `uv` y Node.js 24.15 o posterior dentro de la serie 24; el launcher instala Python 3.13.

El historial del repositorio contiene datos y referencias privadas pendientes de saneamiento. El archivo de fuentes no incluye ese historial; usa el archivo de la release para instalar la beta.
