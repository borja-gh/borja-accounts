import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backendFixture } from '../../test/goldenMaster';
import { extractVisibleText } from '../../test/extractVisibleText';
import { money } from '../../lib/format';
import { KpiCardsInvestment } from './KpiCardsInvestment';
import { kpiLabel } from './kpiLabel';
import type { KpiPeriod } from '../../api/types';

function deltaText(diff: number): string {
  if (diff === 0) return '= igual al período anterior';
  const arrow = diff > 0 ? '↑' : '↓';
  const sign = diff > 0 ? '+' : '';
  return `${arrow} ${sign}${money(diff, 'USD')} vs ant.`;
}

describe('KpiCardsInvestment', () => {
  it.each(['mes', 'trimestre', 'año'] satisfies KpiPeriod[])(
    'renderiza los KPIs del fixture en USD para period=%s',
    (period) => {
      const kpi = backendFixture.investment1_kpis_by_period[period];
      const { container } = render(<KpiCardsInvestment kpi={kpi} period={period} currency="USD" />);
      const lbl = kpiLabel(period);
      const expected = [
        'Saldo',
        money(kpi.saldo, 'USD'),
        'Saldo preventa',
        money(kpi.saldoPreventa, 'USD'),
        'Con el último precio de mercado consultado',
        `Aportado neto · ${lbl}`,
        money(kpi.aportado, 'USD'),
        deltaText(kpi.aportadoDelta.diff),
        'En carteras',
        money(kpi.enCarteras, 'USD'),
        kpi.enCarterasCount ? `${kpi.enCarterasCount} abierta${kpi.enCarterasCount !== 1 ? 's' : ''}` : 'ninguna abierta',
        `P&L cerrado · ${lbl}`,
        money(kpi.pnl, 'USD'),
        deltaText(kpi.pnlDelta.diff),
      ];
      expect(extractVisibleText(container)).toEqual(expected);
    },
  );
});
