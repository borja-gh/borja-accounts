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

  it('coincide con el golden master', () => {
    const report = backendFixture.cash1_mensual_evolucion_all;
    render(<MensualChart report={report} />);
    const [, traces, layout] = newPlot.mock.calls[0];
    const expected = rawFrontendSnapshot.cash1_charts_all['c-mensual'];
    expect(traces).toEqual(expected.traces);
    expect(layout).toEqual(withCurrentFont(expected.layout));
  });
});
