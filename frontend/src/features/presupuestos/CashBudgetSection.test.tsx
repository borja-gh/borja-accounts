import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CashBudgetSection } from './CashBudgetSection';
import { deleteCashBudget, fetchCashBudgetStatus, saveCashBudget } from '../../api/client';

vi.mock('../../api/client', () => ({
  deleteCashBudget: vi.fn(),
  fetchCashBudgetStatus: vi.fn(),
  saveCashBudget: vi.fn(),
}));

const STATUS = {
  periodType: 'month' as const,
  year: 2026,
  month: 9,
  budgetId: 7,
  budget: 1000,
  spent: 250,
  remaining: 750,
  percentage: 25,
  overBudget: false,
};

describe('CashBudgetSection', () => {
  beforeEach(() => {
    vi.mocked(fetchCashBudgetStatus).mockResolvedValue(STATUS);
    vi.mocked(saveCashBudget).mockResolvedValue({ ok: true });
    vi.mocked(deleteCashBudget).mockResolvedValue({ ok: true });
  });

  it('muestra el estado y guarda el presupuesto seleccionado', async () => {
    render(<CashBudgetSection account="cash1" currency="EUR" reloadToken={0} />);

    expect(await screen.findByText('250,00€')).toBeInTheDocument();
    expect(screen.getByText('Restan 750,00€')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Año'), { target: { value: '2026' } });
    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Presupuesto (EUR)'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar presupuesto' }));

    await waitFor(() => expect(saveCashBudget).toHaveBeenCalledWith('cash1', {
      periodType: 'month', year: 2026, month: 9, amount: 1200,
    }));
  });

  it('permite borrar el presupuesto del período', async () => {
    render(<CashBudgetSection account="cash1" currency="EUR" reloadToken={0} />);
    await screen.findByText('250,00€');

    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));

    await waitFor(() => expect(deleteCashBudget).toHaveBeenCalledWith('cash1', 7));
  });
});
