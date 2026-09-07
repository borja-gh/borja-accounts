import { useEffect, useState } from 'react';
import { createAccount } from '../../api/client';
import type { AccountKind, AccountSummary, Currency } from '../../api/types';
import { useToast } from '../../components/ToastContext';
import { DEFAULT_THEME_BY_KIND, type ThemeName } from '../../styles/themes';
import { ThemePicker } from './ThemePicker';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (account: AccountSummary) => void;
}

export function CreateAccountModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('CASH');
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [initialBalance, setInitialBalance] = useState('');
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME_BY_KIND.CASH);
  const showToast = useToast();

  useEffect(() => {
    if (open) {
      setName('');
      setKind('CASH');
      setCurrency('EUR');
      setInitialBalance('');
      setTheme(DEFAULT_THEME_BY_KIND.CASH);
    }
  }, [open]);

  function handleKindChange(next: AccountKind) {
    setKind(next);
    setTheme(DEFAULT_THEME_BY_KIND[next]);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast('Introduce un nombre', 'err');
      return;
    }
    const saldo = initialBalance.trim() === '' ? 0 : parseFloat(initialBalance);
    if (Number.isNaN(saldo)) {
      showToast('Saldo inicial inválido', 'err');
      return;
    }
    try {
      const body = await createAccount({ name: trimmedName, kind, currency, initialBalance: saldo, theme });
      if (!body.ok) {
        showToast(body.error || 'Error al crear la cuenta', 'err');
        return;
      }
      onClose();
      showToast(`Cuenta "${body.name}" creada`, 'ok');
      onCreated({ id: body.id, name: body.name, kind: body.kind, currency: body.currency, saldo, theme: body.theme });
    } catch {
      showToast('Error de conexión', 'err');
    }
  }

  return (
    <div className="overlay on">
      <div className="modal">
        <h3>+ Nueva cuenta</h3>
        <div className="fg">
          <label>Nombre</label>
          <input type="text" placeholder="p.ej. Cuenta Ahorro" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="fg">
          <label>Tipo</label>
          <select value={kind} onChange={(e) => handleKindChange(e.target.value as AccountKind)}>
            <option value="CASH">Ahorro</option>
            <option value="INVESTMENT">Inversión</option>
          </select>
        </div>
        <div className="fg">
          <label>Tema</label>
          <ThemePicker value={theme} onChange={setTheme} />
        </div>
        <div className="fg">
          <label>Divisa</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div className="fg">
          <label>Saldo inicial ({currency})</label>
          <input
            type="number"
            placeholder="0.00"
            step="0.01"
            value={initialBalance}
            onChange={(e) => setInitialBalance(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            Crear cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
