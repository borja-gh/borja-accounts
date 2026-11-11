# Notas de release

## 0.1.0-beta.1

Versión candidata de la beta local de borja-accounts, prevista para macOS y Linux. La aplicación almacena las cuentas y movimientos localmente en SQLite, y permite crear una cuenta CASH o INVESTMENT desde la interfaz antes de registrar su primer movimiento. La importación de CSV es opcional.

La beta se instala desde el código fuente y se ejecuta en `127.0.0.1:8001`. El asistente financiero es opcional y requiere activar `ACCOUNTS_ASSISTANT_ENABLED=1` y configurar Google Cloud ADC. Cuando se utiliza, la pregunta, el alcance seleccionado, el esquema disponible y los resultados acotados de cada consulta se envían a Vertex AI; no se envía la base de datos completa.

### Estado de distribución

La compatibilidad nativa de esta versión aún no se ha validado en ambas plataformas. La publicación queda bloqueada: el historial Git público contiene datos y referencias privadas que no se pueden retirar sin reescribir historia. No distribuyas el repositorio por clon hasta que el supervisor confirme una vía segura. Esta nota no autoriza una publicación.
