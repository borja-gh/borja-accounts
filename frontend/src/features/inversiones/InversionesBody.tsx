import { useState } from 'react';
import { updatePortfolioHolding } from '../../api/client';
import type { AccountId, ClosedInvestPosition, OpenInvestPosition, PortfolioHoldingDetail, PortfolioReport } from '../../api/types';
import { DataTable, type Column } from '../../components/DataTable';
import { SectionKpis, type SectionKpiItem } from '../../components/SectionKpis';
import { useToast } from '../../components/ToastContext';
import { eur, fd, money } from '../../lib/format';

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
      sub: report.closedCount ? `PnL ${eur(report.totalPnL)}` : undefined,
    },
  ];
}

function HoldingRow({ account, holding, currency, onSaved }: {
  account: AccountId;
  holding: PortfolioHoldingDetail;
  currency: string;
  onSaved: () => void;
}) {
  const [closePrice, setClosePrice] = useState(holding.closePrice?.toString() ?? '');
  const [note, setNote] = useState(holding.note ?? '');
  const showToast = useToast();

  async function saveClosePrice() {
    const trimmed = closePrice.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && (Number.isNaN(value) || value < 0)) {
      showToast('Precio de cierre inválido', 'err');
      setClosePrice(holding.closePrice?.toString() ?? '');
      return;
    }
    if (value === holding.closePrice) return;
    const result = await updatePortfolioHolding(account, holding.id, { closePrice: value });
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
      <td className="nowrap">{holding.company}</td>
      <td className="r">{money(holding.avgPrice, currency)}</td>
      <td className="r">{money(holding.capital, currency)}</td>
      <td className="r">
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="—"
          value={closePrice}
          onChange={(e) => setClosePrice(e.target.value)}
          onBlur={saveClosePrice}
          style={{ width: 90, textAlign: 'right' }}
        />
      </td>
      <td className={`r ${pnlClass(holding.pnl)}`}>
        {holding.pnl === null ? '—' : `${money(holding.pnl, currency)} (${holding.pnlPct?.toFixed(2)}%)`}
      </td>
      <td>
        <input
          type="text"
          placeholder="Anotación"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          style={{ width: '100%' }}
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
        <span className="r" style={{ color: 'var(--muted)' }}>
          {p.holdings.length} ticker{p.holdings.length !== 1 ? 's' : ''}
        </span>
      </summary>
      {p.holdings.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Empresa</th>
                <th className="r">Precio medio</th>
                <th className="r">Capital</th>
                <th className="r">Precio cierre</th>
                <th className="r">PnL</th>
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

const closedColumns: Column<ClosedInvestPosition>[] = [
  { header: 'Cartera', render: (r) => r.Concepto, cellClass: () => 'nowrap' },
  { header: 'Inicio', render: (r) => fd(r.fi), cellClass: () => 'nowrap' },
  { header: 'Cierre', render: (r) => fd(r.fr), cellClass: () => 'nowrap' },
  { header: 'Capital', headerClass: 'r', render: (r) => eur(r.invertido), cellClass: () => 'r' },
  { header: 'Devuelto', headerClass: 'r', render: (r) => eur(r.devuelto), cellClass: () => 'r' },
  { header: 'Balance', headerClass: 'r', render: (r) => eur(r.bal), cellClass: (r) => `r ${r.bal >= 0 ? 'num-pos' : 'num-neg'}` },
  {
    header: 'ROI',
    headerClass: 'r',
    render: (r) => `${r.roi.toFixed(2)}%`,
    cellClass: (r) => `r ${r.roi >= 0 ? 'num-pos' : 'num-neg'}`,
  },
];

interface Props {
  account: AccountId;
  report: PortfolioReport;
  currency: string;
  onSaved: () => void;
}

/** Las carteras abiertas viven en portfolio_holdings (composición real por
 * ticker, ver docs/ARCHITECTURE.md) -- sin seguimiento de valor de mercado
 * en vivo: es un check de compra/cierre, no un tracker. El PnL de un
 * holding solo aparece cuando se rellena su precio de cierre; el PnL de la
 * cartera solo cuando TODOS sus holdings tienen precio de cierre. Solo el
 * historial legado (Cartera 1, sin CSV) sigue en EUR. */
export function InversionesBody({ account, report, currency, onSaved }: Props) {
  if (!report.openCount && !report.closedCount) {
    return <div className="empty">No hay carteras registradas todavía.</div>;
  }
  return (
    <>
      <SectionKpis items={sectionKpis(report, currency)} />

      {report.openCount > 0 && (
        <div style={{ borderBottom: '1px solid var(--border)' }}>
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
          <div style={{ overflowX: 'auto' }}>
            <DataTable columns={closedColumns} rows={report.closedPositions} rowKey={(r, i) => `${r.Concepto}-${i}`} />
          </div>
        </div>
      )}
    </>
  );
}
