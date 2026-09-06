import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backendFixture, expectedValues } from '../../test/goldenMaster';
import { extractVisibleText } from '../../test/extractVisibleText';
import { KpiCardsIbkr } from './KpiCardsIbkr';
import type { KpiPeriod } from '../../api/types';

describe('KpiCardsIbkr', () => {
  it.each(['mes', 'trimestre', 'año'] satisfies KpiPeriod[])(
    // Saldo/En carteras ahora reflejan la divisa real de la cuenta (USD) --
    // el vanilla nunca distinguió divisa por cuenta, siempre € fijo. Se
    // transforman solo esos dos valores del golden master; Aportado/P&L
    // siguen en € (ver KpiCardsIbkr.tsx).
    'coincide con el golden master para period=%s salvo Saldo/En carteras en USD',
    (period) => {
      const kpi = backendFixture.investment1_kpis_by_period[period];
      const { container } = render(<KpiCardsIbkr kpi={kpi} period={period} currency="USD" />);
      const expected = [...expectedValues.investment1_kpis[period]];
      expected[1] = expected[1].replace('€', '$');
      expected[6] = expected[6].replace('€', '$');
      expect(extractVisibleText(container)).toEqual(expected);
    },
  );
});
