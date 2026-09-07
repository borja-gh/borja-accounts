import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.resolve(HERE, '../../../tests');

function readJson(name: string) {
  return JSON.parse(readFileSync(path.join(GOLDEN_DIR, name), 'utf-8'));
}

// Mismo fixture que consume scenario.py / run_frontend_harness.mjs -- las
// claves *_kpis_by_period, etc. son las respuestas ya calculadas por el
// backend (Bloque 4) para el escenario congelado del golden master.
export const backendFixture = readJson('snapshot_backend.json');

// Textos visibles extraídos del HTML vanilla verificado (ver
// extract_frontend_values.py) -- contrato de aceptación del Bloque 5.
export const expectedValues = readJson('snapshot_frontend_values.json').values;

// Snapshot crudo del vanilla (incluye cash1_charts_all/investment1_charts_all,
// las traces/layout que Plotly.newPlot recibió) -- extract_frontend_values.py
// excluye deliberadamente los charts de expectedValues, así que los tests
// de gráficos comparan contra este fichero directamente. Ver el comentario
// en SaldoChart.tsx sobre la traza "Media 30d" que ya no se reproduce.
export const rawFrontendSnapshot = readJson('snapshot_frontend.json');

// El vanilla congelado usaba 'Outfit, system-ui' (baseLayout.ts ya no --
// cambio de tipografía de base, ver frontend/src/styles/app.css). Los tests
// de gráficos comparan layout contra este snapshot congelado: se corrige
// solo ese campo, nunca se regenera el snapshot completo por un cambio
// puramente visual.
export function withCurrentFont<T extends { font?: { family?: string } }>(layout: T): T {
  return { ...layout, font: { ...layout.font, family: 'Geist, system-ui' } };
}
