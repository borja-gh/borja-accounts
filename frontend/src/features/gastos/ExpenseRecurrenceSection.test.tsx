import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ToastContext';
import { fetchExpenseRecurrences, updateExpenseRecurrence } from '../../api/client';
import { ExpenseRecurrenceSection } from './ExpenseRecurrenceSection';

vi.mock('../../api/client', () => ({
  fetchExpenseRecurrences: vi.fn(),
  updateExpenseRecurrence: vi.fn(),
}));

describe('ExpenseRecurrenceSection', () => {
  beforeEach(() => {
    vi.mocked(fetchExpenseRecurrences).mockResolvedValue({ conceptos: [
      { concepto: 'Luz', recurrente: false },
    ] });
    vi.mocked(updateExpenseRecurrence).mockResolvedValue({ ok: true, concepto: 'Luz', recurrente: true });
  });

  it('mantiene el panel plegado hasta abrirlo y permite cambiar la clasificación', async () => {
    const onUpdated = vi.fn();
    render(
      <ToastProvider>
        <ExpenseRecurrenceSection account="cash1" reloadToken={0} onUpdated={onUpdated} />
      </ToastProvider>,
    );

    const toggle = screen.getByRole('button', { name: /Recurrencia de gastos/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(fetchExpenseRecurrences).not.toHaveBeenCalled();
    fireEvent.click(toggle);

    const checkbox = await screen.findByRole('checkbox', { name: 'Marcar recurrente: Luz' });
    fireEvent.click(checkbox);

    await waitFor(() => expect(updateExpenseRecurrence).toHaveBeenCalledWith('cash1', 'Luz', true));
    expect(await screen.findByText('Recurrente')).toBeInTheDocument();
    expect(onUpdated).toHaveBeenCalledOnce();
  });
});
