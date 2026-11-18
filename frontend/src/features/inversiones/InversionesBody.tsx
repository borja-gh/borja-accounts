import { useEffect, useState, type SyntheticEvent } from 'react';
import { closePortfolio, closePortfolioPosition, fetchClosedPortfolioHoldings, updatePortfolioHolding } from '../../api/client';
import type { AccountId, ClosedInvestPosition, ClosedPortfolioHolding, OpenInvestPosition, PortfolioHoldingDetail, PortfolioReport } from '../../api/types';
import { DateTimeField } from '../../components/DateTimeField';
import { SectionKpis, type SectionKpiItem } from '../../components/SectionKpis';
import { useToast } from '../../components/ToastContext';
import { fd, money, priceInputValue, localISODateTime } from '../../lib/format';
import { parseDecimal } from '../../lib/math';
import { EditHoldingModal } from './EditHoldingModal';
import { RenamePortfolioModal } from './RenamePortfolioModal';

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

function HoldingRow({
  account,
  holding,
  currency,
  onSaved,
  onEdit,
  canClosePosition,
  isClosingPosition,
  closePositionMessage,
  closeDate,
  positionClosePrice,
  onClosePosition,
  onCloseDateChange,
  onClosePriceChange,
  onCancelClosePosition,
  onConfirmClosePosition,
}: {
  account: AccountId;
  holding: PortfolioHoldingDetail;
  currency: string;
  onSaved: () => void;
  onEdit: (holding: PortfolioHoldingDetail) => void;
  canClosePosition: boolean;
  onClosePosition: (ticker: string) => void;
  isClosingPosition: boolean;
  closePositionMessage: string;
  closeDate: string;
  positionClosePrice: string;
  onCloseDateChange: (date: string) => void;
  onClosePriceChange: (price: string) => void;
  onCancelClosePosition: () => void;
  onConfirmClosePosition: () => void;
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
    const value = trimmed === '' ? null : parseDecimal(trimmed);
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
    <>
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
            type="text"
            inputMode="decimal"
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
            <div className="pnl-stack">
              <span className="badge b-inversion">Abierta</span>
              {canClosePosition && (
                <button
                  className="btn btn-ghost btn-compact position-close-trigger"
                  onClick={() => onClosePosition(holding.ticker)}
                  aria-expanded={isClosingPosition}
                >
                  Cerrar
                </button>
              )}
            </div>
          )}
          <button className="btn btn-ghost btn-compact holding-edit-trigger" onClick={() => onEdit(holding)}>
            Editar
          </button>
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
      {isClosingPosition && (
        <tr className="holding-close-row">
          <td colSpan={9}>
            <div className="portfolio-close-panel">
              <div className="portfolio-close-heading">
                <div>
                  <strong>Venta de {holding.ticker}</strong>
                  <span>{closePositionMessage}</span>
                </div>
                <label>
                  <span>Fecha y hora de venta</span>
                  <DateTimeField value={closeDate} onChange={onCloseDateChange} />
                </label>
              </div>
              <div className="portfolio-close-prices">
                <label>
                  <span>{`Precio de venta (${currency})`}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={positionClosePrice}
                    onChange={(e) => onClosePriceChange(e.target.value)}
                    aria-label={`Precio de venta ${holding.ticker}`}
                  />
                </label>
              </div>
              <div className="portfolio-close-actions">
                <button className="btn btn-ghost btn-compact" onClick={onCancelClosePosition}>Cancelar</button>
                <button className="btn btn-primary btn-compact" onClick={onConfirmClosePosition}>Confirmar venta</button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function OpenPortfolioRow({ account, p, currency, onSaved, onRename }: {
  account: AccountId;
  p: OpenInvestPosition;
  currency: string;
  onSaved: () => void;
  onRename: (portfolio: string) => void;
}) {
  const openHoldings = p.holdings.filter((holding) => holding.closePrice === null);
  const [editingHolding, setEditingHolding] = useState<PortfolioHoldingDetail | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeDate, setCloseDate] = useState(localISODateTime());
  const [closePrices, setClosePrices] = useState<Record<number, string>>({});
  const [closingTicker, setClosingTicker] = useState<string | null>(null);
  const [positionClosePrice, setPositionClosePrice] = useState('');
  const showToast = useToast();

  const firstOpenLotByTicker = new Map<string, number>();
  for (const holding of openHoldings) {
    if (!firstOpenLotByTicker.has(holding.ticker)) firstOpenLotByTicker.set(holding.ticker, holding.id);
  }

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
    if (rawPrices.some(({ raw }) => raw === '' || !Number.isFinite(parseDecimal(raw)) || parseDecimal(raw) < 0)) {
      showToast('Completa un precio válido para cada posición abierta', 'err');
      return;
    }
    const prices = rawPrices.map(({ holdingId, raw }) => ({ holdingId, closePrice: parseDecimal(raw) }));
    const result = await closePortfolio(account, { portfolio: p.concepto, fecha: closeDate, prices });
    if (!result.ok) {
      showToast(result.error || 'Error al cerrar la cartera', 'err');
      return;
    }
    setClosing(false);
    showToast('Cartera cerrada', 'ok');
    onSaved();
  }

  async function confirmClosePosition() {
    const ticker = closingTicker;
    const price = positionClosePrice.trim();
    if (!ticker) return;
    if (!closeDate) {
      showToast('Introduce la fecha de cierre', 'err');
      return;
    }
    if (price === '' || !Number.isFinite(parseDecimal(price)) || parseDecimal(price) < 0) {
      showToast('Introduce un precio de cierre válido', 'err');
      return;
    }
    const result = await closePortfolioPosition(account, {
      portfolio: p.concepto,
      ticker,
      closePrice: parseDecimal(price),
      fecha: closeDate,
    });
    if (!result.ok) {
      showToast(result.error || 'Error al cerrar la posición', 'err');
      return;
    }
    setClosingTicker(null);
    showToast(`Posición ${ticker} cerrada`, 'ok');
    onSaved();
  }

  function startClosePosition(ticker: string) {
    if (closingTicker === ticker) {
      setClosingTicker(null);
      return;
    }
    const firstLot = openHoldings.find((holding) => holding.ticker === ticker);
    setCloseDate(localISODateTime());
    setPositionClosePrice(firstLot?.currentPrice == null ? '' : priceInputValue(firstLot.currentPrice));
    setClosingTicker(ticker);
    setClosing(false);
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
                <HoldingRow
                  key={h.id}
                  account={account}
                  holding={h}
                  currency={currency}
                  onSaved={onSaved}
                  onEdit={setEditingHolding}
                  canClosePosition={firstOpenLotByTicker.get(h.ticker) === h.id}
                  onClosePosition={startClosePosition}
                  isClosingPosition={firstOpenLotByTicker.get(h.ticker) === h.id && closingTicker === h.ticker}
                  closePositionMessage={
                    openHoldings.some((holding) => holding.ticker !== h.ticker)
                      ? `Se venderán ${openHoldings
                        .filter((holding) => holding.ticker === h.ticker)
                        .reduce((total, holding) => total + holding.shares, 0)} acciones. El resto de la cartera seguirá abierto.`
                      : 'Es la última posición abierta; al venderla, la cartera pasará al historial.'
                  }
                  closeDate={closeDate}
                  positionClosePrice={positionClosePrice}
                  onCloseDateChange={setCloseDate}
                  onClosePriceChange={setPositionClosePrice}
                  onCancelClosePosition={() => setClosingTicker(null)}
                  onConfirmClosePosition={confirmClosePosition}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openHoldings.length > 0 && (
        <div className="portfolio-close-area">
          <button className="btn btn-ghost btn-compact portfolio-rename-trigger" onClick={() => onRename(p.concepto)}>
            Renombrar cartera
          </button>
          {closing ? (
            <div className="portfolio-close-panel">
              <div className="portfolio-close-heading">
                <div>
                  <strong>Cerrar {p.concepto}</strong>
                  <span>{`Se registrará el cierre de ${openHoldings.length} posición${openHoldings.length === 1 ? '' : 'es'} en una operación.`}</span>
                </div>
                <label>
                  <span>Fecha y hora</span>
                  <DateTimeField value={closeDate} onChange={setCloseDate} />
                </label>
              </div>
              <div className="portfolio-close-prices">
                {openHoldings.map((holding) => (
                  <label key={holding.id}>
                    <span>{`${holding.ticker} #${holding.id} · ${holding.shares} acciones · cierre (${currency})`}</span>
                    <input
                      type="text"
                      inputMode="decimal"
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
              setCloseDate(localISODateTime());
              setClosingTicker(null);
              setClosing(true);
            }}>
              Cerrar cartera
            </button>
          )}
        </div>
      )}
      {editingHolding && (
        <EditHoldingModal
          key={editingHolding.id}
          account={account}
          currency={currency}
          holding={editingHolding}
          onClose={() => setEditingHolding(null)}
          onSaved={onSaved}
        />
      )}
    </details>
  );
}

