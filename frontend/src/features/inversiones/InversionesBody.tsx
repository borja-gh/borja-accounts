import { useEffect, useState } from 'react';
import { closePortfolio, updatePortfolioHolding } from '../../api/client';
import type { AccountId, ClosedInvestPosition, OpenInvestPosition, PortfolioHoldingDetail, PortfolioReport } from '../../api/types';
import { DataTable, type Column } from '../../components/DataTable';
import { SectionKpis, type SectionKpiItem } from '../../components/SectionKpis';
import { useToast } from '../../components/ToastContext';
import { fd, money, priceInputValue, localISODate } from '../../lib/format';

function pnlClass(v: number | null): string {
  if (v === null) return '';
  return v >= 0 ? 'num-pos' : 'num-neg';
}

function sectionKpis(report: PortfolioReport, currency: string): SectionKpiItem[] {
  return [
    {
      label: 'Capital invertido',
      value: money(report.openTotal, currency),
      sub: `${report.openCount} cartera${report.openCount !== 1 ? 's' : ''} abierta${report.openCount !== 1 ? 's' : ''}`,
    },
    {
      label: 'Historial',
      value: report.closedCount ? `${report.closedCount} cerrada${report.closedCount !== 1 ? 's' : ''}` : '—',
      sub: report.closedCount ? `PnL ${money(report.totalPnL, currency)}` : undefined,
    },
  ];
}

function HoldingRow({ account, holding, currency, onSaved }: {
  account: AccountId;
  holding: PortfolioHoldingDetail;
  currency: string;
  onSaved: () => void;
}) {
  const [currentPrice, setCurrentPrice] = useState(priceInputValue(holding.currentPrice));
  const [note, setNote] = useState(holding.note ?? '');
  const showToast = useToast();
  const isClosed = holding.closePrice !== null;

  useEffect(() => {
    setCurrentPrice(priceInputValue(holding.currentPrice));
  }, [holding.currentPrice]);

  async function saveCurrentPrice() {
    const trimmed = currentPrice.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && (Number.isNaN(value) || value < 0)) {
      showToast('Precio actual inválido', 'err');
      setCurrentPrice(priceInputValue(holding.currentPrice));
      return;
    }
    const held = holding.currentPrice == null ? null : Number(priceInputValue(holding.currentPrice));
    if (value === held) return;
    const result = await updatePortfolioHolding(account, holding.id, { currentPrice: value });
    if (!result.ok) {
      showToast(result.error || 'Error al guardar', 'err');
      return;
    }
    onSaved();
  }

  async function saveNote() {
    const trimmed = note.trim();
    const value = trimmed === '' ? null : trimmed;
    if (value === holding.note) return;
    const result = await updatePortfolioHolding(account, holding.id, { note: value });
    if (!result.ok) {
      showToast(result.error || 'Error al guardar', 'err');
      return;
    }
    onSaved();
  }

  return (
    <tr>
      <td>
        <b>{holding.ticker}</b>
      </td>
      <td className="r">{holding.shares}</td>
      <td className="holdings-company" title={holding.company}>{holding.company}</td>
      <td className="r">{money(holding.avgPrice, currency, 4)}</td>
      <td className="r">{money(holding.capital, currency)}</td>
      <td className="r">
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="—"
          value={currentPrice}
          onChange={(e) => setCurrentPrice(e.target.value)}
          onBlur={saveCurrentPrice}
          disabled={isClosed}
          className="input-compact"
        />
      </td>
      <td className={`r ${pnlClass(holding.pnl)}`}>
        {holding.pnl === null ? (
          '—'
        ) : (
          <span className="pnl-stack">
            <span>{money(holding.pnl, currency)}</span>
            {holding.pnlPct != null && <span className="pnl-pct">{holding.pnlPct.toFixed(2)}%</span>}
          </span>
        )}
      </td>
      <td className="r holdings-actions">
        {isClosed ? (
          <span className="pnl-stack">
            <span className="badge b-transferencia">Cerrado</span>
            <span>{holding.closePrice == null ? '—' : money(holding.closePrice, currency)}</span>
          </span>
        ) : (
          <span className="badge b-inversion">Abierta</span>
        )}
      </td>
      <td>
        <input
          type="text"
          placeholder="Nota"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          className="input-full"
        />
      </td>
    </tr>
  );
}

