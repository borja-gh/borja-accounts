import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addMovement } from '../../api/client';
import { ToastProvider } from '../../components/ToastContext';
import { ClosePositionModal } from './ClosePositionModal';

vi.mock('../../api/client', () => ({ addMovement: vi.fn() }));

describe('ClosePositionModal', () => {
  beforeEach(() => {
    vi.mocked(addMovement).mockResolvedValue({ ok: true, saldo: 100 });
  });

  it.each(['00', '23'])('envía la fecha de cierre de apuesta con la hora %s', async (hour) => {
    const onSaved = vi.fn();
    const { container } = render(
      <ToastProvider>
        <ClosePositionModal
          account="cash1"
          request={{ tipo: 'Apuestas', concepto: 'Liga', subconcepto: 'Jornada 1', monto: 20 }}
          onClose={vi.fn()}
          onSaved={onSaved}
        />
      </ToastProvider>,
    );
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Hora (24 horas)' }), { target: { value: hour } });
    fireEvent.change(screen.getByPlaceholderText('0.00 — introduce 0 si es pérdida total'), { target: { value: '0' } });
    expect(container.querySelector('input[type="datetime-local"]')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));
    await vi.waitFor(() => expect(addMovement).toHaveBeenCalledWith('cash1', {
      tipo: 'Apuestas_r', concepto: 'Liga', subconcepto: 'Jornada 1', total: 0,
      fecha: `2026-11-02T${hour}:00`,
    }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });
});
