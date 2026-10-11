import { useEffect, useState } from 'react';
import { fetchExpenseRecurrences, updateExpenseRecurrence } from '../../api/client';
import type { ExpenseRecurrenceConcept } from '../../api/types';
import { useToast } from '../../components/ToastContext';

interface Props {
  account: string;
  reloadToken: number;
  onUpdated: () => void;
}

export function ExpenseRecurrenceSection({ account, reloadToken, onUpdated }: Props) {
  const [concepts, setConcepts] = useState<ExpenseRecurrenceConcept[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingConcept, setSavingConcept] = useState<string | null>(null);
  const [error, setError] = useState('');
  const showToast = useToast();

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    setLoading(true);
    fetchExpenseRecurrences(account)
      .then((result) => {
        if (!active) return;
        setConcepts(result.conceptos);
        setError('');
      })
      .catch(() => {
        if (active) setError('No se pudo cargar la lista de conceptos.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [account, expanded, reloadToken]);

  async function handleChange(concept: ExpenseRecurrenceConcept) {
    const recurrente = !concept.recurrente;
    setSavingConcept(concept.concepto);
    try {
      const result = await updateExpenseRecurrence(account, concept.concepto, recurrente);
      if (!result.ok) {
        showToast(result.error || 'No se pudo actualizar la recurrencia', 'err');
        return;
      }
      setConcepts((current) => current.map((item) => (
        item.concepto === concept.concepto ? { ...item, recurrente } : item
      )));
      showToast(`${concept.concepto}: ${recurrente ? 'recurrente' : 'puntual'}`, 'ok');
      onUpdated();
    } catch {
      showToast('Error de conexión', 'err');
    } finally {
      setSavingConcept(null);
    }
  }

  return (
    <div className="expense-recurrence">
      <button
        className="expense-recurrence-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="expense-recurrence-toggle-copy">
          <strong>Recurrencia de gastos</strong>
          <span>Clasifica cada concepto como recurrente o puntual</span>
        </span>
        <span className={`expense-recurrence-chevron ${expanded ? 'is-open' : ''}`} aria-hidden="true">⌄</span>
      </button>
      {expanded && (
        <div className="expense-recurrence-content">
          <p className="expense-recurrence-copy">
            En conceptos recurrentes, la media divide entre los meses desde la primera aparición. En puntuales, entre todos los meses del registro.
          </p>
          {loading ? (
            <p className="expense-recurrence-empty">Cargando conceptos…</p>
          ) : error ? (
            <p className="expense-recurrence-error">{error}</p>
          ) : concepts.length ? (
            <ul className="expense-recurrence-list">
              {concepts.map((concept) => (
                <li className="expense-recurrence-item" key={concept.concepto}>
                  <span>{concept.concepto}</span>
                  <label className="expense-recurrence-control">
                    <input
                      type="checkbox"
                      checked={concept.recurrente}
                      disabled={savingConcept !== null}
                      aria-label={`${concept.recurrente ? 'Marcar puntual' : 'Marcar recurrente'}: ${concept.concepto}`}
                      onChange={() => handleChange(concept)}
                    />
                    <span>{concept.recurrente ? 'Recurrente' : 'Puntual'}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="expense-recurrence-empty">Aún no hay conceptos de gasto que clasificar.</p>
          )}
        </div>
      )}
    </div>
  );
}