function OpenPortfolioRow({ account, p, currency, onSaved }: {
  account: AccountId;
  p: OpenInvestPosition;
  currency: string;
  onSaved: () => void;
}) {
  const openHoldings = p.holdings.filter((holding) => holding.closePrice === null);
  const [closing, setClosing] = useState(false);
  const [closeDate, setCloseDate] = useState(localISODate());
  const [closePrices, setClosePrices] = useState<Record<number, string>>({});
  const showToast = useToast();

  useEffect(() => {
    setClosePrices(Object.fromEntries(p.holdings.map((holding) => [
      holding.id,
      holding.currentPrice == null ? '' : priceInputValue(holding.currentPrice),
    ])));
  }, [p.holdings]);

  async function confirmClosePortfolio() {
    if (!closeDate) {
      showToast('Introduce la fecha de cierre', 'err');
      return;
    }
    const rawPrices = openHoldings.map((holding) => ({
      holdingId: holding.id,
      raw: closePrices[holding.id]?.trim() ?? '',
    }));
    if (rawPrices.some(({ raw }) => raw === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0)) {
      showToast('Completa un precio válido para cada posición abierta', 'err');
      return;
    }
    const prices = rawPrices.map(({ holdingId, raw }) => ({ holdingId, closePrice: Number(raw) }));
    const result = await closePortfolio(account, { portfolio: p.concepto, fecha: closeDate, prices });
    if (!result.ok) {
      showToast(result.error || 'Error al cerrar la cartera', 'err');
      return;
    }
    setClosing(false);
    showToast('Cartera cerrada', 'ok');
    onSaved();
  }

  return (
    <details className="portfolio-holding-details">
      <summary className="portfolio-holding-summary">
        <span className="portfolio-holding-name">{p.concepto}</span>
        <span className="nowrap">{fd(p.fi)}</span>
        <span className="r">{money(p.invertido, currency)}</span>
        <span className={`r ${pnlClass(p.pnl)}`}>
          {p.pnl === null ? '—' : `${money(p.pnl, currency)} (${p.pnlPct?.toFixed(2)}%)`}
        </span>
        <span className="r portfolio-holding-meta">
          {p.holdings.length} ticker{p.holdings.length !== 1 ? 's' : ''}
        </span>
      </summary>
      {p.holdings.length > 0 && (
        <div className="holdings-scroll">
          <table className="holdings-table">
            <colgroup>
              <col className="col-ticker" />
              <col className="col-shares" />
              <col className="col-company" />
              <col className="col-num" />
              <col className="col-num" />
              <col className="col-num" />
              <col className="col-pnl" />
              <col className="col-actions" />
              <col className="col-note" />
            </colgroup>
            <thead>
              <tr>
                <th>Ticker</th>
                <th className="r">Acciones</th>
                <th>Empresa</th>
                <th className="r">Medio</th>
                <th className="r">Capital</th>
                <th className="r">Actual</th>
                <th className="r">PnL</th>
                <th className="r">Estado</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {p.holdings.map((h) => (
                <HoldingRow key={h.id} account={account} holding={h} currency={currency} onSaved={onSaved} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openHoldings.length > 0 && (
        <div className="portfolio-close-area">
          {closing ? (
            <div className="portfolio-close-panel">
              <div className="portfolio-close-heading">
                <div>
                  <strong>Cerrar {p.concepto}</strong>
                  <span>{`Se registrará el cierre de ${openHoldings.length} posición${openHoldings.length === 1 ? '' : 'es'} en una operación.`}</span>
                </div>
                <label>
                  <span>Fecha</span>
                  <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
                </label>
              </div>
              <div className="portfolio-close-prices">
                {openHoldings.map((holding) => (
                  <label key={holding.id}>
                    <span>{`${holding.ticker} #${holding.id} · ${holding.shares} acciones · cierre (${currency})`}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={closePrices[holding.id] ?? ''}
                      onChange={(e) => setClosePrices((previous) => ({ ...previous, [holding.id]: e.target.value }))}
                      aria-label={`Precio de cierre ${holding.ticker}`}
                    />
                  </label>
                ))}
              </div>
              <div className="portfolio-close-actions">
                <button className="btn btn-ghost btn-compact" onClick={() => setClosing(false)}>Cancelar</button>
                <button className="btn btn-primary btn-compact" onClick={confirmClosePortfolio}>Confirmar cierre</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-ghost btn-compact portfolio-close-trigger" onClick={() => {
              setCloseDate(localISODate());
              setClosing(true);
            }}>
              Cerrar cartera
            </button>
          )}
        </div>
      )}
    </details>
  );
}

function buildClosedColumns(currency: string): Column<ClosedInvestPosition>[] {
  return [
    { header: 'Cartera', render: (r) => r.Concepto, cellClass: () => 'nowrap' },
    { header: 'Inicio', render: (r) => fd(r.fi), cellClass: () => 'nowrap' },
    { header: 'Cierre', render: (r) => fd(r.fr), cellClass: () => 'nowrap' },
    { header: 'Capital', headerClass: 'r', render: (r) => money(r.invertido, currency), cellClass: () => 'r' },
    { header: 'Devuelto', headerClass: 'r', render: (r) => money(r.devuelto, currency), cellClass: () => 'r' },
    {
      header: 'Balance', headerClass: 'r', render: (r) => money(r.bal, currency),
      cellClass: (r) => `r ${r.bal >= 0 ? 'num-pos' : 'num-neg'}`,
    },
    {
      header: 'ROI',
      headerClass: 'r',
      render: (r) => `${r.roi.toFixed(2)}%`,
      cellClass: (r) => `r ${r.roi >= 0 ? 'num-pos' : 'num-neg'}`,
    },
  ];
}

interface Props {
  account: AccountId;
  report: PortfolioReport;
  currency: string;
  onSaved: () => void;
}

/** Las carteras abiertas viven en portfolio_holdings (composición real por
 * ticker, ver docs/ARCHITECTURE.md). El PnL de un holding usa el precio de
 * cierre si ya se vendió, si no el último precio de mercado consultado
 * (botón "Precios actuales", InversionesSection) -- no realizado hasta
 * cerrar. El PnL de la cartera solo aparece cuando TODOS sus holdings
 * tienen algún precio. Todo se muestra en la divisa nativa de la cuenta,
 * incluido el historial legado (Cartera 1, sin CSV) -- ver
 * scripts/backfill_exchange_rates.py. */
export function InversionesBody({ account, report, currency, onSaved }: Props) {
  if (!report.openCount && !report.closedCount) {
    return <div className="empty">No hay carteras registradas todavía.</div>;
  }
  return (
    <>
      <SectionKpis items={sectionKpis(report, currency)} />

      {report.openCount > 0 && (
        <section className="investment-portfolio-group investment-portfolio-open">
          <header className="investment-portfolio-heading">
            <div>
              <span className="investment-portfolio-eyebrow">En curso</span>
              <h3>Carteras abiertas</h3>
              <p>Composición, valoración y cierre de cada cartera.</p>
            </div>
            <span className="investment-portfolio-count">{report.openCount}</span>
          </header>
          <div className="portfolio-holding-header">
            <span>Cartera</span>
            <span>Inicio</span>
            <span className="r">Capital</span>
            <span className="r">PnL</span>
            <span className="r"></span>
          </div>
          {report.openPositions.map((p) => (
            <OpenPortfolioRow key={p.concepto} account={account} p={p} currency={currency} onSaved={onSaved} />
          ))}
        </section>
      )}

      {report.closedPositions.length > 0 && (
        <section className="investment-portfolio-group investment-portfolio-history">
          <header className="investment-portfolio-heading">
            <div>
              <span className="investment-portfolio-eyebrow">Archivo</span>
              <h3>Historial de carteras</h3>
              <p>Resultados agrupados por cartera, no por lote o ticker.</p>
            </div>
            <span className="investment-portfolio-count">{report.closedPositions.length}</span>
          </header>
          <DataTable columns={buildClosedColumns(currency)} rows={report.closedPositions} rowKey={(r, i) => `${r.Concepto}-${i}`} />
        </section>
      )}
    </>
  );
}
