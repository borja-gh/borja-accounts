import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PortfolioReport } from '../../api/types';
import { ToastProvider } from '../../components/ToastContext';
import { backendFixture } from '../../test/goldenMaster';
import { money } from '../../lib/format';
import { InversionesBody } from './InversionesBody';

function renderBody(props: Parameters<typeof InversionesBody>[0]) {
  return render(
    <ToastProvider>
      <InversionesBody {...props} />
    </ToastProvider>,
  );
}

// El vanilla nunca tuvo el modelo de holdings (composición por ticker, sin
// seguimiento de valor de mercado en vivo -- el PnL solo aparece al
// rellenar el precio de cierre real) -- comparar contra su HTML dejó de
// tener sentido, así que este es un test funcional directo sobre datos
// reales del fixture, no un golden master.
describe('InversionesBody', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('muestra capital y PnL (solo cuando cierre) de las carteras basadas en holdings', () => {
    const report = backendFixture.investment1_carteras_report_3m;
    renderBody({ account: 'investment1', report, currency: 'USD', onSaved: () => {} });

    expect(screen.getByText('Cartera Prueba')).toBeInTheDocument();
    expect(screen.getByText(money(report.openTotal, 'USD'))).toBeInTheDocument(); // AAPL 1000 + legado Global 250

    // Legado sin holdings (Cartera Global): sigue apareciendo.
    expect(screen.getByText('Cartera Global')).toBeInTheDocument();

    // Historial (legado cerrado, Cartera Tech/Bonos) sigue en eur().
    expect(screen.getByText('Cartera Tech')).toBeInTheDocument();
    expect(screen.getByText('Cartera Bonos')).toBeInTheDocument();
  });

  it('la cartera abierta empieza colapsada y expone solo los tickers todavía abiertos', () => {
    const report = backendFixture.investment1_carteras_report_3m;
    const { container } = renderBody({ account: 'investment1', report, currency: 'USD', onSaved: () => {} });

    const details = container.querySelector('details.portfolio-holding-details') as HTMLDetailsElement;
    expect(details).toBeTruthy();
    expect(details.open).toBe(false);

    fireEvent.click(details.querySelector('summary')!);

    expect(details.open).toBe(true);
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.queryByText('MSFT')).not.toBeInTheDocument();
    expect(screen.getByText('Cartera Prueba · MSFT')).toBeInTheDocument();
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
  });

  it('AAPL abierta no muestra PnL; MSFT vendida aparece en el historial', () => {
    const report = backendFixture.investment1_carteras_report_3m;
    const { container } = renderBody({ account: 'investment1', report, currency: 'USD', onSaved: () => {} });
    fireEvent.click(container.querySelector('details.portfolio-holding-details summary')!);

    const rows = Array.from(container.querySelectorAll<HTMLTableRowElement>('.holdings-table tbody tr'));
    const aaplRow = rows.find((r) => r.textContent?.includes('AAPL'))!;

    expect(aaplRow.textContent).toContain('—');
    expect(screen.getByText('Cartera Prueba · MSFT').closest('.closed-position-summary')?.textContent).toContain('-100,00$');
    // La cartera en su conjunto tampoco muestra PnL porque no todos sus holdings están cerrados.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('editar el precio actual guarda vía la API y recarga el reporte', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, closePrice: null, currentPrice: 130.25, note: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = backendFixture.investment1_carteras_report_3m;
    const onSaved = vi.fn();
    const { container } = renderBody({ account: 'investment1', report, currency: 'USD', onSaved });
    fireEvent.click(container.querySelector('details.portfolio-holding-details summary')!);

    const rows = Array.from(container.querySelectorAll<HTMLTableRowElement>('tbody tr'));
    const aaplRow = rows.find((r) => r.textContent?.includes('AAPL'))!;
    const priceInput = aaplRow.querySelector('input[inputmode="decimal"]') as HTMLInputElement;

    fireEvent.change(priceInput, { target: { value: '130,25' } });
    fireEvent.blur(priceInput);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/accounts/investment1/portfolio-holdings/1',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ currentPrice: 130.25 }) }),
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('cerrar una cartera solicita todos sus precios y los confirma en una petición', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, closePrice: 150, currentPrice: null, note: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = backendFixture.investment1_carteras_report_3m;
    const onSaved = vi.fn();
    const { container } = renderBody({ account: 'investment1', report, currency: 'USD', onSaved });
    fireEvent.click(container.querySelector('details.portfolio-holding-details summary')!);
    fireEvent.click(screen.getByText('Cerrar cartera'));
    const dateInput = container.querySelector('.portfolio-close-heading input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-06-15' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Hora (24 horas)' }), { target: { value: '23' } });
    expect(container.querySelector('input[type="datetime-local"]')).not.toBeInTheDocument();
    const closeInput = screen.getByLabelText('Precio de cierre AAPL');
    fireEvent.change(closeInput, { target: { value: '150,25' } });
    fireEvent.click(screen.getByText('Confirmar cierre'));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/accounts/investment1/portfolio-holdings/close-portfolio',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          portfolio: 'Cartera Prueba',
          fecha: '2026-06-15T23:00',
          prices: [{ holdingId: 1, closePrice: 150.25 }],
        }),
      }),
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Cartera cerrada')).toBeInTheDocument();
  });

  it('vende todos los lotes abiertos del ticker sin cerrar el resto de la cartera', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, portfolio: 'Cartera Prueba', ticker: 'AAPL', closed: 1, shares: 10 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = structuredClone(backendFixture.investment1_carteras_report_3m) as PortfolioReport;
    const portfolio = report.openPositions.find((position) => position.concepto === 'Cartera Prueba')!;
    const aapl = portfolio.holdings.find((holding) => holding.ticker === 'AAPL')!;
    aapl.currentPrice = 150;
    portfolio.holdings.push({ ...aapl, id: 99, shares: 2, capital: 300 });
    portfolio.holdings.push({ ...aapl, id: 100, ticker: 'GOOGL', shares: 3, capital: 450 });
    const onSaved = vi.fn();
    const { container } = renderBody({ account: 'investment1', report, currency: 'USD', onSaved });
    fireEvent.click(container.querySelector('details.portfolio-holding-details summary')!);
    expect(screen.getAllByText('Cerrar')).toHaveLength(2);
    fireEvent.click(screen.getAllByText('Cerrar')[0]);

    expect(screen.getByText('Venta de AAPL')).toBeInTheDocument();
    expect(screen.getByText('Se venderán 12 acciones. El resto de la cartera seguirá abierto.')).toBeInTheDocument();
    expect(screen.getAllByText('Cerrar')).toHaveLength(2);
    const dateInput = container.querySelector('.holding-close-row input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-10-02' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Hora (24 horas)' }), { target: { value: '00' } });
    expect(container.querySelector('input[type="datetime-local"]')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Precio de venta AAPL'), { target: { value: '155,25' } });
    fireEvent.click(screen.getByText('Confirmar venta'));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/accounts/investment1/portfolio-holdings/close-position',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ portfolio: 'Cartera Prueba', ticker: 'AAPL', closePrice: 155.25, fecha: '2026-10-02T00:00' }),
      }),
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Posición AAPL cerrada')).toBeInTheDocument();
  });

  it('el precio de mercado se muestra a 2 decimales, sin la basura IEEE de yfinance', () => {
    const report = structuredClone(backendFixture.investment1_carteras_report_3m) as PortfolioReport;
    const aapl = report.openPositions[0].holdings.find((h) => h.ticker === 'AAPL')!;
    aapl.currentPrice = 153.52999877929688;
    aapl.pnl = 358.47;
    aapl.pnlPct = 31.33;

    const { container } = renderBody({ account: 'investment1', report, currency: 'USD', onSaved: () => {} });
    fireEvent.click(container.querySelector('details.portfolio-holding-details summary')!);

    const rows = Array.from(container.querySelectorAll<HTMLTableRowElement>('.holdings-table tbody tr'));
    const aaplRow = rows.find((r) => r.textContent?.includes('AAPL'))!;
    const priceInput = aaplRow.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    expect(priceInput.value).toBe('153.53');
    expect(aaplRow.textContent).toContain('358,47$');
    expect(aaplRow.textContent).toContain('31.33%');
    expect(aaplRow.querySelectorAll('td')).toHaveLength(9);
  });

  it('muestra el precio medio con cuatro decimales', () => {
    const report = structuredClone(backendFixture.investment1_carteras_report_3m) as PortfolioReport;
    const aapl = report.openPositions[0].holdings.find((h) => h.ticker === 'AAPL')!;
    aapl.avgPrice = 68.074;

    const { container } = renderBody({ account: 'investment1', report, currency: 'USD', onSaved: () => {} });
    fireEvent.click(container.querySelector('details.portfolio-holding-details summary')!);

    const rows = Array.from(container.querySelectorAll<HTMLTableRowElement>('.holdings-table tbody tr'));
    const aaplRow = rows.find((r) => r.textContent?.includes('AAPL'))!;
    expect(aaplRow.textContent).toContain('68,0740$');
  });
  it('renombra desde el historial una cartera legada cerrada', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, portfolio: 'Tech Nueva', holdings: 0 }) });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    const report = backendFixture.investment1_carteras_report_3m;
    const { container } = renderBody({ account: 'investment1', report, currency: 'USD', onSaved });

    const history = container.querySelector('.investment-portfolio-history') as HTMLElement;
    const row = within(history).getByText('Cartera Tech').closest('.closed-position-details') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Renombrar' }));
    fireEvent.change(screen.getByDisplayValue('Cartera Tech'), { target: { value: 'Tech Nueva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ portfolio: 'Cartera Tech', newName: 'Tech Nueva' });
  });

  it('en un cierre parcial propone el nombre de la cartera, sin el ticker', () => {
    const report = backendFixture.investment1_carteras_report_3m;
    const { container } = renderBody({ account: 'investment1', report, currency: 'USD', onSaved: () => {} });

    const history = container.querySelector('.investment-portfolio-history') as HTMLElement;
    const row = within(history).getByText('Cartera Prueba · MSFT').closest('.closed-position-details') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Renombrar' }));

    expect(screen.getByDisplayValue('Cartera Prueba')).toBeInTheDocument();
  });

  it('al desplegar una cartera cerrada muestra solo los lotes vendidos de su ticker', async () => {
    const lots = [
      { id: 2, portfolio: 'Cartera Prueba', ticker: 'MSFT', company: 'Microsoft Corp.', shares: 5, avgPrice: 200, capital: 1000,
        closePrice: 180, proceeds: 900, pnl: -100, pnlPct: -10, contributedAt: '2026-05-01' },
      { id: 1, portfolio: 'Cartera Prueba', ticker: 'AAPL', company: 'Apple Inc.', shares: 10, avgPrice: 100, capital: 1000,
        closePrice: 150, proceeds: 1500, pnl: 500, pnlPct: 50, contributedAt: '2026-05-01' },
    ];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => lots });
    vi.stubGlobal('fetch', fetchMock);
    const report = backendFixture.investment1_carteras_report_3m;
    const { container } = renderBody({ account: 'investment1', report, currency: 'USD', onSaved: () => {} });

    const history = container.querySelector('.investment-portfolio-history') as HTMLElement;
    const details = within(history).getByText('Cartera Prueba · MSFT').closest('details') as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event('toggle'));

    expect(await within(details).findByText('Microsoft Corp.')).toBeInTheDocument();
    expect(within(details).queryByText('Apple Inc.')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/accounts/investment1/portfolio-holdings/closed');
  });
});
