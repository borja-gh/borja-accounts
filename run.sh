#!/usr/bin/env bash
set -e

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$ROOT_DIR"

fail() {
  printf '%s\n' "$1" >&2
  exit "${2:-1}"
}

for command_name in uv node npm curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail "Falta $command_name. Instálalo y vuelve a ejecutar ./run.sh." 127
  fi
done

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major === 24 && minor >= 15 ? 0 : 1)'; then
  fail "Se requiere Node.js 24.15 o posterior de la serie 24." 1
fi

if ( : > /dev/tcp/127.0.0.1/8001 ) 2>/dev/null; then
  fail "El puerto 8001 ya está ocupado. Cierra la aplicación que lo usa y vuelve a intentarlo." 1
fi

export UV_PROJECT_ENVIRONMENT="${UV_PROJECT_ENVIRONMENT:-$HOME/.venvs/borja-accounts}"

db_path="${BORJA_ACCOUNTS_DB:-$ROOT_DIR/accounts.db}"
case "$db_path" in
  /*) resolved_db_path="$db_path" ;;
  *) resolved_db_path="$ROOT_DIR/$db_path" ;;
esac

printf 'Aplicación: %s\n' "http://127.0.0.1:8001"
printf 'Base de datos: %s\n' "$resolved_db_path"
printf 'Entorno Python: %s\n' "$UV_PROJECT_ENVIRONMENT"
printf '%s\n' "Pulsa Ctrl+C para detener la aplicación."

uv sync --frozen --python 3.13
(cd frontend && npm ci && npm run build)

URL="http://127.0.0.1:8001"
server_pid=

cleanup() {
  status=$?
  trap - EXIT INT TERM
  if [ -n "${server_pid:-}" ]; then
    kill -TERM -- "-$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

set -m
uv run --frozen uvicorn app.main:app --host 127.0.0.1 --port 8001 &
server_pid=$!
set +m

attempt=0
while [ "$attempt" -lt 50 ]; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    wait "$server_pid"
    exit $?
  fi
  if curl --connect-timeout 1 --max-time 2 -fsS "$URL" >/dev/null 2>&1; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 0.2
done

if [ "$attempt" -eq 50 ]; then
  printf '%s\n' "El servidor no respondió en $URL. Revisa el error anterior." >&2
  exit 1
fi

if [ "${ACCOUNTS_OPEN_BROWSER:-1}" != 0 ]; then
  if [ "$(uname -s)" = Darwin ] && command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  else
    printf '%s\n' "Abre $URL en el navegador cuando quieras." >&2
  fi
fi

wait "$server_pid"
