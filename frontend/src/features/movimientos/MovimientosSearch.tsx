import { useId } from 'react';
import type { AccountKind, Movement } from '../../api/types';
import { displayTipo, TIPOS_POR_KIND } from '../../domain/tipos';
import { conceptCandidatesForSearch, rankConcepts, subconceptCandidatesForSearch } from './autocomplete';
import { ConceptAutocomplete } from './ConceptAutocomplete';
import { EMPTY_SEARCH, type MovSearch } from './search';

interface Props {
  kind: AccountKind;
  data: Movement[];
  search: MovSearch;
  onChange: (search: MovSearch) => void;
}

export function MovimientosSearch({ kind, data, search, onChange }: Props) {
  const id = useId();
  const conceptIsDefined = data.some((movement) =>
    (!search.tipo || movement.Tipo === search.tipo)
    && movement.Concepto.toLocaleLowerCase() === search.concepto.trim().toLocaleLowerCase(),
  );

  return (
    <div className="mov-search">
      <div className="mov-search-field">
        <label htmlFor={`${id}-type`}>Tipo</label>
        <select id={`${id}-type`} value={search.tipo} onChange={(e) => onChange({ ...search, tipo: e.target.value, concepto: '', subconcepto: '' })}>
          <option value="">Todos los tipos</option>
          {TIPOS_POR_KIND[kind].map((t) => (
            <option key={t} value={t}>
              {displayTipo(t)}
            </option>
          ))}
        </select>
      </div>
      <div className="mov-search-field">
        <label htmlFor={`${id}-concept`}>Concepto</label>
        <ConceptAutocomplete
          id={`${id}-concept`}
          value={search.concepto}
          onChange={(v) => onChange({ ...search, concepto: v, subconcepto: '' })}
          suggestions={(q) => rankConcepts(conceptCandidatesForSearch(data, search.tipo), q)}
          placeholder="Concepto…"
        />
      </div>
      {conceptIsDefined && (
        <div className="mov-search-field">
          <label htmlFor={`${id}-subconcept`}>Subconcepto</label>
          <ConceptAutocomplete
            id={`${id}-subconcept`}
            value={search.subconcepto}
            onChange={(v) => onChange({ ...search, subconcepto: v })}
            suggestions={(q) => rankConcepts(
              subconceptCandidatesForSearch(data, search.tipo, search.concepto), q,
            )}
            placeholder="Subconcepto…"
          />
        </div>
      )}
      <div className="mov-search-field">
        <label htmlFor={`${id}-amount`}>Importe exacto</label>
        <input
          id={`${id}-amount`}
          type="text"
          inputMode="decimal"
          aria-label="Importe exacto"
          placeholder="Importe exacto…"
          value={search.importe}
          onChange={(e) => onChange({ ...search, importe: e.target.value })}
        />
      </div>
      <div className="mov-search-field">
        <label htmlFor={`${id}-date`}>Fecha</label>
        <input
          id={`${id}-date`}
          type="date"
          className="date-input"
          title="Filtrar por fecha"
          value={search.fecha}
          onChange={(e) => onChange({ ...search, fecha: e.target.value })}
        />
      </div>
      <button type="button" className="fbtn" onClick={() => onChange(EMPTY_SEARCH)}>
        Limpiar
      </button>
    </div>
  );
}
