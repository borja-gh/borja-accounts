import type { Data } from 'plotly.js-dist-min';
import type { AccountKind, PortfolioReport } from '../../api/types';
import { PlotlyChart } from '../../components/PlotlyChart';
import { CURRENCY_SUFFIX, money } from '../../lib/format';
import { resolveTheme, type ThemeName } from '../../styles/themes';
import { baseLayout } from './baseLayout';

interface Props {
  report: PortfolioReport;
  currency: string;
  kind: AccountKind;
  theme?: ThemeName | null;
}

export function CarterasChart({ report, currency, kind, theme }: Props) {
  const entries = report.openPositions.filter((position) => position.invertido > 0)
    .sort((a, b) => b.invertido - a.invertido);
  if (!entries.length) {
    return <div className="empty">Aún no hay capital en carteras abiertas.</div>;
  }

  const accent = resolveTheme(theme, kind).accent;
  const values = entries.map((position) => position.invertido);
  const maxValue = Math.max(...values);
  const channels = accent.slice(1).match(/.{2}/g)!.map((channel) => parseInt(channel, 16));
  const darkerAccent = `#${channels.map((channel) =>
    Math.round(channel * 0.55).toString(16).padStart(2, '0'),
  ).join('')}`;
  const names = entries.map((position) => position.concepto);
  const layout = baseLayout();
  const traces: Data[] = [{
    type: 'bar',
    orientation: 'h',
    x: values,
    y: names,
    text: values.map((value) => money(value, currency)),
    textposition: 'outside',
    cliponaxis: false,
    textfont: { color: '#17130e', size: 12 },
    hovertemplate: '<b>%{y}</b><br>%{text}<extra></extra>',
    marker: {
      color: values,
      colorscale: [[0, accent], [1, darkerAccent]],
      cmin: 0,
      cmax: maxValue,
      showscale: false,
    },
  } as Data];

  return (
    <figure className="portfolio-distribution" aria-label="Distribución del capital en carteras abiertas">
      <PlotlyChart traces={traces} layout={{
        ...layout,
        hovermode: 'closest',
        margin: { l: 8, r: 70, t: 10, b: 36 },
        xaxis: { ...layout.xaxis, range: [0, maxValue * 1.35], ticksuffix: CURRENCY_SUFFIX[currency] ?? currency },
        yaxis: {
          ...layout.yaxis,
          autorange: 'reversed',
          automargin: true,
          tickvals: names,
          ticktext: names.map((name) => name.length > 26 ? `${name.slice(0, 24)}…` : name),
          tickfont: { color: '#17130e', size: 12 },
        },
        showlegend: false,
      }} height={Math.max(280, entries.length * 36 + 50)} />
      <figcaption className="portfolio-distribution-legend">
        <span>Longitud y color según el capital</span>
        <span className="portfolio-distribution-scale" style={{ background: `linear-gradient(to right, ${accent}, ${darkerAccent})` }} aria-hidden="true" />
        <span>Menor a mayor</span>
      </figcaption>
      <ul className="portfolio-distribution-values">
        {entries.map((position) => (
          <li key={position.concepto}>{position.concepto}: {money(position.invertido, currency)}</li>
        ))}
      </ul>
    </figure>
  );
}
