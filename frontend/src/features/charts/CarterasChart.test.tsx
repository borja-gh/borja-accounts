import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backendFixture } from '../../test/goldenMaster';
import { CarterasChart } from './CarterasChart';

const newPlot = vi.fn();
vi.mock('plotly.js-dist-min', () => ({
  default: { newPlot: (...args: unknown[]) => newPlot(...args), purge: vi.fn() },
}));

describe('CarterasChart', () => {
  beforeEach(() => newPlot.mockClear());

  it('representa el capital abierto de holdings y carteras legado en la divisa de la cuenta', () => {
    const report = backendFixture.investment1_carteras_report_3m;
    render(<CarterasChart report={report} currency="USD" kind="INVESTMENT" />);
    const [, traces] = newPlot.mock.calls[0];
    expect(traces[0].type).toBe('bar');
    expect(traces[0].orientation).toBe('h');
    expect(traces[0].y).toEqual(['Cartera Prueba', 'Cartera Global']);
    expect(traces[0].x).toEqual(report.openPositions.map((position: { invertido: number }) => position.invertido));
    expect(traces[0].marker.color).toEqual(traces[0].x);
    expect(traces[0].text[0]).toContain('$');
  });

  it('no limita a doce carteras y muestra un estado vacío sin posiciones abiertas', () => {
    const report = backendFixture.investment1_carteras_report_3m;
    const openPositions = Array.from({ length: 15 }, (_, i) => ({ ...report.openPositions[0], concepto: `Cartera ${i}`, invertido: i + 1 }));
    const { rerender } = render(<CarterasChart report={{ ...report, openPositions }} currency="EUR" kind="INVESTMENT" theme="teal" />);
    expect(newPlot.mock.calls[0][1][0].x).toEqual(Array.from({ length: 15 }, (_, i) => 15 - i));
    const tealColors = newPlot.mock.calls[0][1][0].marker.colorscale;
    expect(tealColors[0][1]).not.toBe(tealColors[1][1]);
    rerender(<CarterasChart report={{ ...report, openPositions }} currency="EUR" kind="INVESTMENT" theme="forest" />);
    expect(newPlot.mock.calls.at(-1)?.[1][0].marker.colorscale).not.toEqual(tealColors);
    rerender(<CarterasChart report={{ ...report, openPositions: [] }} currency="EUR" kind="INVESTMENT" />);
    expect(screen.getByText('Aún no hay capital en carteras abiertas.')).toBeInTheDocument();
  });
});
