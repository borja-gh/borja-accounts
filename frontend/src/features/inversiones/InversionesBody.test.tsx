import { fireEvent, render, screen, within } from '@testing-library/react';
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

  it('la cartera abierta empieza colapsada y se expande al hacer click, mostrando el detalle por ticker', () => {
    const report = backendFixture.investment1_carteras_report_3m;
    const { container } = renderBody({ account: 'investment1', report, currency: 'USD', onSaved: () => {} });

    const details = container.querySelector('details.portfolio-holding-details') as HTMLDetailsElement;
    expect(details).toBeTruthy();
    expect(details.open).toBe(false);

    fireEvent.click(details.querySelector('summary')!);

    expect(details.open).toBe(true);
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
  });

  it('AAPL (sin cierre) no muestra PnL; MSFT (ya vendida) muestra PnL y su anotación', () => {
    const report = backendFixture.investment1_carteras_report_3m;
    const { container } = renderBody({ account: 'investment1', report, currency: 'USD', onSaved: () => {} });
    fireEvent.click(container.querySelector('details.portfolio-holding-details summary')!);

    const rows = Array.from(container.querySelectorAll<HTMLTableRowElement>('tbody tr'));
    const aaplRow = rows.find((r) => r.textContent?.includes('AAPL'))!;
    const msftRow = rows.find((r) => r.textContent?.includes('MSFT'))!;

    expect(aaplRow.textContent).toContain('—');
    expect(msftRow.textContent).toContain('-100,00$');
    expect((msftRow.querySelector('input[type="text"]') as HTMLInputElement).value).toBe('Vendida con pérdida');
    // La cartera en su conjunto tampoco muestra PnL porque no todos sus holdings están cerrados.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('editar el precio actual guarda vía la API y recarga el reporte', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, closePrice: null, currentPrice: 130, note: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = backendFixture.investment1_carteras_report_3m;
    const onSaved = vi.fn();
    const { container } = renderBody({ account: 'investment1', report, currency: 'USD', onSaved });
    fireEvent.click(container.querySelector('details.portfolio-holding-details summary')!);

    const rows = Array.from(container.querySelectorAll<HTMLTableRowElement>('tbody tr'));
    const aaplRow = rows.find((r) => r.textContent?.includes('AAPL'))!;
    const priceInput = aaplRow.querySelector('input[type="number"]') as HTMLInputElement;

    fireEvent.change(priceInput, { target: { value: '130' } });
    fireEvent.blur(priceInput);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/accounts/investment1/portfolio-holdings/1',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ currentPrice: 130 }) }),
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('cerrar una holding pide confirmar el precio antes de guardar closePrice', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, closePrice: 150, currentPrice: null, note: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = backendFixture.investment1_carteras_report_3m;
    const onSaved = vi.fn();
    const { container } = renderBody({ account: 'investment1', report, currency: 'USD', onSaved });
    fireEvent.click(container.querySelector('details.portfolio-holding-details summary')!);

    const rows = Array.from(container.querySelectorAll<HTMLTableRowElement>('tbody tr'));
    const aaplRow = rows.find((r) => r.textContent?.includes('AAPL'))!;

    fireEvent.click(within(aaplRow).getByText('Cerrar'));
    const numberInputs = aaplRow.querySelectorAll('input[type="number"]');
    const closeInput = numberInputs[numberInputs.length - 1] as HTMLInputElement;
    fireEvent.change(closeInput, { target: { value: '150' } });
    fireEvent.click(within(aaplRow).getByText('OK'));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/accounts/investment1/portfolio-holdings/1',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ closePrice: 150 }) }),
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Venta registrada')).toBeInTheDocument();
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
    const priceInput = aaplRow.querySelector('input[type="number"]') as HTMLInputElement;
    expect(priceInput.value).toBe('153.53');
    expect(aaplRow.textContent).toContain('358,47$');
    expect(aaplRow.textContent).toContain('31.33%');
    expect(aaplRow.querySelectorAll('td')).toHaveLength(8);
  });
});
