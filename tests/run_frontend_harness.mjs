// Golden master del dominio financiero que hoy vive en index.html (vanilla JS).
//
// No se copian/transcriben funciones a mano: se extrae el <script> inline
// completo de index.html (regex sobre <script>...(sin src)...</script>) y se
// ejecuta verbatim en un vm context de Node con stubs mínimos de document/
// Plotly/fetch y un reloj fijo (Date parcheada a FIXED_NOW). Si index.html
// cambia, este runner se re-deriva solo — no hay copia manual que pueda
// desincronizarse.
//
// Uso: node run_frontend_harness.mjs > snapshot_frontend.json
// Fijado a Europe/Madrid (TZ real del usuario), NO a UTC: varios cálculos de
// "mes actual" en index.html (monthKey, y la rama kpiType==='mes' de
// periodSlices, usada por IBKR) hacen `new Date(y, m, 1).toISOString().slice(0,7)`.
// Con un TZ de offset positivo esa conversión a UTC cruza medianoche hacia
// atrás y resuelve SIEMPRE al mes anterior — es un bug real de producción,
// no un artefacto de este harness. El equivalente para Openbank vivía en
// computeKPIs y se movió (Bloque 4) a domain/services/kpi.py, donde se
// preserva a propósito igual que aquí. Corregirlo es decisión de un bloque
// posterior explícito, no de aquí. Ver docs/ARCHITECTURE.md.
//
// Las cuentas del fixture se llaman "cash1"/"investment1" (renombradas
// desde "openbank"/"ibkr" en el commit de generalización N/M), pero las
// llamadas api.setAccount("openbank")/api.setAccount("ibkr") de más abajo
// se dejan TAL CUAL a propósito: index.html (vanilla, nunca tocado) compara
// literalmente `account === 'ibkr'` dentro de chartSaldo() para elegir el
// color de la línea de saldo. Pasar "investment1" ahí cambiaría el color
// capturado en investment1_charts_all -- un cambio de comportamiento real,
// no cosmético, que además rompería SaldoChart.test.tsx (React sigue
// coloreando por `kind`, correctamente). "openbank"/"ibkr" aquí son un
// flag interno de presentación del vanilla, no el id de cuenta del modelo
// N/M -- ver el mismo razonamiento en index.html:1354.
process.env.TZ = "Europe/Madrid";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const FIXED_NOW = "2026-07-15T12:00:00.000Z"; // "hoy simulado" del golden master — ver docs/ARCHITECTURE.md §7

function extractInlineScript(html) {
  const matches = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  const inline = matches.map(m => m[1]).find(body => body.trim().length > 0);
  if (!inline) throw new Error("No se encontró un <script> inline con cuerpo en index.html");
  return inline;
}

class FixedDate extends Date {
  constructor(...args) {
    if (args.length === 0) super(FIXED_NOW);
    else super(...args);
  }
  static now() {
    return new Date(FIXED_NOW).getTime();
  }
}

