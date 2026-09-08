import { useEffect, useState } from 'react';
import { updatePortfolioHolding } from '../../api/client';
import type { AccountId, ClosedInvestPosition, OpenInvestPosition, PortfolioHoldingDetail, PortfolioReport } from '../../api/types';
import { DataTable, type Column } from '../../components/DataTable';
import { SectionKpis, type SectionKpiItem } from '../../components/SectionKpis';
import { useToast } from '../../components/ToastContext';
import { fd, money } from '../../lib/format';

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
  const [currentPrice, setCurrentPrice] = useState(holding.currentPrice?.toString() ?? '');
  const [note, setNote] = useState(holding.note ?? '');
  const [closing, setClosing] = useState(false);
  const [closePriceInput, setClosePriceInput] = useState('');
  const showToast = useToast();
  const isClosed = holding.closePrice !== null;

  useEffect(() => {
    setCurrentPrice(holding.currentPrice?.toString() ?? '');
  }, [holding.currentPrice]);

  async function saveCurrentPrice() {
    const trimmed = currentPrice.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && (Number.isNaN(value) || value < 0)) {
      showToast('Precio actual inválido', 'err');
      setCurrentPrice(holding.currentPrice?.toString() ?? '');
      return;
    }
    if (value === holding.currentPrice) return;
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

  function startClose() {
    setClosePriceInput(holding.currentPrice?.toString() ?? '');
    setClosing(true);
  }

  async function confirmClose() {
    const trimmed = closePriceInput.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value === null || Number.isNaN(value) || value < 0) {
      showToast('Precio de cierre inválido', 'err');
      return;
    }
    const result = await updatePortfolioHolding(account, holding.id, { closePrice: value });
    if (!result.ok) {
      showToast(result.error || 'Error al guardar', 'err');
      return;
    }
    setClosing(false);
    showToast('Venta registrada', 'ok');
    onSaved();
  }

  return (
    <tr>
      <td>
        <b>{holding.ticker}</b>
      </td>
      <td className="nowrap">{holding.company}</td>
      <td className="r">{money(holding.avgPrice, currency)}</td>
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
        {holding.pnl === null ? '—' : `${money(holding.pnl, currency)} (${holding.pnlPct?.toFixed(2)}%)`}
      </td>
      <td className="r">
        {isClosed ? (
          <span className="badge b-transferencia">Cerrado</span>
        ) : closing ? (
          <div className="close-row">
            <input
              type="number"
              step="0.01"
              min="0"
              autoFocus
              value={closePriceInput}
              onChange={(e) => setClosePriceInput(e.target.value)}
              className="input-compact w-80"
            />
            <button className="btn btn-ghost btn-tiny" onClick={confirmClose}>
              OK
            </button>
          </div>
        ) : (
          <div className="close-row">
            <span className="badge b-ingreso">Abierta</span>
            <button className="btn btn-ghost btn-tiny" onClick={startClose}>
              Cerrar
            </button>
          </div>
        )}
      </td>
      <td className="r">{holding.closePrice === null ? '—' : money(holding.closePrice, currency)}</td>
      <td>
        <input
          type="text"
          placeholder="Anotación"
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
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Empresa</th>
                <th className="r">Precio medio</th>
                <th className="r">Capital</th>
                <th className="r">Precio actual</th>
                <th className="r">PnL</th>
                <th className="r">Estado</th>
                <th className="r">Precio cierre</th>
                <th>Anotaciones</th>
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
        <div className="pos-block table-scroll">
          <div className="open-pos-header">{`● Carteras abiertas · ${report.openCount}`}</div>
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
        </div>
      )}

      {report.closedPositions.length > 0 && (
        <div>
          <div className="closed-pos-header">{`Historial de carteras · ${report.closedPositions.length}`}</div>
          <DataTable columns={buildClosedColumns(currency)} rows={report.closedPositions} rowKey={(r, i) => `${r.Concepto}-${i}`} />
        </div>
      )}
    </>
  );
}
