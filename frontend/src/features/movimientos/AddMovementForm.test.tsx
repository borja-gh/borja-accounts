import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ToastContext';
import { addMovement, updateExpenseRecurrence } from '../../api/client';
import { AddMovementForm } from './AddMovementForm';

vi.mock('../../api/client', () => ({ addMovement: vi.fn(), updateExpenseRecurrence: vi.fn() }));

describe('AddMovementForm', () => {
  beforeEach(() => {
    vi.mocked(addMovement).mockResolvedValue({ ok: true, saldo: 0, conceptoNuevo: true });
    vi.mocked(updateExpenseRecurrence).mockResolvedValue({ ok: true });
  });

  it('pregunta la recurrencia tras guardar un concepto nuevo y persiste la elección', async () => {
    render(
      <ToastProvider>
        <AddMovementForm account="cash1" kind="CASH" currency="EUR" data={[]} onSaved={vi.fn()} />
      </ToastProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText('Empieza a escribir…'), { target: { value: 'Dentista' } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Dentista');
    expect(addMovement).toHaveBeenCalledWith('cash1', expect.objectContaining({
      tipo: 'Gasto', concepto: 'Dentista', total: 42, subconcepto: null,
    }));
    fireEvent.click(screen.getByRole('button', { name: 'No, puntual' }));
    await waitFor(() => expect(updateExpenseRecurrence).toHaveBeenCalledWith('cash1', 'Dentista', false));
  });

  it('envía subconcepto en el gasto y no pregunta recurrencia si el concepto ya existe', async () => {
    vi.mocked(addMovement).mockResolvedValue({ ok: true, saldo: 0, conceptoNuevo: false });
    render(
      <ToastProvider>
        <AddMovementForm
          account="cash1"
          kind="CASH"
          currency="EUR"
          data={[{
            Fecha: '2026-01-01', Tipo: 'Gasto', Concepto: 'Luz', Total: 30, Saldo: 70, _idx: 0,
            Subconcepto: null,
          }]}
          onSaved={vi.fn()}
        />
      </ToastProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText('Empieza a escribir…'), { target: { value: 'Luz' } });
    fireEvent.change(screen.getByPlaceholderText('Busca un subconcepto…'), { target: { value: 'Artista A' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(addMovement).toHaveBeenCalledWith('cash1', expect.objectContaining({
      subconcepto: 'Artista A',
    })));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('permite subconcepto en otros tipos y envía fecha y hora', async () => {
    vi.mocked(addMovement).mockResolvedValue({ ok: true, saldo: 30 });
    const { container } = render(
      <ToastProvider>
        <AddMovementForm account="cash1" kind="CASH" currency="EUR" data={[]} onSaved={vi.fn()} />
      </ToastProvider>,
    );

    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: '2026-10-14' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Hora (24 horas)' }), { target: { value: '18' } });
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'Ingreso' } });
    fireEvent.change(screen.getByPlaceholderText('Empieza a escribir…'), { target: { value: 'Venta' } });
    fireEvent.change(screen.getByPlaceholderText('Busca un subconcepto…'), { target: { value: 'Colección' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(addMovement).toHaveBeenCalledWith('cash1', expect.objectContaining({
      fecha: '2026-10-14T18:00', tipo: 'Ingreso', concepto: 'Venta', subconcepto: 'Colección',
    })));
  });

  it('ofrece horas completas en formato 24 h y cierra el selector al pulsar Enter', () => {
    const { container } = render(
      <ToastProvider>
        <AddMovementForm account="cash1" kind="CASH" currency="EUR" data={[]} onSaved={vi.fn()} />
      </ToastProvider>,
    );
    const hour = screen.getByRole('combobox', { name: 'Hora (24 horas)' });
    expect(hour.querySelectorAll('option')).toHaveLength(24);
    expect(hour.querySelector('option[value="00"]')).toHaveTextContent('00:00');
    expect(hour.querySelector('option[value="23"]')).toHaveTextContent('23:00');
    const blur = vi.spyOn(hour, 'blur');
    fireEvent.keyDown(hour, { key: 'Enter' });
    expect(blur).toHaveBeenCalled();
    expect(container.querySelector('input[type="datetime-local"]')).not.toBeInTheDocument();
  });
});
