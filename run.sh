#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Instala Google Cloud CLI para autenticar Vertex AI (gcloud)." >&2
  exit 1
fi

if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  gcloud auth application-default login
fi

# GET / sirve frontend/dist/ (build de Vite, gitignored) -- se reconstruye
# aquí para no arrancar nunca contra un build desactualizado.
(cd frontend && npm run build)

URL="http://localhost:8000"
# Abre el navegador cuando el servidor ya esté escuchando
(
  for _ in $(seq 1 30); do
    if curl -sf "$URL" >/dev/null 2>&1; then
      open "$URL" >/dev/null 2>&1 || xdg-open "$URL" >/dev/null 2>&1 || true
      break
    fi
    sleep 0.2
  done
) &

uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
