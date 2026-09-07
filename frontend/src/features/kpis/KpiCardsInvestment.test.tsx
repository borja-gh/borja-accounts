import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backendFixture, expectedValues } from '../../test/goldenMaster';
import { extractVisibleText } from '../../test/extractVisibleText';
import { KpiCardsInvestment } from './KpiCardsInvestment';
import type { KpiPeriod } from '../../api/types';

describe('KpiCardsInvestment', () => {
  it.each(['mes', 'trimestre', 'año'] satisfies KpiPeriod[])(
    // Todos los importes reflejan la divisa real de la cuenta (USD) -- el
    // vanilla nunca distinguió divisa por cuenta, siempre € fijo (ver
    // KpiCardsInvestment.tsx).
    'coincide con el golden master para period=%s salvo todos los importes en USD',
    (period) => {
      const kpi = backendFixture.investment1_kpis_by_period[period];
      const { container } = render(<KpiCardsInvestment kpi={kpi} period={period} currency="USD" />);
      const expected = expectedValues.investment1_kpis[period].map((s: string) => s.replace(/€/g, '$'));
      expect(extractVisibleText(container)).toEqual(expected);
    },
  );
});
