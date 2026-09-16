import { useEffect, useMemo, useState } from 'react';
import { createPortfolioHolding } from '../../api/client';
import type { AccountId, Currency } from '../../api/types';
import { useToast } from '../../components/ToastContext';
import { localISODate, money } from '../../lib/format';
import { ExchangeRateField } from '../transferencias/ExchangeRateField';

interface Props {
  open: boolean;
  account: AccountId;
  currency: Currency;
  caja: number;
  portfolios: string[];
  onClose: () => void;
  onCreated: () => void;
}

export function CreateHoldingModal({ open, account, currency, caja, portfolios, onClose, onCreated }: Props) {
  const [portfolio, setPortfolio] = useState('');
  const [ticker, setTicker] = useState('');
  const [company, setCompany] = useState('');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [usdPrice, setUsdPrice] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [fecha, setFecha] = useState(localISODate());
  const showToast = useToast();
  const needsUsdHelper = currency !== 'USD';

  useEffect(() => {
    if (open) {
      setPortfolio(portfolios[0] ?? '');
      setTicker('');
      setCompany('');
      setShares('');
      setPrice('');
      setUsdPrice('');
      setExchangeRate('');
      setFecha(localISODate());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const capital = useMemo(() => {
    const s = parseFloat(shares);
    const p = parseFloat(price);
    if (!(s > 0) || !(p > 0)) return null;
    return Math.round(s * p * 100) / 100;
  }, [shares, price]);

  function applyUsdConversion() {
    const usd = parseFloat(usdPrice);
    const rate = parseFloat(exchangeRate);
    if (!(usd > 0) || !(rate > 0)) {
      showToast('Introduce precio en USD y tipo de cambio', 'err');
      return;
    }
    setPrice((Math.round(usd * rate * 100) / 100).toFixed(2));
  }

  if (!open) return null;

  async function handleSubmit() {
    const trimmedPortfolio = portfolio.trim();
    const trimmedTicker = ticker.trim().toUpperCase();
    const sharesNum = parseFloat(shares);
    const priceNum = parseFloat(price);
    if (!trimmedPortfolio) {
      showToast('Introduce el nombre de la cartera', 'err');
      return;
    }
    if (!trimmedTicker) {
      showToast('Introduce el ticker', 'err');
      return;
    }
    if (!(sharesNum > 0) || !(priceNum > 0)) {
      showToast('Títulos y precio deben ser mayores que cero', 'err');
      return;
    }
    if (!fecha) {
      showToast('Introduce una fecha', 'err');
      return;
    }
    try {
      const body = await createPortfolioHolding(account, {
        portfolio: trimmedPortfolio,
        ticker: trimmedTicker,
        company: company.trim() || undefined,
        shares: sharesNum,
        price: priceNum,
        fecha,
      });
      if (!body.ok) {
        showToast(body.error || 'Error al registrar el lote', 'err');
        return;
      }
      onClose();
      showToast(`Lote ${trimmedTicker} registrado`, 'ok');
      onCreated();
    } catch {
      showToast('Error de conexión', 'err');
    }
  }

  return (
    <div className="overlay on">
      <div className="modal modal-wide">
        <h3>+ Nuevo lote</h3>
        <p className="hint-total" style={{ minHeight: 0, marginBottom: 12 }}>
          {`Caja disponible ${money(caja, currency)}. Comprar no saca saldo: despliega caja hacia «En carteras».`}
        </p>
        <div className="fg">
          <label>Cartera</label>
          <input
            type="text"
            list="holding-portfolios"
            placeholder="p.ej. Cartera Core"
            value={portfolio}
            onChange={(e) => setPortfolio(e.target.value)}
          />
          <datalist id="holding-portfolios">
            {portfolios.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div className="fg">
          <label>Ticker</label>
          <input type="text" placeholder="AAPL" value={ticker} onChange={(e) => setTicker(e.target.value)} />
        </div>
        <div className="fg">
          <label>Empresa</label>
          <input type="text" placeholder="opcional" value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div className="fg">
          <label>Títulos</label>
          <input type="number" step="0.0001" min="0" placeholder="0" value={shares} onChange={(e) => setShares(e.target.value)} />
        </div>
        <div className="fg">
          <label>{`Precio (${currency})`}</label>
          <input type="number" step="0.01" min="0" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        {needsUsdHelper && (
          <>
            <div className="fg">
              <label>Precio en USD (opcional)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={usdPrice}
                onChange={(e) => setUsdPrice(e.target.value)}
              />
            </div>
            <ExchangeRateField from="USD" to={currency} value={exchangeRate} onChange={setExchangeRate} />
            <div className="fg">
              <button type="button" className="btn btn-ghost btn-compact" onClick={applyUsdConversion}>
                {`Convertir a ${currency}`}
              </button>
            </div>
          </>
        )}
        <div className="fg">
          <label>Fecha de compra</label>
          <input type="date" className="date-input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        {capital != null && (
          <span className="hint-total">{`Capital ${money(capital, currency)}`}</span>
        )}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            Registrar lote
          </button>
        </div>
      </div>
    </div>
  );
}
