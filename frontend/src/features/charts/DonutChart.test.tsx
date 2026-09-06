import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backendFixture, rawFrontendSnapshot } from '../../test/goldenMaster';
import { DonutChart } from './DonutChart';

const newPlot = vi.fn();
vi.mock('plotly.js-dist-min', () => ({
  default: { newPlot: (...args: unknown[]) => newPlot(...args), purge: vi.fn() },
}));

describe('DonutChart', () => {
  beforeEach(() => newPlot.mockClear());

  it('coincide con el golden master salvo el hoverSuffix de modo "media" (el vanilla nunca varió este texto)', () => {
    const donut = backendFixture.cash1_gastos_ranking_all_media.donut;
    render(<DonutChart donut={donut} />);
    const [, traces, layout] = newPlot.mock.calls[0];
    const expected = rawFrontendSnapshot.cash1_charts_all['c-donut'];
    const expectedTraces = expected.traces.map((t: { hovertemplate: string }) => ({
      ...t,
      hovertemplate: t.hovertemplate.replace('%{value:,.2f}€', `%{value:,.2f}${donut.hoverSuffix}`),
    }));
    expect(traces).toEqual(expectedTraces);
    expect(layout).toEqual(expected.layout);
  });
});
