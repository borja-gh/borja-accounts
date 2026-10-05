import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFxRate } from '../api/client';
import type { AccountSummary } from '../api/types';
import { Header } from './Header';

vi.mock('../api/client', () => ({ fetchFxRate: vi.fn() }));

const accounts: AccountSummary[] = [
  { id: 'eur', name: 'EUR account', kind: 'CASH', currency: 'EUR', saldo: 100 },
  { id: 'usd', name: 'USD account', kind: 'INVESTMENT', currency: 'USD', saldo: 200 },
];

describe('Header', () => {
  beforeEach(() => {
    vi.mocked(fetchFxRate).mockImplementation(async (base) => ({
      ok: true,
      rate: base === 'USD' ? 0.9 : 1 / 0.9,
    }));
  });

  it('mantiene los totales nativos y permite cambiar la divisa estimada', async () => {
    render(<Header accounts={accounts} onOpenTransfer={() => {}} />);

    await waitFor(() => expect(screen.getByText('280,00€')).toBeInTheDocument());
    expect(screen.getByText('Total EUR')).toBeInTheDocument();
    expect(screen.getByText('Total USD')).toBeInTheDocument();
    expect(fetchFxRate).toHaveBeenCalledWith('USD', 'EUR');

    fireEvent.change(screen.getByRole('combobox', { name: 'Divisa del capital estimado' }), {
      target: { value: 'USD' },
    });

    await waitFor(() => expect(screen.getByText('311,11$')).toBeInTheDocument());
    expect(fetchFxRate).toHaveBeenLastCalledWith('EUR', 'USD');
  });

  it('no muestra estimación agregada si todas las cuentas comparten divisa', () => {
    render(<Header accounts={[accounts[0]]} onOpenTransfer={() => {}} />);

    expect(screen.queryByRole('combobox', { name: 'Divisa del capital estimado' })).not.toBeInTheDocument();
    expect(fetchFxRate).not.toHaveBeenCalled();
  });
});
