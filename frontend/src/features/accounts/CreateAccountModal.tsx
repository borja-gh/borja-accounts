import { useEffect, useRef, useState, type FormEvent } from 'react';
import { parseDecimal } from '../../lib/math';
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

const FOCUSABLE = 'input, select, button:not([disabled])';

export function CreateAccountModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('CASH');
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [initialBalance, setInitialBalance] = useState('');
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME_BY_KIND.CASH);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const showToast = useToast();

  useEffect(() => {
    if (open) {
      setName('');
      setKind('CASH');
      setCurrency('EUR');
      setInitialBalance('');
      setTheme(DEFAULT_THEME_BY_KIND.CASH);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    nameRef.current?.focus();
    return () => previous?.focus();
  }, [open]);

  function handleKindChange(next: AccountKind) {
    setKind(next);
    setTheme(DEFAULT_THEME_BY_KIND[next]);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialogRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Introduce un nombre para la cuenta.');
      nameRef.current?.focus();
      return;
    }
    const saldo = initialBalance.trim() === '' ? 0 : parseDecimal(initialBalance);
    if (Number.isNaN(saldo)) {
      setError('El saldo inicial no es un número válido. Usa dígitos y coma o punto decimal, p. ej. 1250,50.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const body = await createAccount({ name: trimmedName, kind, currency, initialBalance: saldo, theme });
      if (!body.ok) {
        setError(body.error || 'No se pudo crear la cuenta.');
        setSubmitting(false);
        return;
      }
      onClose();
      showToast(`Cuenta "${body.name}" creada`, 'ok');
      onCreated({ id: body.id, name: body.name, kind: body.kind, currency: body.currency, saldo, theme: body.theme });
    } catch {
      setError('No se pudo conectar con el servidor local. Comprueba que la aplicación sigue en marcha e inténtalo de nuevo.');
      setSubmitting(false);
    }
  }

  return (
    <div className="overlay on">
      <form
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-account-title"
        onSubmit={handleSubmit}
        noValidate
      >
        <h3 id="create-account-title">+ Nueva cuenta</h3>
        <div className="fg">
          <label htmlFor="create-account-name">Nombre</label>
          <input
            id="create-account-name"
            ref={nameRef}
            type="text"
            placeholder="p.ej. Cuenta Ahorro"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={error !== null && !name.trim()}
          />
        </div>
        <div className="fg">
          <label htmlFor="create-account-kind">Tipo</label>
          <select
            id="create-account-kind"
            value={kind}
            onChange={(e) => handleKindChange(e.target.value as AccountKind)}
          >
            <option value="CASH">Ahorro</option>
            <option value="INVESTMENT">Inversión</option>
          </select>
        </div>
        <div className="fg">
          <label>Tema</label>
          <ThemePicker value={theme} onChange={setTheme} />
        </div>
        <div className="fg">
          <label htmlFor="create-account-currency">Divisa</label>
          <select
            id="create-account-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
          <span className="hint">El tipo y la divisa no se pueden cambiar después.</span>
        </div>
        <div className="fg">
          <label htmlFor="create-account-balance">Saldo inicial ({currency})</label>
          <input
            id="create-account-balance"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={initialBalance}
            onChange={(e) => setInitialBalance(e.target.value)}
            aria-describedby="create-account-balance-hint"
          />
          <span className="hint" id="create-account-balance-hint">
            Opcional. Si no es 0, se registra como movimiento de apertura.
          </span>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creando…' : 'Crear cuenta'}
          </button>
        </div>
      </form>
    </div>
  );
}
