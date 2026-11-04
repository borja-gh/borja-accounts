import type { Movement } from '../../api/types';
import { parseDecimal } from '../../lib/math';

export interface MovSearch {
  tipo: string;
  concepto: string;
  subconcepto: string;
  fecha: string;
  importe: string;
}

export const EMPTY_SEARCH: MovSearch = { tipo: '', concepto: '', subconcepto: '', fecha: '', importe: '' };

export function isSearchActive(search: MovSearch): boolean {
  return !!(search.tipo || search.concepto || search.subconcepto || search.fecha || search.importe.trim());
}

export function searchedMovs(rows: Movement[], search: MovSearch): Movement[] {
  let res = rows;
  if (search.tipo) res = res.filter((r) => r.Tipo === search.tipo);
  if (search.concepto) {
    const q = search.concepto.toLowerCase();
    res = res.filter((r) => r.Concepto.toLowerCase().includes(q));
  }
  if (search.subconcepto) {
    const q = search.subconcepto.toLowerCase();
    res = res.filter((r) => r.Subconcepto?.toLowerCase().includes(q));
  }
  if (search.fecha) res = res.filter((r) => r.Fecha.slice(0, 10) === search.fecha);
  if (search.importe.trim()) {
    const amount = parseDecimal(search.importe);
    res = res.filter((r) => r.Total === amount);
  }
  // _idx rompe empates con timestamps iguales según el orden persistido.
  res = [...res].sort((a, b) => b.Fecha.localeCompare(a.Fecha) || (b._idx ?? 0) - (a._idx ?? 0));
  return isSearchActive(search) ? res.slice(0, 500) : res.slice(0, 20);
}
