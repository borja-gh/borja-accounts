import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ToastContext';
import { addMovement } from '../../api/client';
import { AddMovementForm } from './AddMovementForm';

vi.mock('../../api/client', () => ({ addMovement: vi.fn() }));

describe('AddMovementForm', () => {
  beforeEach(() => vi.mocked(addMovement).mockResolvedValue({ ok: true, saldo: 0 }));

  it('muestra recurrente activado por defecto al crear un concepto y envía la elección', async () => {
    render(
      <ToastProvider>
        <AddMovementForm account="cash1" kind="CASH" currency="EUR" data={[]} onSaved={vi.fn()} />
      </ToastProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText('Empieza a escribir…'), { target: { value: 'Dentista' } });
    const recurring = await screen.findByRole('radio', { name: 'Sí, recurrente' });
    expect(recurring).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'No, puntual' }));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(addMovement).toHaveBeenCalledWith('cash1', expect.objectContaining({
      tipo: 'Gasto', concepto: 'Dentista', total: 42, recurrente: false,
    })));
  });

  it('no muestra el control para un concepto existente', () => {
    render(
      <ToastProvider>
        <AddMovementForm
          account="cash1"
          kind="CASH"
          currency="EUR"
          data={[{
            Fecha: '2026-01-01', Tipo: 'Gasto', Concepto: 'Luz', Total: 30, Saldo: 70, _idx: 0,
          }]}
          onSaved={vi.fn()}
        />
      </ToastProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText('Empieza a escribir…'), { target: { value: 'Luz' } });

    expect(screen.queryByRole('radiogroup', { name: '¿Es recurrente?' })).not.toBeInTheDocument();
  });
});
