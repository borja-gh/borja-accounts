import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { askAssistant } from '../../api/client';
import { AssistantPanel } from './AssistantPanel';

vi.mock('../../api/client', () => ({
  askAssistant: vi.fn(),
}));

const ACCOUNTS = [
  { id: 'cash1', name: 'Personal', kind: 'CASH' as const, currency: 'EUR' as const, saldo: 1000 },
];

describe('AssistantPanel', () => {
  beforeEach(() => {
    vi.mocked(askAssistant).mockResolvedValue({
      ok: true,
      answer: 'Has gastado 100 EUR.',
      sql: 'SELECT 100 AS total',
      attempts: 1,
    });
  });

  it('envía la petición y el scope interactivo en modo lectura', async () => {
    render(<AssistantPanel accounts={ACCOUNTS} selectedAccount="cash1" />);

    fireEvent.change(screen.getByLabelText('Petición para el asistente'), {
      target: { value: '¿Cuánto he gastado?' },
    });
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));

    await waitFor(() => expect(askAssistant).toHaveBeenCalledWith({
      mode: 'read',
      prompt: '¿Cuánto he gastado?',
      scope: { accountIds: ['cash1'], from: '2026-09-01', to: '2026-10-01' },
    }));
    expect(await screen.findByText('Has gastado 100 EUR.')).toBeInTheDocument();
  });

  it('muestra la propuesta y confirma una escritura con el SQL exacto', async () => {
    vi.mocked(askAssistant)
      .mockResolvedValueOnce({ ok: true, requiresConfirmation: true, sql: "UPDATE accounts SET theme = 'slate'" })
      .mockResolvedValueOnce({ ok: true, answer: 'Actualizado', sql: "UPDATE accounts SET theme = 'slate'" });
    render(<AssistantPanel accounts={ACCOUNTS} selectedAccount="cash1" />);

    fireEvent.change(screen.getByLabelText('Petición para el asistente'), { target: { value: 'Cambia el tema' } });
    fireEvent.click(screen.getByRole('button', { name: 'Escritura' }));
    fireEvent.click(screen.getByRole('button', { name: 'Proponer escritura' }));

    expect(await screen.findByText('Revisa la operación antes de ejecutarla')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar escritura' }));

    await waitFor(() => expect(askAssistant).toHaveBeenLastCalledWith({
      mode: 'write',
      prompt: 'Cambia el tema',
      scope: { accountIds: ['cash1'] },
      sql: "UPDATE accounts SET theme = 'slate'",
      confirmed: true,
    }));
  });
});
