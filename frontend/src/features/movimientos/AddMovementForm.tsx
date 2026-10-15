import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { addMovement, updateExpenseRecurrence } from '../../api/client';
import type { AccountId, AccountKind, Movement } from '../../api/types';
import { TIPOS_POR_KIND, displayTipo } from '../../domain/tipos';
import { isValidMovementAmount } from '../../lib/math';
import { localISODateTime, money } from '../../lib/format';
import { useToast } from '../../components/ToastContext';
import { candidatesForSubconcept, candidatesForTipo, rankConcepts, suggestNextApuesta } from './autocomplete';
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
  const [fecha, setFecha] = useState(localISODateTime());
  const [tipo, setTipo] = useState(tipos[0]);
  const [concepto, setConcepto] = useState('');
  const [subconcepto, setSubconcepto] = useState('');
  const [total, setTotal] = useState('');
  const [newExpenseConcept, setNewExpenseConcept] = useState<string | null>(null);
  const [savingRecurrence, setSavingRecurrence] = useState(false);
  const conceptoRef = useRef<HTMLInputElement>(null);
  const showToast = useToast();
  const trimmedConcepto = concepto.trim();

  useEffect(() => {
    setFecha(localISODateTime());
    setTipo(TIPOS_POR_KIND[kind][0]);
    setConcepto('');
    setSubconcepto('');
    setTotal('');
    setNewExpenseConcept(null);
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
        setSubconcepto(row.Subconcepto ?? '');
        setTotal(Number(row.Total).toFixed(2));
        setFecha(localISODateTime());
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
        subconcepto: subconcepto.trim() || null,
      });
      if (!body.ok) {
        showToast(body.error || 'Error al guardar', 'err');
        return;
      }
      showToast(`Guardado · Saldo: ${money(body.saldo, currency)}`, 'ok');
      setFecha(localISODateTime());
      setTipo(tipos[0]);
      setConcepto('');
      setSubconcepto('');
      setTotal('');
      if (body.conceptoNuevo) setNewExpenseConcept(trimmedConcepto);
      onSaved();
    } catch {
      showToast('Error de conexión', 'err');
    }
  }

  async function chooseRecurrence(recurrente: boolean) {
    if (!newExpenseConcept) return;
    setSavingRecurrence(true);
    try {
      const result = await updateExpenseRecurrence(account, newExpenseConcept, recurrente);
      if (!result.ok) {
        showToast(result.error || 'No se pudo actualizar la recurrencia', 'err');
        return;
      }
      showToast(recurrente ? 'Concepto marcado como recurrente' : 'Concepto marcado como puntual', 'ok');
      setNewExpenseConcept(null);
      onSaved();
    } catch {
      showToast('Error de conexión', 'err');
    } finally {
      setSavingRecurrence(false);
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
        <label>Fecha y hora</label>
        <input type="datetime-local" className="date-input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>
      <div className="fg">
        <label>Tipo</label>
        <select value={tipo} onChange={(e) => {
          setTipo(e.target.value);
        }}>
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
          onChange={(value) => {
            if (value.trim() !== trimmedConcepto) setSubconcepto('');
            setConcepto(value);
          }}
          suggestions={conceptSuggestions}
          placeholder="Empieza a escribir…"
          onEnterWithMeta={handleSubmit}
        />
      </div>
      <div className="fg full">
        <label>Subconcepto <span className="muted">(opcional)</span></label>
        <ConceptAutocomplete
          value={subconcepto}
          onChange={setSubconcepto}
          suggestions={(query) => rankConcepts(candidatesForSubconcept(data, trimmedConcepto, null, tipo), query)}
          placeholder="Busca un subconcepto…"
        />
      </div>
      <div className="fg full">
        <label>Total ({currency})</label>
        <input type="number" placeholder="0.00" step="0.01" min={tipo === 'Apuestas_r' ? '0' : '0.01'} value={total} onChange={(e) => setTotal(e.target.value)} />
      </div>
      <div className="fg full">
        <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleSubmit}>
          Guardar
        </button>
      </div>
      {newExpenseConcept && (
        <div className="overlay on" role="presentation">
          <section className="modal new-expense-recurrence" role="dialog" aria-modal="true" aria-labelledby="new-expense-recurrence-title">
            <h3 id="new-expense-recurrence-title">¿Es recurrente “{newExpenseConcept}”?</h3>
            <p>El concepto se ha guardado como recurrente por defecto. Puedes clasificarlo como puntual.</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" type="button" disabled={savingRecurrence} onClick={() => chooseRecurrence(false)}>
                No, puntual
              </button>
              <button className="btn btn-primary" type="button" disabled={savingRecurrence} onClick={() => chooseRecurrence(true)}>
                Sí, recurrente
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
});
