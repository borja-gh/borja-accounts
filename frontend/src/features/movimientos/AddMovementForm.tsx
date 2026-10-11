import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { addMovement } from '../../api/client';
import type { AccountId, AccountKind, Movement } from '../../api/types';
import { TIPOS_POR_KIND, displayTipo } from '../../domain/tipos';
import { isValidMovementAmount } from '../../lib/math';
import { localISODate, money } from '../../lib/format';
import { useToast } from '../../components/ToastContext';
import { candidatesForTipo, rankConcepts, suggestNextApuesta } from './autocomplete';
import { ConceptAutocomplete } from './ConceptAutocomplete';

export interface AddMovementFormHandle {
  /** Usado por "Repetir último" / "Duplicar" en la tabla. Devuelve false
   * (con un toast de error) si el tipo del movimiento no existe en esta
   * cuenta -- misma validación que fillFormFromRow en el vanilla. */
  fillFrom: (row: Movement) => boolean;
}

interface Props {
  account: AccountId;
  kind: AccountKind;
  currency: string;
  data: Movement[];
  onSaved: () => void;
}

export const AddMovementForm = forwardRef<AddMovementFormHandle, Props>(function AddMovementForm(
  { account, kind, currency, data, onSaved },
  ref,
) {
  const tipos = TIPOS_POR_KIND[kind];
  const [fecha, setFecha] = useState(localISODate());
  const [tipo, setTipo] = useState(tipos[0]);
  const [concepto, setConcepto] = useState('');
  const [recurrente, setRecurrente] = useState(true);
  const [total, setTotal] = useState('');
  const conceptoRef = useRef<HTMLInputElement>(null);
  const wasNewExpenseConcept = useRef(false);
  const showToast = useToast();
  const trimmedConcepto = concepto.trim();
  const existingExpenseConcept = tipo === 'Gasto' && data.some(
    (movement) => movement.Tipo === 'Gasto' && movement.Concepto === trimmedConcepto,
  );
  const isNewExpenseConcept = tipo === 'Gasto' && !!trimmedConcepto && !existingExpenseConcept;

  useEffect(() => {
    if (isNewExpenseConcept && !wasNewExpenseConcept.current) setRecurrente(true);
    wasNewExpenseConcept.current = isNewExpenseConcept;
  }, [isNewExpenseConcept]);

  useEffect(() => {
    setFecha(localISODate());
    setTipo(TIPOS_POR_KIND[kind][0]);
    setConcepto('');
    setRecurrente(true);
    setTotal('');
    wasNewExpenseConcept.current = false;
  }, [account, kind]);

  useImperativeHandle(
    ref,
    () => ({
      fillFrom(row) {
        if (!tipos.includes(row.Tipo)) {
          showToast('Ese tipo no está disponible en esta cuenta', 'err');
          return false;
        }
        setTipo(row.Tipo);
        setConcepto(row.Concepto);
        setTotal(Number(row.Total).toFixed(2));
        setFecha(localISODate());
        conceptoRef.current?.focus();
        return true;
      },
    }),
    [tipos, showToast],
  );

  async function handleSubmit() {
    if (!fecha) {
      showToast('Introduce una fecha', 'err');
      return;
    }
    if (!trimmedConcepto) {
      showToast('Introduce un concepto', 'err');
      return;
    }
    const totalNum = parseFloat(total);
    if (!isValidMovementAmount(totalNum, tipo)) {
      showToast('Introduce un importe válido (0 = pérdida total en cobro de apuesta)', 'err');
      return;
    }
    try {
      const body = await addMovement(account, {
        fecha, tipo, concepto: trimmedConcepto, total: totalNum,
        ...(isNewExpenseConcept ? { recurrente } : {}),
      });
      if (!body.ok) {
        showToast(body.error || 'Error al guardar', 'err');
        return;
      }
      showToast(`Guardado · Saldo: ${money(body.saldo, currency)}`, 'ok');
      setFecha(localISODate());
      setTipo(tipos[0]);
      setConcepto('');
      setRecurrente(true);
      setTotal('');
      onSaved();
    } catch {
      showToast('Error de conexión', 'err');
    }
  }

  function conceptSuggestions(query: string) {
    const ranked = rankConcepts(candidatesForTipo(data, tipo, null), query);
    if (tipo === 'Apuestas' && !query.trim()) {
      const next = suggestNextApuesta(data);
      if (next && !ranked.some((r) => r.concepto === next.concepto)) return [next, ...ranked];
    }
    return ranked;
  }

  return (
    <div className="form-body">
      <div className="fg">
        <label>Fecha</label>
        <input type="date" className="date-input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>
      <div className="fg">
        <label>Tipo</label>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {displayTipo(t)}
            </option>
          ))}
        </select>
      </div>
      <div className="fg full">
        <label>Concepto</label>
        <ConceptAutocomplete
          ref={conceptoRef}
          value={concepto}
          onChange={setConcepto}
          suggestions={conceptSuggestions}
          placeholder="Empieza a escribir…"
          onEnterWithMeta={handleSubmit}
        />
      </div>
      {isNewExpenseConcept && (
        <div className="fg full new-expense-recurrence">
          <span className="new-expense-recurrence-title">¿Es recurrente?</span>
          <div className="new-expense-recurrence-options" role="radiogroup" aria-label="¿Es recurrente?">
            <label className={recurrente ? 'is-selected' : ''}>
              <input
                type="radio"
                name="new-expense-recurrence"
                checked={recurrente}
                onChange={() => setRecurrente(true)}
              />
              <span>Sí, recurrente</span>
            </label>
            <label className={!recurrente ? 'is-selected' : ''}>
              <input
                type="radio"
                name="new-expense-recurrence"
                checked={!recurrente}
                onChange={() => setRecurrente(false)}
              />
              <span>No, puntual</span>
            </label>
          </div>
        </div>
      )}
      <div className="fg full">
        <label>Total ({currency})</label>
        <input type="number" placeholder="0.00" step="0.01" min={tipo === 'Apuestas_r' ? '0' : '0.01'} value={total} onChange={(e) => setTotal(e.target.value)} />
      </div>
      <div className="fg full">
        <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleSubmit}>
          Guardar
        </button>
      </div>
    </div>
  );
});
