import { useState } from 'react';
import { fetchFxRate } from '../../api/client';
import type { Currency } from '../../api/types';
import { useToast } from '../../components/ToastContext';

interface Props {
  from: Currency;
  to: Currency;
  value: string;
  onChange: (value: string) => void;
}

export function ExchangeRateField({ from, to, value, onChange }: Props) {
  const [loading, setLoading] = useState(false);
  const showToast = useToast();

  async function consult() {
    setLoading(true);
    try {
      const body = await fetchFxRate(from, to);
      if (!body.ok || body.rate == null) {
        showToast(body.error || `No se pudo consultar ${from}→${to}`, 'err');
        return;
      }
      onChange(String(body.rate));
      showToast(`Tipo ${from}→${to}: ${body.rate}`, 'ok');
    } catch {
      showToast('Error de conexión', 'err');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fg">
      <label>{`Tipo de cambio (1 ${from} = ? ${to})`}</label>
      <div className="fx-row">
        <input
          type="number"
          placeholder="1.000000"
          step="0.000001"
          min="0.000001"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="btn btn-ghost btn-compact" disabled={loading} onClick={consult}>
          {loading ? 'Consultando…' : 'Consultar ahora'}
        </button>
      </div>
    </div>
  );
}
