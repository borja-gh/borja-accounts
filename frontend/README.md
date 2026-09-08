# Frontend — Cuentas

SPA de este repo: React 19 + TypeScript + Vite. Consumidor de la API FastAPI (`/api/...`); no habla con brokers ni con SQLite.

FastAPI sirve el build de producción desde `frontend/dist/` (`GET /` + `/assets`). `run.sh` ejecuta `npm run build` antes de arrancar uvicorn. `dist/` está en `.gitignore`.

## Scripts

```bash
npm install
npm run dev      # Vite en el puerto por defecto; proxifica /api → http://127.0.0.1:8000
npm run build    # tsc -b && vite build → dist/
npm run preview  # sirve el dist/ localmente (sin la API)
npm run lint     # oxlint
npm test         # vitest run (jsdom; ver vite.config.ts)
```

`npm test` no forma parte del workflow de CI (`.github/workflows/ci.yml` hace `npm ci` + `npm run build` y pytest). Se corre a mano.

## Layout

```
src/
├── api/           cliente HTTP + tipos
├── components/    Header, Tabs, PlotlyChart, …
├── features/      cash/, investment/, kpis, charts, movimientos, apuestas, inversiones, …
├── styles/        app.css + themes.ts (paletas por cuenta)
└── test/          golden master de texto visible (fixtures congelados en tests/)
```

Plotly entra por npm (`plotly.js-dist-min`), no por CDN.
