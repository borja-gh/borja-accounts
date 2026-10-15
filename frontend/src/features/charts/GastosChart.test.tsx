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

  it('muestra recurrencia, barra, desviación y desglose solo cuando hay varios subconceptos', () => {
    const source = backendFixture.cash1_gastos_ranking_all_media.ranking as GastosRankingSection;
    const ranking = {
      ...source,
      entries: source.entries.map((entry, index) => ({
        ...entry,
        desglose: index === 0
          ? [{ subconcepto: 'Artista A', valor: 12 }, { subconcepto: null, valor: 3 }]
          : index === 1 ? [{ subconcepto: 'Único', valor: 4 }] : [],
      })),
    };
    const { container } = render(<GastosChart ranking={ranking} />);
    expect(screen.getAllByText(/meses$/)).toHaveLength(ranking.entries.filter((entry) => entry.recurrente).length);
    expect(container.querySelector('.gastos-ranking-recurrence'))
      .toHaveAttribute('title', expect.stringContaining('desde la primera aparición del concepto recurrente'));
    expect(screen.getAllByRole('button', { name: /^Ver detalle de / })).toHaveLength(ranking.entries.length);
    expect(screen.getAllByText(/σ/)).toHaveLength(ranking.entries.length);
    const colors = ranking.entries.map((entry) => {
      const bar = screen.getByText(entry.concepto).closest('.gastos-ranking-row')?.querySelector('.gastos-ranking-track span');
      return (bar as HTMLElement).style.backgroundColor;
    });
    expect(new Set(colors).size).toBeGreaterThan(1);
  });

  it('separa el histograma del desglose jerárquico con barras porcentuales', () => {
    const source = backendFixture.cash1_gastos_ranking_all_media.ranking as GastosRankingSection;
    const ranking = {
      ...source,
      entries: source.entries.map((entry, index) => ({
        ...entry,
        mensual: index === 0 ? [40, 43, 39, 55, 49, 50, 60, 74, 18.36] : entry.mensual,
        desglose: index === 0
          ? [{ subconcepto: 'Artista A', valor: 720 }, { subconcepto: null, valor: 180 }]
          : [],
      })),
    };
    render(<GastosChart ranking={ranking} />);

    const concept = ranking.entries[0].concepto;
    fireEvent.click(screen.getByRole('button', { name: `Ver detalle de ${concept}` }));

    expect(screen.getByRole('button', { name: `Ocultar detalle de ${concept}` })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(`Distribución mensual · ${concept}`)).toBeInTheDocument();
    expect(screen.queryByText('Artista A')).not.toBeInTheDocument();
    expect(newPlot).toHaveBeenCalledTimes(1);

    const histogramTraces = newPlot.mock.calls[0][1] as Array<{ x: string[] }>;
    expect(histogramTraces[0].x).toHaveLength(ranking.entries[0].mensual.filter((amount) => amount > 0).length);
    expect(histogramTraces[0].x[0]).toContain('18.36');
    const histogramCounts = newPlot.mock.calls[0][1] as Array<{ y: number[] }>;
    expect(histogramCounts[0].y.filter((count) => count > 0)).toHaveLength(6);

    fireEvent.click(screen.getByRole('button', { name: `Mostrar desglose de ${concept}` }));
    expect(screen.getByRole('button', { name: `Ocultar desglose de ${concept}` })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Artista A')).toBeInTheDocument();
    expect(screen.getByText('Otros')).toBeInTheDocument();
    expect(screen.getByLabelText('80 %')).toBeInTheDocument();
    expect(screen.getByLabelText('20 %')).toBeInTheDocument();
    expect(screen.getByText('Artista A').closest('.gastos-subconcept-row')?.querySelector('.gastos-subconcept-track span'))
      .toHaveStyle({ width: '80%' });
  });
});
