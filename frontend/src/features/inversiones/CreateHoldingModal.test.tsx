import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ToastContext';
import { CreateHoldingModal } from './CreateHoldingModal';

describe('CreateHoldingModal', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([['.', '00'], [',', '23']])('registra un lote con separador %s y hora %s', async (separator, selectedHour) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, id: 3, portfolio: 'Core', ticker: 'AAPL', capital: 400 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onCreated = vi.fn();

    const { container } = render(
      <ToastProvider>
        <CreateHoldingModal
          open
          account="investment1"
          currency="USD"
          caja={1000}
          portfolios={['Core']}
          onClose={() => {}}
          onCreated={onCreated}
        />
      </ToastProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText('p.ej. Cartera Core'), { target: { value: 'Core' } });
    fireEvent.change(screen.getByPlaceholderText('AAPL'), { target: { value: 'aapl' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: `4${separator}25` } });
    fireEvent.change(screen.getByPlaceholderText('0.0000'), { target: { value: `100${separator}1234` } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: `0${separator}35` } });
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: '2026-11-02' } });
    const hour = screen.getByRole('combobox', { name: 'Hora (24 horas)' });
    expect(hour.querySelectorAll('option')).toHaveLength(24);
    expect(hour.querySelector('option[value="00"]')).toHaveTextContent('00:00');
    expect(hour.querySelector('option[value="23"]')).toHaveTextContent('23:00');
    fireEvent.change(hour, { target: { value: selectedHour } });
    expect(container.querySelector('input[type="datetime-local"]')).not.toBeInTheDocument();
    expect(screen.getByText('Capital (sin comisión) 425,52$')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Registrar lote'));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(request.body as string)).toMatchObject({
      ticker: 'AAPL',
      shares: 4.25,
      price: 100.1234,
      capital: 425.52,
      fee: 0.35,
      fecha: `2026-11-02T${selectedHour}:00`,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/accounts/investment1/portfolio-holdings',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"ticker":"AAPL"'),
      }),
    );
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it('convierte un precio USD y un tipo de cambio con coma antes de registrar el lote', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ToastProvider>
        <CreateHoldingModal
          open account="investment1" currency="EUR" caja={1000} portfolios={['Core']}
          onClose={vi.fn()} onCreated={vi.fn()}
        />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText('AAPL'), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '2,5' } });
    fireEvent.change(screen.getAllByPlaceholderText('0.00')[1], { target: { value: '100,25' } });
    fireEvent.change(screen.getByPlaceholderText('1.000000'), { target: { value: '0,925' } });
    fireEvent.click(screen.getByRole('button', { name: 'Convertir a EUR' }));
    expect(screen.getByPlaceholderText('0.0000')).toHaveValue('92.7313');
    expect(screen.getByText('Capital (sin comisión) 231,83€')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar lote' }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(request.body as string)).toMatchObject({ shares: 2.5, price: 92.7313, capital: 231.83 });
  });

  it('no registra un precio mal formado como un importe truncado', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ToastProvider>
        <CreateHoldingModal
          open account="investment1" currency="USD" caja={1000} portfolios={['Core']}
          onClose={vi.fn()} onCreated={vi.fn()}
        />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText('AAPL'), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '2' } });
    fireEvent.change(screen.getByPlaceholderText('0.0000'), { target: { value: '100,25.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar lote' }));
    expect(await screen.findByText('Títulos y precio deben ser mayores que cero')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
