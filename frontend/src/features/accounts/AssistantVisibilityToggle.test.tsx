import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ToastContext';
import { AssistantVisibilityToggle } from './AssistantVisibilityToggle';

describe('AssistantVisibilityToggle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('oculta el agente solo en la cuenta seleccionada', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();

    render(
      <ToastProvider>
        <AssistantVisibilityToggle
          accountId="cash"
          kind="CASH"
          visiblePanels={['assistant', 'overview']}
          onSaved={onSaved}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Ocultar agente/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/accounts/cash/view', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ visiblePanels: ['overview'] }),
    })));
    expect(onSaved).toHaveBeenCalledOnce();
  });
});
