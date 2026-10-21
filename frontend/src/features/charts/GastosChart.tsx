import { useState } from 'react';
import type { Data, Layout } from 'plotly.js-dist-min';
import type { GastosRankingEntry, GastosRankingSection, Movement } from '../../api/types';
import { PlotlyChart } from '../../components/PlotlyChart';
import { baseLayout } from './baseLayout';

function conceptColor(value: number, maxValue: number) {
  const intensity = value / maxValue;
  return `hsl(170 ${35 + 35 * intensity}% ${85 - 52 * intensity}%)`;
}

const subconceptColors = ['#8250df', '#0969da', '#bf8700', '#cf222e', '#1a7f37'];

function monthDistance(from: string, to: string) {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12
    + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
}

function previousMonth(value: string) {
  const date = new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function comparison(movements: Movement[], concept: string, recurrente: boolean, subconcept?: string | null) {
  const conceptExpenses = movements.filter((movement) => movement.Tipo === 'Gasto' && movement.Concepto === concept);
  const expenses = subconcept === undefined
    ? conceptExpenses
    : conceptExpenses.filter((movement) => movement.Subconcepto === subconcept);
  const current = new Date();
  const currentMonth = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = previousMonth(currentMonth);
  const firstConceptMonth = conceptExpenses.reduce<string | null>((first, movement) => {
    const month = movement.Fecha.slice(0, 7);
    return first === null || month < first ? month : first;
  }, null);
  const recordStart = movements.reduce<string | null>((first, movement) => {
    const month = movement.Fecha.slice(0, 7);
    return first === null || month < first ? month : first;
  }, null);
  const startMonth = recurrente ? firstConceptMonth : recordStart;
  const historicalMonths = startMonth && startMonth <= lastMonth ? monthDistance(startMonth, lastMonth) : 0;
  const historicalTotal = startMonth
    ? expenses.reduce((total, movement) => {
      const month = movement.Fecha.slice(0, 7);
      return month >= startMonth && month <= lastMonth ? total + movement.Total : total;
    }, 0)
    : 0;
  const totalInMonth = (month: string) => expenses
    .filter((movement) => movement.Fecha.startsWith(month))
    .reduce((total, movement) => total + movement.Total, 0);
  return {
    thisMonth: totalInMonth(currentMonth),
    lastMonth: totalInMonth(lastMonth),
    historicalAverage: historicalMonths ? historicalTotal / historicalMonths : null,
  };
}

function monthlySubconcepts(movements: Movement[], concept: string, recurrente: boolean) {
  const subconcepts = [...new Set(movements
    .filter((movement) => movement.Tipo === 'Gasto' && movement.Concepto === concept)
    .map((movement) => movement.Subconcepto))];
  return subconcepts.map((subconcepto) => {
    const metrics = comparison(movements, concept, recurrente, subconcepto);
    return {
      subconcepto,
      valor: metrics.thisMonth,
      lastMonth: metrics.lastMonth,
      historicalAverage: metrics.historicalAverage,
    };
  }).sort((a, b) => b.valor - a.valor || (a.subconcepto ?? '').localeCompare(b.subconcepto ?? '', 'es'));
}

function dailyExpenses(movements: Movement[], concept: string) {
  const totals = new Map<string, number>();
  for (const movement of movements) {
    if (movement.Tipo !== 'Gasto' || movement.Concepto !== concept) continue;
    const day = movement.Fecha.slice(0, 10);
    totals.set(day, (totals.get(day) ?? 0) + movement.Total);
  }
  return [...totals.values()].filter((amount) => amount > 0);
}

export function GastosChart({
  ranking,
  movements = [],
  showDailyDetails = true,
  showMonthComparison = false,
}: {
  ranking: GastosRankingSection;
  movements?: Movement[];
  showDailyDetails?: boolean;
  showMonthComparison?: boolean;
}) {
  const [openConcepts, setOpenConcepts] = useState<Set<string>>(() => new Set());
  const [openBreakdowns, setOpenBreakdowns] = useState<Set<string>>(() => new Set());
  if (!ranking.hasGastos || !ranking.entries.length) {
    return <PlotlyChart traces={null} layout={{}} height={480} />;
  }

  const maxValue = Math.max(...ranking.entries.map((entry) => entry.valor));
  const symbol = ranking.hoverSuffix.charAt(0) || '€';
  const showMonthlyMetrics = !showMonthComparison && ranking.hoverSuffix.endsWith('/mes');
  const base = baseLayout();
  const histogramYAxisStep = (maxCount: number) => Math.max(1, Math.ceil(maxCount / 5));
  const dailyLayout: Partial<Layout> = {
    ...base,
    margin: { l: 56, r: 18, t: 28, b: 96 },
    xaxis: {
      ...base.xaxis,
      type: 'category',
      tickangle: -45,
      tickfont: { color: '#57606a', size: 9 },
      automargin: true,
      title: { text: '<b>Rango del gasto diario</b>' },
    },
    yaxis: {
      ...base.yaxis,
      type: 'linear',
      rangemode: 'tozero',
      dtick: 1,
      tickformat: '.0f',
      title: { text: '<b>Días con gasto</b>' },
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
    const dailyExpensesByConcept = dailyExpenses(movements, entry.concepto);
    if (!dailyExpensesByConcept.length) {
      return <p className="gastos-hist-empty">No hay días con gasto en el histórico.</p>;
    }
    const binCount = Math.ceil(dailyExpensesByConcept.length / 2);
    const minExpense = Math.min(...dailyExpensesByConcept);
    const maxExpense = Math.max(...dailyExpensesByConcept);
    const expenseRange = maxExpense - minExpense;
    const binSize = expenseRange > 0 ? expenseRange / binCount : Math.max(maxExpense * 0.05, 0.01);
    const binStart = expenseRange > 0 ? minExpense : Math.max(0, maxExpense - binSize);
    const counts = Array.from({ length: binCount }, () => 0);
    for (const expense of dailyExpensesByConcept) {
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
      hovertemplate: `Rango: <b>%{x}</b><br>Días: <b>%{y}</b><extra></extra>`,
    } as Data];
    const layout: Partial<Layout> = {
      ...dailyLayout,
      yaxis: {
        ...dailyLayout.yaxis,
        dtick: histogramYAxisStep(Math.max(...counts)),
      },
    };
    return <PlotlyChart traces={traces} layout={layout} height={280} />;
  }

  function comparisonChips(average: number | null, current: number, previous: number) {
    const difference = Number((current - previous).toFixed(2));
    const trend = difference > 0 ? 'is-spending-up' : difference < 0 ? 'is-spending-down' : '';
    return (
      <span className="gastos-comparison-chips">
        <span className="gastos-comparison-chip">Media histórica <strong>{average === null ? '—' : `${average.toFixed(2)}${symbol}/mes`}</strong></span>
        <span className={`gastos-comparison-chip ${trend}`}>
          Mes anterior <strong>{previous.toFixed(2)}{symbol}</strong>
          {difference !== 0 && <small>{difference > 0 ? '+' : ''}{difference.toFixed(2)}{symbol}</small>}
        </span>
      </span>
    );
  }

  return (
    <div className={`gastos-ranking ${showMonthlyMetrics ? 'is-average' : 'is-total'}`}>
      <div
        className={`gastos-ranking-head ${showMonthlyMetrics ? 'is-average' : showMonthComparison ? 'is-current-month' : 'is-total'}`}
        aria-hidden="true"
      >
        <span>Concepto</span>
        <span>{showMonthlyMetrics ? 'Media mensual' : showMonthComparison ? 'Total del mes' : 'Total'}</span>
        {showMonthlyMetrics && <span>Desviación mensual</span>}
        {showMonthComparison ? <span>Comparativa</span> : <span>Detalle</span>}
      </div>
      {ranking.entries.map((entry) => {
        const isOpen = openConcepts.has(entry.concepto);
        const isBreakdownOpen = openBreakdowns.has(entry.concepto);
        const barWidth = (entry.valor / maxValue) * 100;
        const currentComparison = comparison(movements, entry.concepto, entry.recurrente);
        const breakdown = showMonthComparison
          ? monthlySubconcepts(movements, entry.concepto, entry.recurrente)
          : entry.desglose;
        const dailyCount = showDailyDetails ? dailyExpenses(movements, entry.concepto).length : 0;
        return (
          <div className="gastos-ranking-item" key={entry.concepto}>
            <div className={`gastos-ranking-row ${showMonthlyMetrics ? 'is-average' : showMonthComparison ? 'is-current-month' : 'is-total'}`}>
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
                {breakdown.length > 1 && (
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
              {showMonthComparison && (
                <div className="gastos-comparison-inline">
                  {comparisonChips(currentComparison.historicalAverage, currentComparison.thisMonth, currentComparison.lastMonth)}
                </div>
              )}
              {showDailyDetails && <button
                className="btn btn-ghost btn-compact gastos-detail-toggle"
                type="button"
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Ocultar' : 'Ver'} detalle de ${entry.concepto}`}
                onClick={() => toggleConcept(entry.concepto)}
              >
                {isOpen ? 'Ocultar detalle' : 'Ver histograma'}
              </button>}
            </div>
            {isOpen && (
              <div className="gastos-monthly-detail">
                <div className="gastos-hist-head">
                  <div className="chart-label">Distribución diaria · {entry.concepto}</div>
                  <span>{dailyCount} días con gasto</span>
                </div>
                {renderHistogram(entry)}
              </div>
            )}
            {isBreakdownOpen && (
              <div className="gastos-subconcept-detail" aria-label={`Desglose por subconcepto de ${entry.concepto}`}>
                {breakdown.map((group, index) => {
                  const percentage = entry.valor > 0 ? Math.min(100, (group.valor / entry.valor) * 100) : 0;
                  const subgroupComparison = comparison(movements, entry.concepto, entry.recurrente, group.subconcepto);
                  return (
                    <div className={`gastos-subconcept-row ${showMonthComparison ? 'is-current-month' : ''}`} key={group.subconcepto ?? '__otros__'}>
                      <span className="gastos-subconcept-name">{group.subconcepto ?? 'Otros'}</span>
                      <div className="gastos-subconcept-track" aria-label={`${percentage.toFixed(0)} %`}>
                        <span style={{ width: `${percentage}%`, backgroundColor: subconceptColors[index % subconceptColors.length] }} />
                      </div>
                      <strong>{group.valor.toFixed(2)}{symbol}{showMonthlyMetrics ? '/mes' : ''}</strong>
                      {showMonthComparison && (
                        <span className="gastos-subconcept-comparison">
                          {comparisonChips(subgroupComparison.historicalAverage, subgroupComparison.thisMonth, subgroupComparison.lastMonth)}
                        </span>
                      )}
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
