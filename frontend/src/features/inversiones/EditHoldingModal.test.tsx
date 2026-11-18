import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PortfolioHoldingDetail } from '../../api/types';
import { ToastProvider } from '../../components/ToastContext';
import { EditHoldingModal } from './EditHoldingModal';

const holding: PortfolioHoldingDetail = {
  id: 7, ticker: 'AAPL', company: 'Apple Inc.', shares: 4, avgPrice: 100, capital: 400,
  closePrice: null, currentPrice: null, pnl: null, pnlPct: null, note: null,
};

function renderModal(override: Partial<PortfolioHoldingDetail> = {}, onSaved = vi.fn()) {
  return render(
    <ToastProvider>
      <EditHoldingModal
        account="investment1"
        currency="USD"
        holding={{ ...holding, ...override }}
        onClose={() => {}}
        onSaved={onSaved}
      />
    </ToastProvider>,
  );
}

describe('EditHoldingModal', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('envía solo los campos modificados y deja que el backend derive el resto', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, id: 7 }) });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    renderModal({}, onSaved);

    fireEvent.change(screen.getByDisplayValue('4'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/accounts/investment1/portfolio-holdings/7');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ shares: 5 });
  });

  it('bloquea títulos, precio, invertido y fecha en lotes cerrados', () => {
    renderModal({ closePrice: 120 });

    expect(screen.getByDisplayValue('4')).toBeDisabled();
    expect(screen.getByDisplayValue('100')).toBeDisabled();
    expect(screen.getByDisplayValue('400')).toBeDisabled();
    expect(screen.queryByText('Fecha y hora de compra (vacía: sin cambios)')).toBeNull();
  });

  it('no envía una cantidad inválida', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderModal();

    fireEvent.change(screen.getByDisplayValue('4'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Número de títulos inválido')).toBeInTheDocument();
  });
});
