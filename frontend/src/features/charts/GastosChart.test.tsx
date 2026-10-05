import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GastosRankingSection } from '../../api/types';
import { backendFixture } from '../../test/goldenMaster';
import { GastosChart } from './GastosChart';

const newPlot = vi.fn();
vi.mock('plotly.js-dist-min', () => ({
  default: { newPlot: (...args: unknown[]) => newPlot(...args), purge: vi.fn() },
}));

describe('GastosChart', () => {
  beforeEach(() => newPlot.mockClear());

  it('muestra recurrencia, barra, desviación y detalle por concepto', () => {
    const ranking = backendFixture.cash1_gastos_ranking_all_media.ranking as GastosRankingSection;
    render(<GastosChart ranking={ranking} />);
    expect(screen.getAllByText(/meses$/)).toHaveLength(ranking.entries.length);
    expect(screen.getAllByRole('button', { name: /^Ver detalle de / })).toHaveLength(ranking.entries.length);
    expect(screen.getAllByText(/σ/)).toHaveLength(ranking.entries.length);
    const colors = ranking.entries.map((entry) => {
      const bar = screen.getByText(entry.concepto).closest('.gastos-ranking-row')?.querySelector('.gastos-ranking-track span');
      return (bar as HTMLElement).style.backgroundColor;
    });
    expect(new Set(colors).size).toBeGreaterThan(1);
  });

  it('construye el detalle mensual bajo demanda para los conceptos del ranking', () => {
    const ranking = backendFixture.cash1_gastos_ranking_all_media.ranking as GastosRankingSection;
    render(<GastosChart ranking={ranking} />);

    const concept = ranking.entries[0].concepto;
    const mainBarColor = screen.getByText(concept)
      .closest('.gastos-ranking-row')
      ?.querySelector('.gastos-ranking-track span') as HTMLElement;
    fireEvent.click(screen.getByRole('button', { name: `Ver detalle de ${concept}` }));

    expect(screen.getByRole('button', { name: `Ocultar detalle de ${concept}` })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(`${ranking.entries[0].mesesConGasto} meses con gasto`)).toBeInTheDocument();
    const [, traces, layout] = newPlot.mock.calls.at(-1)!;
    expect(traces).toHaveLength(1);
    expect(traces[0].type).toBe('bar');
    const colorProbe = document.createElement('span');
    colorProbe.style.color = traces[0].marker.color;
    document.body.append(colorProbe);
    expect(getComputedStyle(colorProbe).color).toBe(getComputedStyle(mainBarColor).backgroundColor);
    colorProbe.remove();
    expect(traces[0].x).toHaveLength(ranking.entries[0].mesesConGasto);
    expect(traces[0].x[0]).toContain('–');
    expect(traces[0].y.reduce((total: number, count: number) => total + count, 0)).toBe(
      ranking.entries[0].mensual.filter((amount) => amount > 0).length,
    );
    expect(traces[0].text).toEqual(traces[0].y.map(String));
    expect(layout.xaxis.title.text).toBe('<b>Rango del gasto mensual</b>');
    expect(layout.yaxis.title.text).toBe('<b>Meses con gasto</b>');
  });
});
