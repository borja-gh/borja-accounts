import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ToastContext';
import { CreateHoldingModal } from './CreateHoldingModal';

describe('CreateHoldingModal', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('registra un lote contra el API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, id: 3, portfolio: 'Core', ticker: 'AAPL', capital: 400 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onCreated = vi.fn();

    render(
      <ToastProvider>
        <CreateHoldingModal
          open
          account="investment1"
          currency="USD"
          caja={1000}
          portfolios={['Core']}
          onClose={() => {}}
          onCreated={onCreated}
        />
      </ToastProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText('p.ej. Cartera Core'), { target: { value: 'Core' } });
    fireEvent.change(screen.getByPlaceholderText('AAPL'), { target: { value: 'aapl' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '4' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } });
    fireEvent.click(screen.getByText('Registrar lote'));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/accounts/investment1/portfolio-holdings',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"ticker":"AAPL"'),
      }),
    );
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });
});
