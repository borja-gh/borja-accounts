import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ToastContext';
import { ExchangeRateField } from './ExchangeRateField';

function renderField() {
  const onChange = vi.fn();
  render(
    <ToastProvider>
      <ExchangeRateField from="EUR" to="USD" value="" onChange={onChange} />
    </ToastProvider>,
  );
  return onChange;
}

describe('ExchangeRateField', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('consulta el tipo de cambio y rellena el input', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, base: 'EUR', quote: 'USD', rate: 1.0875 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onChange = renderField();

    fireEvent.click(screen.getByText('Consultar ahora'));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('1.0875'));
    expect(fetchMock).toHaveBeenCalledWith('/api/fx?base=EUR&quote=USD');
    expect(await screen.findByText('Tipo EUR→USD: 1.0875')).toBeInTheDocument();
  });
});
