import { useEffect, useMemo, useState } from 'react';
import type { AccountId, AccountKind, Movement } from '../../api/types';
import { expenseAmount } from '../../domain/expenses';
import { TIPOS_POR_KIND, displayTipo } from '../../domain/tipos';
import { money } from '../../lib/format';
import { ConceptAutocomplete } from './ConceptAutocomplete';
import { conceptCandidatesForSearch, rankConcepts } from './autocomplete';

interface Props {
  account: AccountId;
  kind: AccountKind;
  currency: string;
  data: Movement[];
}

const ACTION_BY_TYPE: Record<string, string> = {
  Gasto: 'Gastado neto',
  Devolución: 'Devuelto',
  Ingreso: 'Ingresado',
  Nómina: 'Ingresado',
  Apuestas: 'Apostado',
  Apuestas_r: 'Cobrado',
  Inversión: 'Invertido',
  Inversión_r: 'Devuelto',
  Transferencia: 'Transferido',
  'Saldo Inicial': 'Inicial',
};

function localToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-ES');
}

export function MovementTotalPanel({ account, kind, currency, data }: Props) {
  const types = useMemo(() => [...new Set([...TIPOS_POR_KIND[kind], ...data.map((row) => row.Tipo)])], [data, kind]);
  const [type, setType] = useState(types[0] ?? '');
  const [concept, setConcept] = useState('');
  const [subconcept, setSubconcept] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(localToday);
  const subconcepts = type === 'Gasto' && concept.trim()
    ? [...new Set(data
      .filter((row) => (row.Tipo === 'Gasto' || row.Tipo === 'Devolución') && row.Concepto === concept.trim())
      .map((row) => row.Subconcepto ?? null))]
    : [];

  useEffect(() => {
    setType(types[0] ?? '');
    setConcept('');
    setSubconcept('');
    setFrom('');
    setTo(localToday());
  }, [account, kind]);

  const total = useMemo(() => data
    .filter((row) => (row.Tipo === type || (type === 'Gasto' && row.Tipo === 'Devolución')) && row.Concepto === concept.trim())
    .filter((row) => type !== 'Gasto' || !subconcept || (subconcept === '__without__' ? !row.Subconcepto : row.Subconcepto === subconcept))
    .filter((row) => !from || row.Fecha.slice(0, 10) >= from)
    .filter((row) => !to || row.Fecha.slice(0, 10) <= to)
    .reduce((sum, row) => sum + (type === 'Gasto' ? expenseAmount(row) : Number(row.Total || 0)), 0), [concept, data, from, subconcept, to, type]);

  const action = ACTION_BY_TYPE[type] ?? displayTipo(type).toLocaleLowerCase('es');
  const hasResult = Boolean(type && concept.trim());
  const dateRange = `desde ${from ? formatDate(from) : 'siempre'} hasta ${!to || to === localToday() ? 'hoy' : formatDate(to)}`;

  return (
    <section className="section section-raised movement-total" aria-label="Total por tipo y concepto">
      <div className="section-head movement-total-head">
        <div>
          <span className="section-title">Total por tipo y concepto</span>
          <p>Calcula el total de esta cuenta para un concepto y un periodo. Gasto descuenta las devoluciones.</p>
        </div>
      </div>
      <div className="movement-total-controls">
        <label>
          <span>Tipo</span>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {types.map((item) => <option key={item} value={item}>{displayTipo(item)}</option>)}
          </select>
        </label>
        <label className="movement-total-concept">
          <span>Concepto</span>
          <ConceptAutocomplete
            value={concept}
            onChange={(value) => {
              setConcept(value);
              setSubconcept('');
            }}
            suggestions={(query) => rankConcepts(conceptCandidatesForSearch(data, type), query)}
            placeholder="Busca un concepto…"
          />
        </label>
        {type === 'Gasto' && <label>
          <span>Subconcepto</span>
          <select value={subconcept} onChange={(event) => setSubconcept(event.target.value)} disabled={!concept.trim()}>
            <option value="">Todos</option>
            {subconcepts.map((item) => (
              <option key={item ?? '__without__'} value={item ?? '__without__'}>{item ?? 'Otros'}</option>
            ))}
          </select>
        </label>}
        <label>
          <span>Desde · {from ? formatDate(from) : 'Siempre'}</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          <span>Hasta · {!to || to === localToday() ? 'Hoy' : formatDate(to)}</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>
      <div className="movement-total-result" aria-live="polite">
        {hasResult ? (
          <><span>Total {action.toLocaleLowerCase('es')} en {concept.trim()} · {dateRange}</span><strong>{money(total, currency)}</strong></>
        ) : (
          <span>Selecciona un concepto para calcular su total.</span>
        )}
      </div>
    </section>
  );
}
