import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backendFixture, rawFrontendSnapshot, withCurrentFont } from '../../test/goldenMaster';
import { CarterasChart } from './CarterasChart';

const newPlot = vi.fn();
vi.mock('plotly.js-dist-min', () => ({
  default: { newPlot: (...args: unknown[]) => newPlot(...args), purge: vi.fn() },
}));

describe('CarterasChart', () => {
  beforeEach(() => newPlot.mockClear());

  it('coincide con el golden master salvo el símbolo de divisa (investment1 es USD, el vanilla nunca lo distinguió)', () => {
    const report = backendFixture.investment1_carteras_ranking_all_total;
    render(<CarterasChart report={report} kind="INVESTMENT" />);
    const [, traces, layout] = newPlot.mock.calls[0];
    const expected = rawFrontendSnapshot.investment1_charts_all['c-carteras'];
    const expectedTraces = expected.traces.map((t: { text: string[] }) => ({
      ...t,
      text: t.text.map((s: string) => s.replace('€', '$')),
    }));
    const expectedLayout = withCurrentFont({ ...expected.layout, xaxis: { ...expected.layout.xaxis, ticksuffix: '$' } });
    expect(traces).toEqual(expectedTraces);
    expect(layout).toEqual(expectedLayout);
  });
});
