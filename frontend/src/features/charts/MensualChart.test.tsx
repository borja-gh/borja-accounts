import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backendFixture, rawFrontendSnapshot, withCurrentFont } from '../../test/goldenMaster';
import { MensualChart } from './MensualChart';

const newPlot = vi.fn();
vi.mock('plotly.js-dist-min', () => ({
  default: { newPlot: (...args: unknown[]) => newPlot(...args), purge: vi.fn() },
}));

describe('MensualChart', () => {
  beforeEach(() => newPlot.mockClear());

  it('representa las devoluciones netas como entrada y mantiene el balance mensual', () => {
    render(<MensualChart report={{ meses: ['2026-09', '2026-10'], ingresos: [0, 0], gastos: [100, -60], balance: [-100, 60] }} />);
    const [, traces] = newPlot.mock.calls[0];
    expect(traces[1].y).toEqual([-100, 60]);
    expect(traces[1].customdata).toEqual([100, -60]);
    expect(traces[2].y).toEqual([-100, 60]);
  });

  it('coincide con el golden master', () => {
    const report = backendFixture.cash1_mensual_evolucion_all;
    render(<MensualChart report={report} />);
    const [, traces, layout] = newPlot.mock.calls[0];
    const expected = rawFrontendSnapshot.cash1_charts_all['c-mensual'];
    expect(traces).toEqual(expected.traces);
    expect(layout).toEqual(withCurrentFont(expected.layout));
  });
});
