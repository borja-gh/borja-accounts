import { useEffect, useState } from 'react';
import type { Data, Layout } from 'plotly.js-dist-min';
import { fetchGastosEvolucion } from '../../api/client';
import type { GastosEvolucionReport, Movement } from '../../api/types';
import { PlotlyChart } from '../../components/PlotlyChart';
import { CURRENCY_SUFFIX } from '../../lib/format';
import { chartLineColor, type ThemeName } from '../../styles/themes';
import { DEFAULT_RANGE_FILTER, type RangeFilter } from '../filters/RangeFilter';
import { RangeFilterBar } from '../filters/RangeFilterBar';
import { baseLayout } from './baseLayout';

interface Props {
  account: string;
  currency: string;
  theme?: ThemeName | null;
  movements: Movement[];
  reloadToken: number;
}

export function GastosEvolucionSection({ account, currency, theme, movements, reloadToken }: Props) {
  const [filter, setFilter] = useState<RangeFilter>(DEFAULT_RANGE_FILTER);
  const [response, setResponse] = useState<{
    report: GastosEvolucionReport | null;
    error: string;
    account: string;
    filter: RangeFilter;
    reloadToken: number;
  } | null>(null);
  const [concept, setConcept] = useState('');
  const [subconcept, setSubconcept] = useState('');
  const loading = !response || response.account !== account || response.filter !== filter || response.reloadToken !== reloadToken;
  const report = response?.report;
  const error = loading ? '' : response.error;

  useEffect(() => {
    let active = true;
    fetchGastosEvolucion(account, filter)
      .then((report) => {
        if (active) setResponse({ report, error: '', account, filter, reloadToken });
      })
      .catch(() => {
        if (active) setResponse({ report: null, error: 'No se pudo cargar la evolución del gasto.', account, filter, reloadToken });
      });
    return () => { active = false; };
  }, [account, filter, reloadToken]);

  const selectedConcept = report?.conceptos.find((item) => item.concepto === concept);
  const selectedSubconcept = selectedConcept?.subconceptos.find((item) => JSON.stringify(item.subconcepto) === subconcept);
  const values = selectedSubconcept?.gastos ?? selectedConcept?.gastos ?? report?.gastos ?? [];
  const label = selectedSubconcept
    ? `${selectedConcept?.concepto} · ${selectedSubconcept.subconcepto ?? 'Otros'}`
    : selectedConcept?.concepto ?? 'Total de gastos';
  const symbol = CURRENCY_SUFFIX[currency] ?? currency;
  const base = baseLayout();
  const traces: Data[] = [{
    x: report?.meses,
    y: values,
    type: 'scatter',
    mode: 'lines+markers',
    name: label,
    line: { color: chartLineColor(theme, 'CASH'), width: 2.5 },
    marker: { size: 6 },
    hovertemplate: `%{x}: <b>%{y:,.2f}${symbol}</b><extra></extra>`,
  }];
  const layout: Partial<Layout> = {
    ...base,
    showlegend: false,
    xaxis: { ...base.xaxis, type: 'category' },
    yaxis: { ...base.yaxis, ticksuffix: symbol, rangemode: 'tozero' },
  };

  return (
    <section className="chart-card full" aria-label="Evolución del gasto mensual" aria-busy={loading}>
      <div className="chart-head">
        <div className="chart-label">Evolución del gasto mensual</div>
        <RangeFilterBar data={movements} filter={filter} onChange={setFilter} />
      </div>
      <div className="expense-evolution-controls">
        <label>
          Concepto
          <select value={selectedConcept?.concepto ?? ''} disabled={loading || !!error} onChange={(event) => {
            setConcept(event.target.value);
            setSubconcept('');
          }}>
            <option value="">Total de gastos</option>
            {report?.conceptos.map((item) => <option key={item.concepto} value={item.concepto}>{item.concepto}</option>)}
          </select>
        </label>
        <label>
          Subconcepto
          <select value={selectedSubconcept ? JSON.stringify(selectedSubconcept.subconcepto) : ''}
            disabled={!selectedConcept || loading || !!error} onChange={(event) => setSubconcept(event.target.value)}>
            <option value="">Todos los subconceptos</option>
            {selectedConcept?.subconceptos.map((item) => (
              <option key={JSON.stringify(item.subconcepto)} value={JSON.stringify(item.subconcepto)}>
                {item.subconcepto ?? 'Otros (sin subconcepto)'}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="expense-evolution-copy">{label} · Gasto neto mensual: gastos − devoluciones.</p>
      {loading ? <p role="status">Cargando evolución…</p>
        : error ? <p role="alert">{error}</p>
          : !report?.conceptos.length || !report.meses.length ? <p>No hay gastos para mostrar.</p>
            : <div className="chart-plot"><PlotlyChart traces={traces} layout={layout} /></div>}
    </section>
  );
}
