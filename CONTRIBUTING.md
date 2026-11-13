# Contribuir

Las contribuciones se proponen mediante pull request contra `main`. Para cambios grandes, abre antes una issue con el problema y el alcance.

## Preparar el entorno

Requisitos: Bash 3.2 o posterior, Python 3.11–3.13, Node.js 24.15 o posterior dentro de la rama 24 y `uv`.

```bash
ACCOUNTS_TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/borja-accounts.XXXXXX")"
export UV_PROJECT_ENVIRONMENT="$ACCOUNTS_TEST_DIR/venv"
export BORJA_ACCOUNTS_DB="$ACCOUNTS_TEST_DIR/accounts.db"
uv sync --frozen
(cd frontend && npm ci)
```

No añadas bases de datos, CSV personales, copias de seguridad, credenciales ni configuración local.

## Validar cambios

```bash
(cd frontend && npm run build)
uv run --frozen pytest tests/ -q
(cd frontend && npm test)
```

Los tests deben usar fixtures sintéticos o bases SQLite temporales. No regeneres `tests/snapshot_backend.json` salvo que el cambio financiero sea intencional, esté revisado y se actualice su documentación.

La CI requiere el historial completo y ejecuta `uv run --frozen python scripts/verify_git_history.py`. El verificador inspecciona objetos alcanzables desde todas las referencias locales y `HEAD`, incluidos mensajes de commits y tags y archivos borrados. Los informes muestran categorías, rutas y hashes, sin reproducir valores privados. Los clones shallow se rechazan. Los tests del verificador usan repositorios temporales con canarios sintéticos.

## Pull requests

Describe el comportamiento que cambia y los comandos ejecutados. Para cambios de interfaz, incluye capturas con datos sintéticos. No incluyas datos financieros, secretos, transcripts ni ficheros generados.
