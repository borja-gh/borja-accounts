import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backendFixture } from '../../test/goldenMaster';
import { CarterasChart } from './CarterasChart';

const newPlot = vi.fn();
vi.mock('plotly.js-dist-min', () => ({
  default: { newPlot: (...args: unknown[]) => newPlot(...args), purge: vi.fn() },
}));

describe('CarterasChart', () => {
  beforeEach(() => newPlot.mockClear());

  it('pinta el ranking de holdings abiertas en la divisa de la cuenta', () => {
    const report = backendFixture.investment1_carteras_ranking_all_total;
    render(<CarterasChart report={report} kind="INVESTMENT" />);
    const [, traces] = newPlot.mock.calls[0];
    expect(report.entries).toEqual([{ concepto: 'Cartera Prueba', valor: 1000 }]);
    expect(traces[0].x).toEqual([1000]);
    expect(traces[0].text[0]).toContain('$');
  });
});
