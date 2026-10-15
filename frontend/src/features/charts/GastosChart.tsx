import { useState } from 'react';
import type { Data, Layout } from 'plotly.js-dist-min';
import type { GastosRankingEntry, GastosRankingSection } from '../../api/types';
import { PlotlyChart } from '../../components/PlotlyChart';
import { baseLayout } from './baseLayout';

function conceptColor(value: number, maxValue: number) {
  const intensity = value / maxValue;
  return `hsl(170 ${35 + 35 * intensity}% ${85 - 52 * intensity}%)`;
}

const subconceptColors = ['#8250df', '#0969da', '#bf8700', '#cf222e', '#1a7f37'];

export function GastosChart({ ranking }: { ranking: GastosRankingSection }) {
  const [openConcepts, setOpenConcepts] = useState<Set<string>>(() => new Set());
  const [openBreakdowns, setOpenBreakdowns] = useState<Set<string>>(() => new Set());
  if (!ranking.hasGastos || !ranking.entries.length) {
    return <PlotlyChart traces={null} layout={{}} height={480} />;
  }

  const maxValue = Math.max(...ranking.entries.map((entry) => entry.valor));
  const symbol = ranking.hoverSuffix.charAt(0) || '€';
  const showMonthlyMetrics = ranking.hoverSuffix.endsWith('/mes');
  const base = baseLayout();
  const monthlyLayout: Partial<Layout> = {
    ...base,
    margin: { l: 56, r: 18, t: 28, b: 96 },
    xaxis: {
      ...base.xaxis,
      type: 'category',
      tickangle: -45,
      tickfont: { color: '#57606a', size: 9 },
      automargin: true,
      title: { text: '<b>Rango del gasto mensual</b>' },
    },
    yaxis: {
      ...base.yaxis,
      type: 'linear',
      rangemode: 'tozero',
      dtick: 1,
      title: { text: '<b>Meses con gasto</b>' },
    },
    showlegend: false,
  };
  function toggleConcept(concept: string) {
    setOpenConcepts((current) => {
      const next = new Set(current);
      if (next.has(concept)) next.delete(concept);
      else next.add(concept);
      return next;
    });
  }

  function toggleBreakdown(concept: string) {
    setOpenBreakdowns((current) => {
      const next = new Set(current);
      if (next.has(concept)) next.delete(concept);
      else next.add(concept);
      return next;
    });
  }

  function renderHistogram(entry: GastosRankingEntry) {
    const monthlyExpenses = entry.mensual.filter((amount) => amount > 0);
    if (!monthlyExpenses.length) {
      return <p className="gastos-hist-empty">No hay meses con gasto en el rango seleccionado.</p>;
    }
    const binCount = monthlyExpenses.length;
    const minExpense = Math.min(...monthlyExpenses);
    const maxExpense = Math.max(...monthlyExpenses);
    const expenseRange = maxExpense - minExpense;
    const binSize = expenseRange > 0 ? expenseRange / binCount : Math.max(maxExpense * 0.05, 0.01);
    const binStart = expenseRange > 0 ? minExpense : Math.max(0, maxExpense - binSize);
    const counts = Array.from({ length: binCount }, () => 0);
    for (const expense of monthlyExpenses) {
      const index = Math.min(binCount - 1, Math.max(0, Math.floor((expense - binStart) / binSize)));
      counts[index] += 1;
    }
    const bins = counts.map((_, index) => {
      const start = binStart + index * binSize;
      const end = index === binCount - 1 ? maxExpense : binStart + (index + 1) * binSize;
      return `${start.toFixed(2)}–${end.toFixed(2)}${symbol}`;
    });
    const traces: Data[] = [{
      x: bins,
      y: counts,
      type: 'bar',
      marker: { color: conceptColor(entry.valor, maxValue) },
      text: counts.map(String),
      textposition: 'outside',
      cliponaxis: false,
      textfont: { color: '#24292f', size: 10 },
      hovertemplate: `Rango: <b>%{x}</b><br>Meses: <b>%{y}</b><extra></extra>`,
    } as Data];
    return <PlotlyChart traces={traces} layout={monthlyLayout} height={280} />;
  }

  return (
    <div className={`gastos-ranking ${showMonthlyMetrics ? 'is-average' : 'is-total'}`}>
      <div className="gastos-ranking-head" aria-hidden="true">
        <span>Concepto</span>
        <span>{showMonthlyMetrics ? 'Media mensual' : 'Total'}</span>
        {showMonthlyMetrics && <span>Desviación mensual</span>}
        <span>Detalle</span>
      </div>
      {ranking.entries.map((entry) => {
        const isOpen = openConcepts.has(entry.concepto);
        const isBreakdownOpen = openBreakdowns.has(entry.concepto);
        const barWidth = (entry.valor / maxValue) * 100;
        return (
          <div className="gastos-ranking-item" key={entry.concepto}>
            <div className={`gastos-ranking-row ${showMonthlyMetrics ? 'is-average' : 'is-total'}`}>
              <div className="gastos-ranking-concept">
                {showMonthlyMetrics && entry.recurrente && (
                  <span
                    className="gastos-ranking-recurrence"
                    title={`Gasto en ${entry.mesesConGasto} de ${entry.mesesEvaluados} meses desde la primera aparición del concepto recurrente`}
                    aria-label={`Gasto en ${entry.mesesConGasto} de ${entry.mesesEvaluados} meses desde la primera aparición del concepto recurrente`}
                  >
                    {entry.mesesConGasto}/{entry.mesesEvaluados} meses
                  </span>
                )}
                <strong>{entry.concepto}</strong>
                {entry.desglose.length > 1 && (
                  <button
                    className={`gastos-breakdown-toggle ${isBreakdownOpen ? 'is-open' : ''}`}
                    type="button"
                    aria-expanded={isBreakdownOpen}
                    aria-label={`${isBreakdownOpen ? 'Ocultar' : 'Mostrar'} desglose de ${entry.concepto}`}
                    title="Desglose por subconcepto"
                    onClick={() => toggleBreakdown(entry.concepto)}
                  >
                    <span aria-hidden="true">›</span>
                  </button>
                )}
              </div>
              <div className="gastos-ranking-bar">
                <div className="gastos-ranking-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: conceptColor(entry.valor, maxValue),
                    }}
                  />
                </div>
                <strong>{entry.valor.toFixed(2)}{symbol}</strong>
              </div>
              {showMonthlyMetrics && (
                <span className="gastos-ranking-deviation">
                  <small>σ</small> {entry.desviacion.toFixed(2)}{symbol}/mes
                </span>
              )}
              <button
                className="btn btn-ghost btn-compact gastos-detail-toggle"
                type="button"
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Ocultar' : 'Ver'} detalle de ${entry.concepto}`}
                onClick={() => toggleConcept(entry.concepto)}
              >
                {isOpen ? 'Ocultar detalle' : 'Ver detalle'}
              </button>
            </div>
            {isOpen && (
              <div className="gastos-monthly-detail">
                <div className="gastos-hist-head">
                  <div className="chart-label">Distribución mensual · {entry.concepto}</div>
                  <span>{entry.mesesConGasto} meses con gasto</span>
                </div>
                {renderHistogram(entry)}
              </div>
            )}
            {isBreakdownOpen && (
              <div className="gastos-subconcept-detail" aria-label={`Desglose por subconcepto de ${entry.concepto}`}>
                {entry.desglose.map((group, index) => {
                  const percentage = entry.valor > 0 ? Math.min(100, (group.valor / entry.valor) * 100) : 0;
                  return (
                    <div className="gastos-subconcept-row" key={group.subconcepto ?? '__otros__'}>
                      <span className="gastos-subconcept-name">{group.subconcepto ?? 'Otros'}</span>
                      <div className="gastos-subconcept-track" aria-label={`${percentage.toFixed(0)} %`}>
                        <span style={{ width: `${percentage}%`, backgroundColor: subconceptColors[index % subconceptColors.length] }} />
                      </div>
                      <strong>{group.valor.toFixed(2)}{symbol}{showMonthlyMetrics ? '/mes' : ''}</strong>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
