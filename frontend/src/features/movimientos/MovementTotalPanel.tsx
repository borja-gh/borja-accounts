import { useEffect, useMemo, useState } from 'react';
import type { AccountId, AccountKind, Movement } from '../../api/types';
import { TIPOS_POR_KIND, displayTipo } from '../../domain/tipos';
import { money } from '../../lib/format';
import { conceptCandidatesForSearch, rankConcepts } from './autocomplete';
import { ConceptAutocomplete } from './ConceptAutocomplete';

interface Props {
  account: AccountId;
  kind: AccountKind;
  currency: string;
  data: Movement[];
}

const ACTION_BY_TYPE: Record<string, string> = {
  Gasto: 'Gastado',
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

export function MovementTotalPanel({ account, kind, currency, data }: Props) {
  const types = useMemo(() => [...new Set([...TIPOS_POR_KIND[kind], ...data.map((row) => row.Tipo)])], [data, kind]);
  const [type, setType] = useState(types[0] ?? '');
  const [concept, setConcept] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    setType(types[0] ?? '');
    setConcept('');
    setFrom('');
    setTo('');
  }, [account, kind]);

  const total = useMemo(() => data
    .filter((row) => row.Tipo === type && row.Concepto === concept.trim())
    .filter((row) => !from || row.Fecha.slice(0, 10) >= from)
    .filter((row) => !to || row.Fecha.slice(0, 10) <= to)
    .reduce((sum, row) => sum + Number(row.Total || 0), 0), [concept, data, from, to, type]);

  const action = ACTION_BY_TYPE[type] ?? displayTipo(type).toLocaleLowerCase('es');
  const hasResult = Boolean(type && concept.trim());

  return (
    <section className="movement-total" aria-label="Total por tipo y concepto">
      <div className="movement-total-head">
        <div>
          <strong>Total por tipo y concepto</strong>
          <p>Calcula el total de esta cuenta para un concepto y un periodo.</p>
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
            onChange={setConcept}
            suggestions={(query) => rankConcepts(conceptCandidatesForSearch(data, type), query)}
            placeholder="Busca un concepto…"
          />
        </label>
        <label>
          <span>Desde</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          <span>Hasta</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>
      <div className="movement-total-result" aria-live="polite">
        {hasResult ? (
          <><span>Total {action.toLocaleLowerCase('es')} en {concept.trim()}</span><strong>{money(total, currency)}</strong></>
        ) : (
          <span>Selecciona un concepto para calcular su total.</span>
        )}
      </div>
    </section>
  );
}
