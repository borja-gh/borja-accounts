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

// La traza "Media 30d" (report.mediaMovil, solo cuentas CASH) se omite a
// propósito -- limpieza de UI acordada en docs/ARCHITECTURE.md §0. El
// backend la sigue calculando (with_media_movil=True para CASH) pero
// ya no se representa.
//
// Para INVESTMENT esta serie sigue viniendo de movements.balance -- capital
// aportado neto histórico, en la divisa nativa de la cuenta (las
// transferencias entre cuentas y el histórico legado se convierten al
// registrarse, ver TransferBetweenAccountsUseCase). NO es el saldo actual
// de mercado que muestra el KPI "Saldo" (ese viene de holdings/ticker_quotes)
// -- por eso se etiqueta explícitamente distinto, para que no se lean como
// la misma magnitud.
export function SaldoChart({ kind, report, currency, theme }: Props) {
  const L = baseLayout();
  const lineColor = chartLineColor(theme, kind);
  const label = kind === 'INVESTMENT' ? 'Capital aportado' : 'Saldo';
  const symbol = CURRENCY_SUFFIX[currency] ?? currency;

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
  ];

  const layout: Partial<Layout> = {
    ...L,
    xaxis: { ...L.xaxis, type: 'date' },
    yaxis: { ...L.yaxis, ticksuffix: symbol, zeroline: true, zerolinecolor: 'rgba(0,0,0,.1)' },
  };

  return <PlotlyChart traces={traces} layout={layout} />;
}
