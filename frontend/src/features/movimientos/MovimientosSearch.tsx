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
  const conceptIsDefined = data.some((movement) =>
    (!search.tipo || movement.Tipo === search.tipo)
    && movement.Concepto.toLocaleLowerCase() === search.concepto.trim().toLocaleLowerCase(),
  );

  return (
    <div className="mov-search">
      <select value={search.tipo} onChange={(e) => onChange({ ...search, tipo: e.target.value, concepto: '', subconcepto: '' })}>
        <option value="">Todos los tipos</option>
        {TIPOS_POR_KIND[kind].map((t) => (
          <option key={t} value={t}>
            {displayTipo(t)}
          </option>
        ))}
      </select>
      <ConceptAutocomplete
        value={search.concepto}
        onChange={(v) => onChange({ ...search, concepto: v, subconcepto: '' })}
        suggestions={(q) => rankConcepts(conceptCandidatesForSearch(data, search.tipo), q)}
        placeholder="Concepto…"
      />
      {conceptIsDefined && (
        <ConceptAutocomplete
          value={search.subconcepto}
          onChange={(v) => onChange({ ...search, subconcepto: v })}
          suggestions={(q) => rankConcepts(
            subconceptCandidatesForSearch(data, search.tipo, search.concepto), q,
          )}
          placeholder="Subconcepto…"
        />
      )}
      <input
        type="date"
        className="date-input"
        title="Filtrar por fecha"
        value={search.fecha}
        onChange={(e) => onChange({ ...search, fecha: e.target.value })}
      />
      <button type="button" className="fbtn" onClick={() => onChange(EMPTY_SEARCH)}>
        Limpiar
      </button>
    </div>
  );
}
