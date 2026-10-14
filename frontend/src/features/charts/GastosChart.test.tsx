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

  it('muestra el histograma del concepto padre y subtotales sin métricas por subconcepto', () => {
    const source = backendFixture.cash1_gastos_ranking_all_media.ranking as GastosRankingSection;
    const ranking = {
      ...source,
      entries: source.entries.map((entry, index) => ({
        ...entry,
        desglose: index === 0
          ? [{ subconcepto: 'Artista A', valor: 12 }, { subconcepto: null, valor: 3 }]
          : [],
      })),
    };
    render(<GastosChart ranking={ranking} />);

    const concept = ranking.entries[0].concepto;
    fireEvent.click(screen.getByRole('button', { name: `Ver detalle de ${concept}` }));

    expect(screen.getByRole('button', { name: `Ocultar detalle de ${concept}` })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Artista A')).toBeInTheDocument();
    expect(screen.getByText('Otros')).toBeInTheDocument();
    expect(newPlot).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/σ.*Artista/)).not.toBeInTheDocument();
  });
});
