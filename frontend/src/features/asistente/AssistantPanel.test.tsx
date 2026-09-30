import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  askAssistant,
  executePendingAssistantQuery,
  fetchSavedAssistantQueries,
  savePendingAssistantQuery,
} from '../../api/client';
import { AssistantPanel } from './AssistantPanel';

vi.mock('../../api/client', () => ({
  askAssistant: vi.fn(),
  deleteSavedAssistantQuery: vi.fn(),
  executeSavedAssistantQuery: vi.fn(),
  executePendingAssistantQuery: vi.fn(),
  fetchSavedAssistantQueries: vi.fn(),
  renameSavedAssistantQuery: vi.fn(),
  savePendingAssistantQuery: vi.fn(),
}));

const ACCOUNTS = [
  { id: 'cash1', name: 'Personal', kind: 'CASH' as const, currency: 'EUR' as const, saldo: 1000 },
];

const readQuery = {
  id: 'query-1',
  description: 'Gasto por concepto',
  sql: 'SELECT concept, SUM(amount) FROM movements GROUP BY concept',
  mode: 'read' as const,
  status: 'executed' as const,
  rowCount: 1,
};

describe('AssistantPanel', () => {
  beforeEach(() => {
    vi.mocked(fetchSavedAssistantQueries).mockResolvedValue({ queries: [] });
    vi.mocked(askAssistant).mockResolvedValue({
      ok: true,
      answerMarkdown: 'Has gastado 100 EUR.',
      queries: [readQuery],
      toolCalls: 1,
    });
    vi.mocked(savePendingAssistantQuery).mockResolvedValue({
      ok: true,
      query: {
        id: readQuery.id,
        title: readQuery.description,
        prompt: '¿Cuánto he gastado?',
        sql: readQuery.sql,
        scope: { accountIds: ['cash1'] },
        createdAt: '2026-09-29T00:00:00Z',
      },
    });
  });

  it('envía la petición y el scope interactivo en modo lectura y muestra los pasos', async () => {
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
    expect(screen.getByLabelText('Petición para el asistente')).toHaveValue('');
    expect(screen.getByText('Gasto por concepto')).toBeInTheDocument();
    expect(screen.getByText('Ejecutada')).toBeInTheDocument();
  });

  it('guarda individualmente una consulta temporal con su propio id y descripción', async () => {
    render(<AssistantPanel accounts={ACCOUNTS} selectedAccount="cash1" />);

    fireEvent.change(screen.getByLabelText('Petición para el asistente'), { target: { value: '¿Cuánto he gastado?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar consulta' }));

    await waitFor(() => expect(savePendingAssistantQuery).toHaveBeenCalledWith('query-1'));
    expect(await screen.findByRole('button', { name: 'Guardada' })).toBeDisabled();
    expect(screen.getAllByText('Gasto por concepto')).toHaveLength(2);
  });

  it('mantiene visibles las consultas si el agente alcanza el límite sin respuesta final', async () => {
    vi.mocked(askAssistant).mockResolvedValueOnce({
      ok: false,
      error: 'El asistente ha alcanzado el límite de consultas.',
      queries: [{ ...readQuery, status: 'failed', error: 'Consulta no ejecutada' }],
      toolCalls: 5,
    });
    render(<AssistantPanel accounts={ACCOUNTS} selectedAccount="cash1" />);

    fireEvent.change(screen.getByLabelText('Petición para el asistente'), { target: { value: 'Resume gastos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));

    expect(await screen.findByText('Ejecución parcial')).toBeInTheDocument();
    expect(screen.getByText('Gasto por concepto')).toBeInTheDocument();
    expect(screen.getByText('Consulta no ejecutada')).toBeInTheDocument();
    expect(screen.getByLabelText('Petición para el asistente')).toHaveValue('Resume gastos');
  });

  it('presenta una escritura pendiente y confirma solo su id', async () => {
    const writeQuery = {
      id: 'write-1',
      description: 'Actualizar concepto',
      sql: "UPDATE movements SET concept = 'Educación' WHERE concept = 'Clases'",
      mode: 'write' as const,
      status: 'confirmation_required' as const,
    };
    vi.mocked(askAssistant).mockResolvedValueOnce({
      ok: true,
      requiresConfirmation: true,
      query: writeQuery,
      queries: [writeQuery],
      toolCalls: 1,
    });
    vi.mocked(executePendingAssistantQuery).mockResolvedValue({
      ok: true,
      query: { ...writeQuery, status: 'executed', rowCount: 1 },
      result: { columns: [], rows: [], rowCount: 0, affectedRows: 1 },
    });
    render(<AssistantPanel accounts={ACCOUNTS} selectedAccount="cash1" />);

    fireEvent.change(screen.getByLabelText('Petición para el asistente'), { target: { value: 'Cambia el concepto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Escritura' }));
    fireEvent.click(screen.getByRole('button', { name: 'Proponer escritura' }));

    expect(await screen.findByText(/revisa la operación antes de ejecutarla/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar escritura' }));

    await waitFor(() => expect(executePendingAssistantQuery).toHaveBeenCalledWith('write-1'));
    expect(await screen.findByText(/Operación ejecutada/)).toBeInTheDocument();
  });
});
