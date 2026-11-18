import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeaderConsolidatedKpis } from './HeaderConsolidatedKpis';

const kpi = {
  currency: 'EUR', ingresos: 1180, ingresosCash: 1000, ingresosPnl: 180, gastos: 150, balance: 1030,
  ingresosDelta: { diff: 50 }, gastosDelta: { diff: -20 }, balanceDelta: { diff: 70 },
};

describe('HeaderConsolidatedKpis', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('muestra ingresos, gastos y balance consolidados del mes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => kpi });
    vi.stubGlobal('fetch', fetchMock);

    render(<HeaderConsolidatedKpis />);

    expect(await screen.findByText('1180,00€')).toBeInTheDocument();
    expect(screen.getByText('150,00€')).toBeInTheDocument();
    expect(screen.getByText('1030,00€')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/kpis/consolidated?period=mes&currency=EUR');
  });

  it('pide el periodo y la divisa elegidos; el personalizado envía el rango', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => kpi });
    vi.stubGlobal('fetch', fetchMock);
    render(<HeaderConsolidatedKpis />);
    await screen.findByText('1180,00€');

    fireEvent.click(screen.getByRole('button', { name: 'Trimestral' }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/kpis/consolidated?period=trimestre&currency=EUR'));

    fireEvent.change(screen.getByRole('combobox', { name: 'Divisa del consolidado' }), { target: { value: 'USD' } });
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/kpis/consolidated?period=trimestre&currency=USD'));
  });

  it('muestra un guion si el consolidado no está disponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'sin tipo de cambio' }) }));

    render(<HeaderConsolidatedKpis />);

    await waitFor(() => expect(screen.getByText('—')).toBeInTheDocument());
  });
});
