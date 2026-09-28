import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ToastContext';
import { ViewCustomizer } from './ViewCustomizer';

describe('ViewCustomizer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('guarda una selección de paneles asociada a la cuenta', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();

    render(
      <ToastProvider>
        <ViewCustomizer
          accountId="cash"
          kind="CASH"
          visiblePanels={['overview', 'expenses']}
          onSaved={onSaved}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Personalizar vista' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Gastos por concepto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/accounts/cash/view', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ visiblePanels: ['overview'] }),
    })));
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('restaura la selección predeterminada sin guardarla hasta confirmar', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ToastProvider>
        <ViewCustomizer accountId="cash" kind="CASH" visiblePanels={[]} onSaved={() => {}} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Personalizar vista' }));
    expect(screen.getByRole('checkbox', { name: 'Resumen general' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar predeterminada' }));
    expect(screen.getByRole('checkbox', { name: 'Resumen general' })).toBeChecked();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('permite configurar Añadir movimiento y Total por tipo y concepto por separado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ToastProvider>
        <ViewCustomizer
          accountId="cash"
          kind="CASH"
          visiblePanels={['add_movement', 'movement_total']}
          onSaved={() => {}}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Personalizar vista' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Añadir movimiento' }));
    expect(screen.getByRole('checkbox', { name: 'Total por tipo y concepto' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/accounts/cash/view', expect.objectContaining({
      body: JSON.stringify({ visiblePanels: ['movement_total'] }),
    })));
  });
});
