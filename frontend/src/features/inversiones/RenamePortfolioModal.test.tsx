import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ToastContext';
import { RenamePortfolioModal } from './RenamePortfolioModal';

function renderModal(onRenamed = vi.fn()) {
  return render(
    <ToastProvider>
      <RenamePortfolioModal account="investment1" portfolio="Core" onClose={() => {}} onRenamed={onRenamed} />
    </ToastProvider>,
  );
}

describe('RenamePortfolioModal', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renombra la cartera y notifica al padre', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, portfolio: 'Growth', holdings: 2 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onRenamed = vi.fn();
    renderModal(onRenamed);

    fireEvent.change(screen.getByDisplayValue('Core'), { target: { value: 'Growth' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));

    await waitFor(() => expect(onRenamed).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/accounts/investment1/portfolio-holdings/rename-portfolio');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ portfolio: 'Core', newName: 'Growth' });
  });

  it('muestra el error del backend y no notifica', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, json: async () => ({ error: "Ya existe una cartera llamada 'Otra'" }),
    }));
    const onRenamed = vi.fn();
    renderModal(onRenamed);

    fireEvent.change(screen.getByDisplayValue('Core'), { target: { value: 'Otra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));

    expect(await screen.findByText("Ya existe una cartera llamada 'Otra'")).toBeInTheDocument();
    expect(onRenamed).not.toHaveBeenCalled();
  });
});
