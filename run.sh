#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")"

export ACCOUNTS_ASSISTANT_ENABLED=1

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Instala Google Cloud CLI para autenticar Vertex AI (gcloud)." >&2
  exit 1
fi

if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  if [ -t 0 ]; then
    read -r -p "No hay una sesión ADC activa. ¿Quieres iniciar sesión con gcloud? (s/n): " login_choice
    case "$login_choice" in
      s|S|si|Si|SI|sí|Sí|SÍ)
        gcloud auth application-default login
        ;;
      *)
        export ACCOUNTS_ASSISTANT_ENABLED=0
        echo "Se omite el login ADC. El asistente de IA no estará disponible."
        ;;
    esac
  else
    export ACCOUNTS_ASSISTANT_ENABLED=0
    echo "No hay una sesión ADC activa y no existe terminal interactiva; se omite el login." >&2
  fi
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
