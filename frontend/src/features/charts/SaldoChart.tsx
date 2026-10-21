import type { Data, Layout } from 'plotly.js-dist-min';
import type { AccountKind, SaldoEvolucionReport } from '../../api/types';
import { PlotlyChart } from '../../components/PlotlyChart';
import { CURRENCY_SUFFIX, money } from '../../lib/format';
import { chartLineColor, type ThemeName } from '../../styles/themes';
import { baseLayout } from './baseLayout';

interface Props {
  kind: AccountKind;
  report: SaldoEvolucionReport;
  currency: string;
  theme?: ThemeName | null;
}

// La traza "Media 30d" se omitió en la limpieza de UI y el backend ya
// no la calcula. El snapshot vanilla (rawFrontendSnapshot) sí tenía
// Saldo + Media 30d -- este test documenta esa divergencia a propósito.
//
// Para INVESTMENT esta serie se recalcula con la misma regla que el KPI
// Saldo (GetSaldoEvolucionUseCase → ledger + holdings sintéticos). NO es
// mark-to-market (eso es "Saldo preventa"). Se etiqueta "Capital aportado"
// para no confundirlo con NAV.
export function SaldoChart({ kind, report, currency, theme }: Props) {
  const L = baseLayout();
  const lineColor = chartLineColor(theme, kind);
  const label = kind === 'INVESTMENT' ? 'Capital aportado' : 'Saldo';
  const symbol = CURRENCY_SUFFIX[currency] ?? currency;
  const dailyClosing = new Map<string, number>();
  report.dates.forEach((date, index) => dailyClosing.set(date.slice(0, 10), report.saldos[index]));
  const dailyDates = [...dailyClosing.keys()].sort();
  const averageDates: string[] = [];
  const averageValues: number[] = [];
  if (dailyDates.length) {
    const [startYear, startMonth, startDay] = dailyDates[0].split('-').map(Number);
    const [endYear, endMonth, endDay] = dailyDates[dailyDates.length - 1].split('-').map(Number);
    const cursor = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);
    const trailing: number[] = [];
    let closing: number | undefined;
    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      if (dailyClosing.has(key)) closing = dailyClosing.get(key);
      if (closing !== undefined) {
        trailing.push(closing);
        if (trailing.length > 30) trailing.shift();
        averageDates.push(key);
        averageValues.push(trailing.reduce((sum, value) => sum + value, 0) / trailing.length);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const traces: Data[] = [
    {
      x: report.dates,
      y: report.saldos,
      type: 'scatter',
      mode: 'lines',
      name: `${label} (${money(report.actual, currency)})`,
      line: { color: lineColor, width: 2.5 },
      hovertemplate: `%{x|%d/%m/%y}: <b>%{y:,.2f}${symbol}</b><extra></extra>`,
    } as Data,
    {
      x: averageDates,
      y: averageValues,
      type: 'scatter',
      mode: 'lines',
      name: 'Media móvil 30 días',
      line: { color: '#a0a0a0', width: 1.5, dash: 'dot' },
      hovertemplate: `%{x|%d/%m/%y}: <b>%{y:,.2f}${symbol}</b><extra></extra>`,
    } as Data,
  ];

  const layout: Partial<Layout> = {
    ...L,
    xaxis: { ...L.xaxis, type: 'date' },
    yaxis: { ...L.yaxis, ticksuffix: symbol, zeroline: true, zerolinecolor: 'rgba(0,0,0,.1)' },
  };

  return <PlotlyChart traces={traces} layout={layout} />;
}
