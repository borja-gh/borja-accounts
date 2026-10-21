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
    const conceptMovements = [40, 43, 39, 55, 49, 50, 60, 74, 18.36].map((total, index) => ({
      Fecha: `2026-${String(index + 1).padStart(2, '0')}-12 12:00:00`,
      Tipo: 'Gasto',
      Concepto: ranking.entries[0].concepto,
      Subconcepto: index % 2 ? 'Artista A' : null,
      Total: total,
      Saldo: 0,
      _idx: index,
    }));
    render(<GastosChart ranking={ranking} movements={conceptMovements} />);

    const concept = ranking.entries[0].concepto;
    fireEvent.click(screen.getByRole('button', { name: `Ver detalle de ${concept}` }));

    expect(screen.getByRole('button', { name: `Ocultar detalle de ${concept}` })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(`Distribución diaria · ${concept}`)).toBeInTheDocument();
    expect(screen.queryByText('Artista A')).not.toBeInTheDocument();
    expect(newPlot).toHaveBeenCalledTimes(1);

    const histogramTraces = newPlot.mock.calls[0][1] as Array<{ x: string[] }>;
    expect(histogramTraces[0].x).toHaveLength(5);
    expect(histogramTraces[0].x[0]).toContain('18.36');
    const histogramCounts = newPlot.mock.calls[0][1] as Array<{ y: number[] }>;
    expect(histogramCounts[0].y.filter((count) => count > 0)).toHaveLength(5);

    fireEvent.click(screen.getByRole('button', { name: `Mostrar desglose de ${concept}` }));
    expect(screen.getByRole('button', { name: `Ocultar desglose de ${concept}` })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Artista A')).toBeInTheDocument();
    expect(screen.getByText('Otros')).toBeInTheDocument();
    expect(screen.getByLabelText('80 %')).toBeInTheDocument();
    expect(screen.getByLabelText('20 %')).toBeInTheDocument();
    expect(screen.getByText('Artista A').closest('.gastos-subconcept-row')?.querySelector('.gastos-subconcept-track span'))
      .toHaveStyle({ width: '80%' });
  });

  it('muestra comparativas del mes actual para el concepto y cada subconcepto', () => {
    const source = backendFixture.cash1_gastos_ranking_all_media.ranking as GastosRankingSection;
    const concept = source.entries[0].concepto;
    const makeDate = (offset: number) => {
      const date = new Date();
      date.setMonth(date.getMonth() + offset, 12);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 12:00:00`;
    };
    const movements = [
      { date: makeDate(-2), subconcept: 'Artista A', total: 10 },
      { date: makeDate(-2), subconcept: 'Artista D', total: 15 },
      { date: makeDate(-1), subconcept: 'Artista B', total: 20 },
      { date: makeDate(-1), subconcept: 'Artista C', total: 30 },
      { date: makeDate(-1), subconcept: 'Artista D', total: 15 },
      { date: makeDate(0), subconcept: 'Artista A', total: 30 },
      { date: makeDate(0), subconcept: 'Artista B', total: 40 },
      { date: makeDate(0), subconcept: 'Artista D', total: 15 },
    ].map((item, index) => ({
      Fecha: item.date,
      Tipo: 'Gasto',
      Concepto: concept,
      Subconcepto: item.subconcept,
      Total: item.total,
      Saldo: 0,
      _idx: index,
    }));
    const ranking = {
      ...source,
      entries: [{
        ...source.entries[0],
        valor: 70,
        recurrente: true,
        desglose: [],
      }],
    };

    const { container } = render(<GastosChart ranking={ranking} movements={movements} showDailyDetails={false} showMonthComparison />);
    expect(screen.queryByText(`Comparativa · ${concept}`)).not.toBeInTheDocument();
    expect(screen.getByText('Media histórica')).toBeInTheDocument();
    expect(screen.getByText('Mes anterior')).toBeInTheDocument();
    expect(screen.queryByText(/σ/)).not.toBeInTheDocument();
    expect(container.querySelector('.gastos-ranking-head.is-current-month')).toHaveTextContent('Comparativa');
    expect(container.querySelector('.gastos-ranking-row.is-current-month .gastos-comparison-inline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Mostrar desglose de ${concept}` }));
    expect(screen.getByText('Artista A')).toBeInTheDocument();
    expect(screen.getByText('Artista B')).toBeInTheDocument();
    expect(screen.getByText('Artista C')).toBeInTheDocument();
    expect(screen.getByText('Artista D')).toBeInTheDocument();
    expect(container.querySelectorAll('.gastos-subconcept-row.is-current-month')).toHaveLength(4);
    expect(container.querySelectorAll('.gastos-subconcept-row.is-current-month .gastos-subconcept-comparison')).toHaveLength(4);
    expect(screen.getByText('Artista C').closest('.gastos-subconcept-row')?.querySelector('.gastos-comparison-chip.is-spending-down'))
      .toBeInTheDocument();
    expect(screen.getByText('-30.00€')).toBeInTheDocument();
    const artistAChips = screen.getByText('Artista A').closest('.gastos-subconcept-row')?.querySelectorAll('.gastos-comparison-chip');
    expect(artistAChips?.[0]).toHaveClass('is-spending-up');
    const artistCChips = screen.getByText('Artista C').closest('.gastos-subconcept-row')?.querySelectorAll('.gastos-comparison-chip');
    expect(artistCChips?.[0]).toHaveClass('is-spending-down');
    expect(screen.getByText('Artista D').closest('.gastos-subconcept-row')?.querySelector('.gastos-comparison-chip.is-spending-up, .gastos-comparison-chip.is-spending-down'))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Ver detalle de ${concept}` })).not.toBeInTheDocument();
  });

  it('calcula los bins según las entradas y espacia los ticks del eje de días', () => {
    const source = backendFixture.cash1_gastos_ranking_all_media.ranking as GastosRankingSection;
    const concept = source.entries[0].concepto;
    const movements = Array.from({ length: 120 }, (_, index) => ({
      Fecha: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')} 12:00:00`,
      Tipo: 'Gasto',
      Concepto: concept,
      Subconcepto: null,
      Total: (index % 12) + 1,
      Saldo: 0,
      _idx: index,
    }));
    const ranking = { ...source, entries: [{ ...source.entries[0], valor: 780, mensual: [], desglose: [] }] };
    render(<GastosChart ranking={ranking} movements={movements} />);
    fireEvent.click(screen.getByRole('button', { name: `Ver detalle de ${concept}` }));

    const traces = newPlot.mock.calls[0][1] as Array<{ x: string[]; y: number[] }>;
    const layout = newPlot.mock.calls[0][2] as { yaxis: { dtick: number } };
    expect(traces[0].x).toHaveLength(60);
    expect(traces[0].y.reduce((sum, count) => sum + count, 0)).toBe(120);
    expect(layout.yaxis.dtick).toBeGreaterThan(1);
  });
});
