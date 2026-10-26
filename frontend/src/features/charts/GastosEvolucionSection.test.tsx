import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGastosEvolucion } from '../../api/client';
import type { GastosEvolucionReport, Movement } from '../../api/types';
import { GastosEvolucionSection } from './GastosEvolucionSection';

const newPlot = vi.fn();
vi.mock('plotly.js-dist-min', () => ({ default: { newPlot: (...args: unknown[]) => newPlot(...args), purge: vi.fn() } }));
vi.mock('../../api/client', () => ({ fetchGastosEvolucion: vi.fn() }));

const report: GastosEvolucionReport = {
  meses: ['2026-08', '2026-09', '2026-10'], gastos: [30, 0, 60],
  conceptos: [
    { concepto: 'Comida', gastos: [30, 0, 40], subconceptos: [
      { subconcepto: 'Super', gastos: [30, 0, 20] },
      { subconcepto: null, gastos: [0, 0, 15] },
      { subconcepto: 'Otros', gastos: [0, 0, 5] },
    ] },
    { concepto: 'Ocio', gastos: [0, 0, 20], subconceptos: [{ subconcepto: null, gastos: [0, 0, 20] }] },
  ],
};
const props = { account: 'cash', currency: 'USD', movements: [], reloadToken: 0 };
const latestTrace = () => newPlot.mock.calls.at(-1)?.[1][0];

describe('GastosEvolucionSection', () => {
  it('representa meses de devoluciones con gasto negativo', async () => {
    vi.mocked(fetchGastosEvolucion).mockResolvedValue({ ...report, gastos: [100, 0, -60] });
    render(<GastosEvolucionSection {...props} />);
    await waitFor(() => expect(latestTrace()?.y).toEqual([100, 0, -60]));
    expect(screen.getByText(/Gasto neto mensual/)).toBeInTheDocument();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchGastosEvolucion).mockResolvedValue(report);
  });

  it('permite total, concepto y subconcepto, conserva ceros y usa la divisa de la cuenta', async () => {
    render(<GastosEvolucionSection {...props} />);
    await waitFor(() => expect(latestTrace()?.y).toEqual([30, 0, 60]));
    expect(latestTrace().hovertemplate).toContain('$');
    expect(screen.getByLabelText('Subconcepto')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Comida' } });
    expect(latestTrace().y).toEqual([30, 0, 40]);
    fireEvent.change(screen.getByLabelText('Subconcepto'), { target: { value: 'null' } });
    expect(latestTrace().y).toEqual([0, 0, 15]);
    fireEvent.change(screen.getByLabelText('Subconcepto'), { target: { value: '"Otros"' } });
    expect(latestTrace().y).toEqual([0, 0, 5]);
    fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Ocio' } });
    expect(screen.getByLabelText('Subconcepto')).toHaveValue('');
    expect(latestTrace().y).toEqual([0, 0, 20]);
    fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: '' } });
    expect(latestTrace().y).toEqual([30, 0, 60]);
    expect(fetchGastosEvolucion).toHaveBeenCalledTimes(1);
  });

  it('refresca tras mutaciones y vuelve al total si desaparece el concepto seleccionado', async () => {
    const { rerender } = render(<GastosEvolucionSection {...props} />);
    await waitFor(() => expect(newPlot).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Comida' } });
    vi.mocked(fetchGastosEvolucion).mockResolvedValue({ ...report, gastos: [0, 0, 20], conceptos: [report.conceptos[1]] });
    rerender(<GastosEvolucionSection {...props} reloadToken={1} />);
    await waitFor(() => expect(screen.getByLabelText('Concepto')).toHaveValue(''));
    expect(latestTrace().y).toEqual([0, 0, 20]);
  });

  it('descarta respuestas antiguas al cambiar el rango', async () => {
    let resolveOld!: (value: GastosEvolucionReport) => void;
    vi.mocked(fetchGastosEvolucion).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    render(<GastosEvolucionSection {...props} movements={[{ Fecha: '2026-01-01' } as Movement]} />);
    fireEvent.click(screen.getByRole('button', { name: '2026' }));
    await waitFor(() => expect(newPlot).toHaveBeenCalled());
    expect(fetchGastosEvolucion).toHaveBeenLastCalledWith('cash', { type: 'year', year: 2026 });
    await act(async () => resolveOld({ meses: [], gastos: [], conceptos: [] }));
    expect(screen.queryByText('No hay gastos para mostrar.')).not.toBeInTheDocument();
    expect(latestTrace().y).toEqual(report.gastos);
  });

  it('muestra estados vacío y de error', async () => {
    vi.mocked(fetchGastosEvolucion).mockResolvedValue({ meses: [], gastos: [], conceptos: [] });
    const { rerender } = render(<GastosEvolucionSection {...props} />);
    expect(await screen.findByText('No hay gastos para mostrar.')).toBeInTheDocument();
    vi.mocked(fetchGastosEvolucion).mockRejectedValue(new Error('offline'));
    rerender(<GastosEvolucionSection {...props} reloadToken={1} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');
  });
});
