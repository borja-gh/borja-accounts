import { useCallback, useEffect, useState } from 'react';
import { deleteCashBudget, fetchCashBudgetStatus, saveCashBudget } from '../../api/client';
import type { BudgetPeriodType, CashBudgetStatus } from '../../api/types';
import { money } from '../../lib/format';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

interface Props {
  account: string;
  currency: string;
  reloadToken: number;
}

export function CashBudgetSection({ account, currency, reloadToken }: Props) {
  const now = new Date();
  const [periodType, setPeriodType] = useState<BudgetPeriodType>('month');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<CashBudgetStatus | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const result = await fetchCashBudgetStatus(account, periodType, year, month);
      setStatus(result);
      setAmount(result.budget == null ? '' : String(result.budget));
      setError('');
    } catch {
      setError('No se pudo cargar el presupuesto');
    }
  }, [account, periodType, year, month]);

  useEffect(() => {
    void reload();
  }, [reload, reloadToken]);

  async function save() {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('El presupuesto debe ser un importe mayor o igual que cero');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await saveCashBudget(account, { periodType, year, month: periodType === 'year' ? 0 : month, amount: parsed });
      if (!result.ok) {
        setError(result.error || 'No se pudo guardar el presupuesto');
        return;
      }
      await reload();
    } catch {
      setError('No se pudo guardar el presupuesto');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (status?.budgetId == null) return;
    setSaving(true);
    setError('');
    try {
      const result = await deleteCashBudget(account, status.budgetId);
      if (!result.ok) {
        setError(result.error || 'No se pudo borrar el presupuesto');
        return;
      }
      await reload();
    } catch {
      setError('No se pudo borrar el presupuesto');
    } finally {
      setSaving(false);
    }
  }

  const progress = Math.min(100, Math.max(0, status?.percentage ?? 0));
  const periodLabel = periodType === 'month' ? `${MONTHS[month - 1]} ${year}` : `${year}`;

  return (
    <>
      <div className="budget-panel">
        <div className="budget-toolbar">
          <div className="fg">
            <label htmlFor={`budget-period-${account}`}>Periodo</label>
            <select
              id={`budget-period-${account}`}
              value={periodType}
              onChange={(event) => setPeriodType(event.target.value as BudgetPeriodType)}
            >
              <option value="month">Mensual</option>
              <option value="year">Anual</option>
            </select>
          </div>
          {periodType === 'month' && (
            <div className="fg">
              <label htmlFor={`budget-month-${account}`}>Mes</label>
              <select
                id={`budget-month-${account}`}
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
              >
                {MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
              </select>
            </div>
          )}
          <div className="fg budget-year-field">
            <label htmlFor={`budget-year-${account}`}>Año</label>
            <input
              id={`budget-year-${account}`}
              type="number"
              min="1"
              max="9998"
              value={year}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isInteger(next)) setYear(next);
              }}
            />
          </div>
          <div className="fg budget-amount-field">
            <label htmlFor={`budget-amount-${account}`}>Presupuesto ({currency})</label>
            <input
              id={`budget-amount-${account}`}
              type="number"
              min="0"
              step="0.01"
              value={amount}
              placeholder="Sin definir"
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="budget-actions">
            <button type="button" className="btn btn-primary btn-compact" disabled={saving} onClick={() => void save()}>
              Guardar presupuesto
            </button>
            {status?.budgetId != null && (
              <button type="button" className="btn btn-ghost btn-compact" disabled={saving} onClick={() => void remove()}>
                Borrar
              </button>
            )}
          </div>
        </div>
        {error && <div className="budget-error">{error}</div>}
        {status?.budget == null ? (
          <div className="budget-empty">No hay presupuesto definido para {periodLabel}.</div>
        ) : (
          <div className="budget-status" aria-label={`Estado del presupuesto de ${periodLabel}`}>
            <div className="budget-status-head">
              <div>
                <span className="budget-status-label">Gastado</span>
                <strong>{money(status.spent, currency)}</strong>
                <span className="budget-status-sub">de {money(status.budget, currency)}</span>
              </div>
              <div className={status.overBudget ? 'budget-remaining over' : 'budget-remaining'}>
                {status.overBudget
                  ? `Exceso de ${money(Math.abs(status.remaining ?? 0), currency)}`
                  : `Restan ${money(status.remaining ?? 0, currency)}`}
              </div>
            </div>
            <div className="budget-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={status.percentage ?? 0}>
              <span className={status.overBudget ? 'over' : ''} style={{ width: `${progress}%` }} />
            </div>
            <div className="budget-status-foot">
              <span>{status.percentage == null ? '—' : `${status.percentage.toFixed(0)}% consumido`}</span>
              <span>Gasto real = Gasto − Devolución</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
