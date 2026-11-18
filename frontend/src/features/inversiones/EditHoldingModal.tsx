import { useEffect, useState } from 'react';
import { editPortfolioHolding } from '../../api/client';
import type { AccountId, EditPortfolioHoldingRequest, PortfolioHoldingDetail } from '../../api/types';
import { DateTimeField } from '../../components/DateTimeField';
import { useToast } from '../../components/ToastContext';
import { parseDecimal } from '../../lib/math';

interface Props {
  account: AccountId;
  currency: string;
  holding: PortfolioHoldingDetail;
  onClose: () => void;
  onSaved: () => void;
}

const AMOUNT_FIELDS = [
  { key: 'shares', label: 'Títulos', message: 'Número de títulos inválido' },
  { key: 'price', label: 'Precio medio', message: 'Precio medio inválido' },
  { key: 'capital', label: 'Invertido', message: 'Invertido inválido' },
] as const;

export function EditHoldingModal({ account, currency, holding, onClose, onSaved }: Props) {
  const closed = holding.closePrice !== null;
  const initial = {
    ticker: holding.ticker,
    company: holding.company,
    shares: String(holding.shares),
    price: String(holding.avgPrice),
    capital: String(holding.capital),
  };
  const [ticker, setTicker] = useState(initial.ticker);
  const [company, setCompany] = useState(initial.company);
  const [amounts, setAmounts] = useState({ shares: initial.shares, price: initial.price, capital: initial.capital });
  const [fee, setFee] = useState('');
  const [contributedAt, setContributedAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit() {
    const body: EditPortfolioHoldingRequest = {};
    const nextTicker = ticker.trim().toUpperCase();
    if (!nextTicker) {
      showToast('El ticker no puede estar vacío', 'err');
      return;
    }
    if (nextTicker !== holding.ticker) body.ticker = nextTicker;
    if (company.trim() !== initial.company) body.company = company.trim();

    for (const field of AMOUNT_FIELDS) {
      if (amounts[field.key] === initial[field.key]) continue;
      const value = parseDecimal(amounts[field.key]);
      if (!(value > 0)) {
        showToast(field.message, 'err');
        return;
      }
      body[field.key] = value;
    }

    if (fee.trim() !== '') {
      const value = parseDecimal(fee);
      if (!(value >= 0)) {
        showToast('Comisión inválida', 'err');
        return;
      }
      body.fee = value;
    }
    if (contributedAt) body.contributedAt = contributedAt;

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      const result = await editPortfolioHolding(account, holding.id, body);
      if (!result.ok) {
        showToast(result.error || 'Error al guardar el lote', 'err');
        return;
      }
      onClose();
      showToast(`Lote ${nextTicker} actualizado`, 'ok');
      onSaved();
    } catch {
      showToast('Error de conexión', 'err');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="overlay on">
      <div className="modal modal-wide">
        <h3>{`Editar lote ${holding.ticker}`}</h3>
        {closed && (
          <p className="hint-total" style={{ minHeight: 0, marginBottom: 12 }}>
            Lote cerrado: solo se pueden cambiar el ticker, la empresa y la comisión.
          </p>
        )}
        <div className="fg">
          <label>Ticker</label>
          <input type="text" value={ticker} onChange={(e) => setTicker(e.target.value)} />
        </div>
        <div className="fg">
          <label>Empresa</label>
          <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div className="fg">
          <label>Títulos</label>
          <input
            type="text"
            inputMode="decimal"
            value={amounts.shares}
            disabled={closed}
            onChange={(e) => setAmounts({ ...amounts, shares: e.target.value })}
          />
        </div>
        <div className="fg">
          <label>{`Precio medio (${currency})`}</label>
          <input
            type="text"
            inputMode="decimal"
            value={amounts.price}
            disabled={closed}
            onChange={(e) => setAmounts({ ...amounts, price: e.target.value })}
          />
        </div>
        <div className="fg">
          <label>{`Invertido (${currency})`}</label>
          <input
            type="text"
            inputMode="decimal"
            value={amounts.capital}
            disabled={closed}
            onChange={(e) => setAmounts({ ...amounts, capital: e.target.value })}
          />
        </div>
        <div className="fg">
          <label>{`Comisión (${currency})`}</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="sin cambios"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        </div>
        {!closed && (
          <div className="fg">
            <label>Fecha y hora de compra (vacía: sin cambios)</label>
            <DateTimeField value={contributedAt} onChange={setContributedAt} />
          </div>
        )}
        <p className="hint-total" style={{ minHeight: 0, marginBottom: 12 }}>
          Títulos × precio medio = invertido. Si cambias títulos o invertido se recalcula el precio medio; si cambias el precio medio, se recalcula el invertido.
        </p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