function buildSandbox() {
  const capturedPlots = {};
  const sandbox = {
    console,
    Plotly: {
      newPlot: (id, traces, layout) => { capturedPlots[id] = { traces, layout }; },
      purge: (id) => { capturedPlots[id] = null; },
    },
    document: {
      addEventListener() {},
      getElementById() { return {}; },
      querySelectorAll() { return []; },
      body: { classList: { add() {}, remove() {} } },
    },
    fetch: () => Promise.reject(new Error("fetch no disponible en el golden master")),
    requestAnimationFrame: (fn) => fn(),
    setTimeout,
    clearTimeout,
    Date: FixedDate,
    __capturedPlots: capturedPlots,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

function loadBackendFixture() {
  const snapshotPath = path.join(HERE, "snapshot_backend.json");
  const snap = JSON.parse(readFileSync(snapshotPath, "utf-8"));
  return {
    cash1: snap.initial_data_cash1,
    investment1: snap.initial_data_investment1,
    // Ya calculado por el backend (Bloque 4) -- el frontend deja de
    // recalcular esto, solo lo pinta.
    cash1KpisByPeriod: snap.cash1_kpis_by_period,
    cash1ApuestasReport3m: snap.cash1_apuestas_report_3m,
    investment1KpisByPeriod: snap.investment1_kpis_by_period,
    investment1CarterasReport3m: snap.investment1_carteras_report_3m,
    investment1TransferenciasReport3m: snap.investment1_transferencias_report_3m,
    cash1GastosMesActual: snap.cash1_gastos_mes_actual,
    cash1GastosRanking3mMedia: snap.cash1_gastos_ranking_3m_media,
    cash1GastosRankingAllMedia: snap.cash1_gastos_ranking_all_media,
    cash1SaldoEvolucionAll: snap.cash1_saldo_evolucion_all,
    cash1MensualEvolucionAll: snap.cash1_mensual_evolucion_all,
    investment1SaldoEvolucionAll: snap.investment1_saldo_evolucion_all,
    investment1CarterasRankingAllTotal: snap.investment1_carteras_ranking_all_total,
  };
}

// Variables `let`/`const` de nivel superior del script (data, account,
// panelFilters, ...) viven en el lexical scope del propio script, no como
// propiedades del objeto global del vm context. Se envuelve en una IIFE que
// termina en un `return {...}` explícito para exponerlas por closure, sin
// tocar una sola línea del cuerpo original.
const EXPOSE = [
  "kpiCardsHtml", "kpiCardsIbkrHtml",
  "apuestasBody", "inversionesBody", "transferenciasBody",
  "gastoAlertHtml", "topMerchantsHtml", "renderMovimientos", "searchedMovs",
  "chartSaldo", "chartMensual", "chartGastos", "chartDonut", "chartCarteras",
];

function wrapForExposure(scriptBody) {
  return `(function() {\n${scriptBody}\n
    return {
      ${EXPOSE.join(",\n      ")},
      setData: (v) => { data = v; },
      setAccount: (v) => { account = v; },
      setPanelFilter: (panel, f) => { panelFilters[panel] = f; },
    };
  })()`;
}

function run() {
  const html = readFileSync(path.join(REPO_ROOT, "index.html"), "utf-8");
  const scriptBody = extractInlineScript(html);
  const fixture = loadBackendFixture();

  const sandbox = buildSandbox();
  const context = vm.createContext(sandbox);
  const api = new vm.Script(wrapForExposure(scriptBody), { filename: "index.html#inline-script" }).runInContext(context);

  const KPI_TYPES = ["mes", "trimestre", "año"];
  const result = {};

  // ── Cash1 (cuenta CASH del fixture) ──
  api.setData(fixture.cash1);
  api.setAccount("openbank");
  result.cash1_kpis = {};
  for (const t of KPI_TYPES) {
    api.setPanelFilter("kpi", { type: t });
    result.cash1_kpis[t] = api.kpiCardsHtml(fixture.cash1KpisByPeriod[t]);
  }
  result.cash1_gasto_alert = api.gastoAlertHtml(fixture.cash1GastosMesActual.alert);
  result.cash1_top_merchants = api.topMerchantsHtml(fixture.cash1GastosMesActual.topMerchants);
  result.cash1_apuestas_body = api.apuestasBody(fixture.cash1ApuestasReport3m);
  result.cash1_movimientos_default = api.renderMovimientos(api.searchedMovs());

  api.chartSaldo(fixture.cash1SaldoEvolucionAll);
  api.chartMensual(fixture.cash1MensualEvolucionAll);
  api.chartGastos(fixture.cash1GastosRankingAllMedia.ranking);
  api.chartDonut(fixture.cash1GastosRankingAllMedia.donut);
  result.cash1_charts_all = JSON.parse(JSON.stringify(sandbox.__capturedPlots));
  for (const k of Object.keys(sandbox.__capturedPlots)) delete sandbox.__capturedPlots[k];

  // ── Investment1 (cuenta INVESTMENT del fixture) ──
  api.setData(fixture.investment1);
  api.setAccount("ibkr");
  result.investment1_kpis = {};
  for (const t of KPI_TYPES) {
    api.setPanelFilter("kpi", { type: t });
    result.investment1_kpis[t] = api.kpiCardsIbkrHtml(fixture.investment1KpisByPeriod[t]);
  }
  result.investment1_inversiones_body = api.inversionesBody(fixture.investment1CarterasReport3m);
  result.investment1_transferencias_body = api.transferenciasBody(fixture.investment1TransferenciasReport3m);
  result.investment1_movimientos_default = api.renderMovimientos(api.searchedMovs());

  api.chartSaldo(fixture.investment1SaldoEvolucionAll);
  api.chartCarteras(fixture.investment1CarterasRankingAllTotal);
  result.investment1_charts_all = JSON.parse(JSON.stringify(sandbox.__capturedPlots));

  console.log(JSON.stringify(result, null, 2));
}

run();
