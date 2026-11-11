import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateAccountModal } from './CreateAccountModal';
import { ToastProvider } from '../../components/ToastContext';
import { createAccount } from '../../api/client';

vi.mock('../../api/client', () => ({ createAccount: vi.fn() }));

function setup(overrides: Partial<Parameters<typeof CreateAccountModal>[0]> = {}) {
  const props = { open: true, onClose: vi.fn(), onCreated: vi.fn(), ...overrides };
  render(
    <ToastProvider>
      <CreateAccountModal {...props} />
    </ToastProvider>,
  );
  return props;
}

describe('CreateAccountModal', () => {
  it('es un diálogo modal con campos etiquetados y foco inicial en el nombre', () => {
    setup();

    expect(screen.getByRole('dialog', { name: '+ Nueva cuenta' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Nombre')).toHaveFocus();
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    expect(screen.getByLabelText('Divisa')).toBeInTheDocument();
    expect(screen.getByLabelText(/Saldo inicial/)).toBeInTheDocument();
  });

  it('explica que tipo y divisa son definitivos y qué hace el saldo inicial', () => {
    setup();

    expect(screen.getByText('El tipo y la divisa no se pueden cambiar después.')).toBeInTheDocument();
    expect(screen.getByText(/se registra como movimiento de apertura/)).toBeInTheDocument();
  });

  it('un nombre vacío muestra un error inline y no llama a la API', () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Introduce un nombre');
    expect(createAccount).not.toHaveBeenCalled();
  });

  it('Enter en el formulario envía y evita el doble envío mientras espera', async () => {
    let resolve: (value: Awaited<ReturnType<typeof createAccount>>) => void = () => {};
    vi.mocked(createAccount).mockReturnValue(new Promise((r) => { resolve = r; }));
    const props = setup();

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ahorro' } });
    fireEvent.submit(screen.getByRole('dialog'));
    fireEvent.submit(screen.getByRole('dialog'));

    expect(createAccount).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Creando…' })).toBeDisabled();

    resolve({ ok: true, id: 'ahorro', name: 'Ahorro', kind: 'CASH', currency: 'EUR', theme: 'forest' } as never);
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledTimes(1));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('un error del servidor se muestra inline y deja reintentar', async () => {
    vi.mocked(createAccount).mockResolvedValue({ ok: false, error: 'Ya existe una cuenta con ese nombre' } as never);
    const props = setup();

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ahorro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una cuenta con ese nombre');
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeEnabled();
    expect(props.onCreated).not.toHaveBeenCalled();
  });

  it('Escape cierra el diálogo', () => {
    const props = setup();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(props.onClose).toHaveBeenCalled();
  });

  it('Tab desde el último control vuelve al primero', () => {
    setup();

    screen.getByRole('button', { name: 'Crear cuenta' }).focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(screen.getByLabelText('Nombre')).toHaveFocus();
  });
});
