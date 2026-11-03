import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitTransfer } from '../../api/client';
import { ToastProvider } from '../../components/ToastContext';
import { TransferModal } from './TransferModal';

vi.mock('../../api/client', () => ({ submitTransfer: vi.fn(), fetchFxRate: vi.fn() }));

describe('TransferModal', () => {
  beforeEach(() => {
    vi.mocked(submitTransfer).mockResolvedValue({ ok: true, saldo_origen: 900, saldo_destino: 108.75 });
  });

  it.each([['.', '00'], [',', '23']])('acepta importes con %s y hora %s', async (separator, selectedHour) => {
    const { container } = render(
      <ToastProvider>
        <TransferModal
          open
          accounts={[
            { id: 'cash1', name: 'Cash', kind: 'CASH', currency: 'EUR', saldo: 1000 },
            { id: 'investment1', name: 'IBKR', kind: 'INVESTMENT', currency: 'USD', saldo: 0 },
          ]}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: `100${separator}25` } });
    fireEvent.change(screen.getByPlaceholderText('1.000000'), { target: { value: `1${separator}0875` } });
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Hora (24 horas)' }), { target: { value: selectedHour } });
    expect(container.querySelector('input[type="datetime-local"]')).not.toBeInTheDocument();
    expect(screen.getByText('100,25€ → 109,02$')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Transferir' }));
    await vi.waitFor(() => expect(submitTransfer).toHaveBeenCalledWith(expect.objectContaining({
      total: 100.25, exchangeRate: 1.0875, fecha: `2026-11-02T${selectedHour}:00`,
    })));
  });
});
