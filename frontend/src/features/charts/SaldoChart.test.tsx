import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backendFixture, rawFrontendSnapshot, withCurrentFont } from '../../test/goldenMaster';
import { SaldoChart } from './SaldoChart';

const newPlot = vi.fn();
const purge = vi.fn();
vi.mock('plotly.js-dist-min', () => ({
  default: {
    newPlot: (...args: unknown[]) => newPlot(...args),
    purge: (...args: unknown[]) => purge(...args),
  },
}));

describe('SaldoChart', () => {
  beforeEach(() => {
    newPlot.mockClear();
    purge.mockClear();
  });

  it('INVESTMENT: el gráfico usa el saldo recalculado (mismo que el KPI), no el balance persistido del CSV', () => {
    const report = backendFixture.investment1_saldo_evolucion_all;
    const kpi = backendFixture.investment1_kpis_by_period.año;
    render(<SaldoChart kind="INVESTMENT" report={report} currency="USD" />);
    expect(newPlot).toHaveBeenCalledTimes(1);
    const [, traces] = newPlot.mock.calls[0];
    expect(report.actual).toBe(kpi.saldo);
    expect(traces[0].y.at(-1)).toBe(kpi.saldo);
    expect(traces[0].name).toContain('Capital aportado');
  });

  it('CASH: omite a propósito la traza "Media 30d" (limpieza de UI, ver docs/ARCHITECTURE.md §0)', () => {
    const report = backendFixture.cash1_saldo_evolucion_all;
    render(<SaldoChart kind="CASH" report={report} currency="EUR" />);
    const [, traces, layout] = newPlot.mock.calls[0];
    const expected = rawFrontendSnapshot.cash1_charts_all['c-saldo'];
    expect(expected.traces).toHaveLength(2); // el vanilla sí emitía Saldo + Media 30d
    expect(traces).toHaveLength(1); // React solo emite la traza de Saldo
    expect(traces[0]).toEqual(expected.traces[0]);
    expect(layout).toEqual(withCurrentFont(expected.layout));
  });
});