/** Concepto del historial: «Cartera», «Cartera · TICKER» (cierre parcial,
 * con sufijo «· cierre parcial») o el legado sin lotes. El nombre de cartera
 * es siempre el primer segmento: el backend rechaza nombres con « · ». */
function portfolioOfClosedRow(concepto: string): string {
  return concepto.replace(/ · cierre parcial$/, '').split(' · ')[0];
}

function tickerOfClosedRow(concepto: string): string | null {
  const segments = concepto.replace(/ · cierre parcial$/, '').split(' · ');
  return segments.length > 1 ? segments[1] : null;
}

function ClosedPositionRow({ account, row, currency, onRename }: {
  account: AccountId;
  row: ClosedInvestPosition;
  currency: string;
  onRename: (portfolio: string) => void;
}) {
  const portfolio = portfolioOfClosedRow(row.Concepto);
  const ticker = tickerOfClosedRow(row.Concepto);
  const [lots, setLots] = useState<ClosedPortfolioHolding[] | null>(null);
  const [failed, setFailed] = useState(false);

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    if (!event.currentTarget.open || lots !== null || failed) return;
    fetchClosedPortfolioHoldings(account)
      .then((all) => setLots(all.filter((h) => h.portfolio === portfolio && (ticker === null || h.ticker === ticker))))
      .catch(() => setFailed(true));
  }

  return (
    <details className="portfolio-holding-details closed-position-details" onToggle={handleToggle}>
      <summary className="closed-position-summary">
        <span className="portfolio-holding-name">{row.Concepto}</span>
        <span className="nowrap">{fd(row.fi)}</span>
        <span className="nowrap">{fd(row.fr)}</span>
        <span className="r">{money(row.invertido, currency)}</span>
        <span className="r">{money(row.devuelto, currency)}</span>
        <span className={`r ${row.bal >= 0 ? 'num-pos' : 'num-neg'}`}>{money(row.bal, currency)}</span>
        <span className={`r ${row.roi >= 0 ? 'num-pos' : 'num-neg'}`}>{`${row.roi.toFixed(2)}%`}</span>
        <span className="r">
          <button
            className="btn btn-ghost btn-compact portfolio-rename-trigger"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRename(portfolio);
            }}
          >
            Renombrar
          </button>
        </span>
      </summary>
      <div className="closed-position-body">
        {failed && <p className="hint-total">No se pudieron cargar las posiciones.</p>}
        {!failed && lots === null && <p className="hint-total">Cargando posiciones…</p>}
        {lots !== null && lots.length === 0 && (
          <p className="hint-total">Sin lotes por ticker: histórico legado.</p>
        )}
        {lots !== null && lots.length > 0 && (
          <div className="holdings-scroll">
            <table className="holdings-table">
              <colgroup>
                <col className="col-ticker" />
                <col className="col-shares" />
                <col className="col-company" />
                <col className="col-num" />
                <col className="col-num" />
                <col className="col-num" />
                <col className="col-num" />
                <col className="col-pnl" />
              </colgroup>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th className="r">Acciones</th>
                  <th>Empresa</th>
                  <th className="r">Medio</th>
                  <th className="r">Invertido</th>
                  <th className="r">Cierre</th>
                  <th className="r">Devuelto</th>
                  <th className="r">PnL</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => (
                  <tr key={lot.id}>
                    <td><b>{lot.ticker}</b></td>
                    <td className="r">{lot.shares}</td>
                    <td className="holdings-company" title={lot.company}>{lot.company}</td>
                    <td className="r">{money(lot.avgPrice, currency, 4)}</td>
                    <td className="r">{money(lot.capital, currency)}</td>
                    <td className="r">{money(lot.closePrice, currency)}</td>
                    <td className="r">{money(lot.proceeds, currency)}</td>
                    <td className={`r ${pnlClass(lot.pnl)}`}>
                      <span className="pnl-stack">
                        <span>{money(lot.pnl, currency)}</span>
                        {lot.pnlPct != null && <span className="pnl-pct">{lot.pnlPct.toFixed(2)}%</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
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
  const [renamingPortfolio, setRenamingPortfolio] = useState<string | null>(null);
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
            <OpenPortfolioRow
              key={p.concepto}
              account={account}
              p={p}
              currency={currency}
              onSaved={onSaved}
              onRename={setRenamingPortfolio}
            />
          ))}
        </section>
      )}

      {report.closedPositions.length > 0 && (
        <section className="investment-portfolio-group investment-portfolio-history">
          <header className="investment-portfolio-heading">
            <div>
              <span className="investment-portfolio-eyebrow">Archivo</span>
              <h3>Historial de carteras</h3>
              <p>Carteras cerradas y posiciones vendidas en carteras que siguen abiertas.</p>
            </div>
            <span className="investment-portfolio-count">{report.closedPositions.length}</span>
          </header>
          <div className="portfolio-holding-header closed-position-header">
            <span>Cartera</span>
            <span>Inicio</span>
            <span>Cierre</span>
            <span className="r">Capital</span>
            <span className="r">Devuelto</span>
            <span className="r">Balance</span>
            <span className="r">ROI</span>
            <span className="r"></span>
          </div>
          {report.closedPositions.map((row, index) => (
            <ClosedPositionRow
              key={`${row.Concepto}-${index}`}
              account={account}
              row={row}
              currency={currency}
              onRename={setRenamingPortfolio}
            />
          ))}
        </section>
      )}
      {renamingPortfolio && (
        <RenamePortfolioModal
          key={renamingPortfolio}
          account={account}
          portfolio={renamingPortfolio}
          onClose={() => setRenamingPortfolio(null)}
          onRenamed={onSaved}
        />
      )}
    </>
  );
}
