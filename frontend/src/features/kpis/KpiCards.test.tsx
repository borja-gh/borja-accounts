import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backendFixture, expectedValues } from '../../test/goldenMaster';
import { extractVisibleText } from '../../test/extractVisibleText';
import { KpiCards } from './KpiCards';
import type { KpiPeriod } from '../../api/types';

describe('KpiCards (CASH)', () => {
  it.each(['mes', 'trimestre', 'año'] satisfies KpiPeriod[])(
    'coincide con el golden master para period=%s',
    (period) => {
      const kpi = backendFixture.cash1_kpis_by_period[period];
      const { container } = render(<KpiCards kpi={kpi} period={period} />);
      expect(extractVisibleText(container)).toEqual(expectedValues.cash1_kpis[period]);
    },
  );
});
