import type { Movement } from '../../api/types';

export interface ConceptStat {
  concepto: string;
  count: number;
  lastFecha: string;
  suggested?: boolean;
}

export function conceptStats(rows: Movement[]): ConceptStat[] {
  const map = new Map<string, ConceptStat>();
  for (const r of rows) {
    if (!r.Concepto || r.Tipo === 'Saldo Inicial') continue;
    let e = map.get(r.Concepto);
    if (!e) {
      e = { concepto: r.Concepto, count: 0, lastFecha: r.Fecha };
      map.set(r.Concepto, e);
    }
    e.count++;
    if (r.Fecha >= e.lastFecha) e.lastFecha = r.Fecha;
  }
  return [...map.values()];
}

export function rankConcepts(stats: ConceptStat[], query: string): ConceptStat[] {
  const q = (query || '').trim().toLowerCase();
  const byFreq = (a: ConceptStat, b: ConceptStat) =>
    b.count - a.count || b.lastFecha.localeCompare(a.lastFecha) || a.concepto.localeCompare(b.concepto, 'es');
  if (!q) return [...stats].sort(byFreq);
  const prefix: ConceptStat[] = [];
  const contains: ConceptStat[] = [];
  for (const s of stats) {
    const low = s.concepto.toLowerCase();
    if (low.startsWith(q)) prefix.push(s);
    else if (low.includes(q)) contains.push(s);
  }
  prefix.sort(byFreq);
  contains.sort(byFreq);
  return [...prefix, ...contains];
}

// Candidatos de concepto para el input de búsqueda (barra de la tabla) --
// se acotan al tipo ya seleccionado en el propio filtro, si lo hay.
export function conceptCandidatesForSearch(data: Movement[], searchTipo: string): ConceptStat[] {
  const rows = searchTipo ? data.filter((r) => r.Tipo === searchTipo) : data;
  return conceptStats(rows);
}

// Candidatos de concepto para el formulario de alta/edición, según el tipo
// de movimiento elegido. Los tipos "_r" (retorno de apuesta/inversión) solo
// sugieren conceptos de posiciones todavía abiertas -- excludeIdx evita que
// una fila en edición se cuente a sí misma como "ya casada".
export function candidatesForTipo(data: Movement[], tipo: string, excludeIdx: number | null): ConceptStat[] {
  if (!tipo) return [];
  if (tipo === 'Apuestas_r') {
    const positionKey = (r: Movement) => `${r.Concepto}\u0000${r.Subconcepto ?? ''}`;
    const casadas = new Set(data.filter((r) => r.Tipo === 'Apuestas_r' && r._idx !== excludeIdx).map(positionKey));
    return conceptStats(data.filter((r) => r.Tipo === 'Apuestas' && !casadas.has(positionKey(r))));
  }
  if (tipo === 'Inversión_r') {
    const persisted = data.filter((r) => r._idx != null);
    const cerradas = new Set(persisted.filter((r) => r.Tipo === 'Inversión_r' && r._idx !== excludeIdx).map((r) => r.Concepto));
    const abiertas = new Set(persisted.filter((r) => r.Tipo === 'Inversión' && !cerradas.has(r.Concepto)).map((r) => r.Concepto));
    return conceptStats(persisted.filter((r) => r.Tipo === 'Inversión' && abiertas.has(r.Concepto)));
  }
  if (tipo === 'Devolución') {
    return conceptStats(data.filter((r) => r.Tipo === 'Gasto'));
  }
  return conceptStats(data.filter((r) => r.Tipo === tipo));
}

export function candidatesForSubconcept(
  data: Movement[], concepto: string, excludeIdx: number | null, tipo: string,
): ConceptStat[] {
  if (!concepto.trim()) return [];
  const sourceType = tipo === 'Apuestas_r' ? 'Apuestas' : tipo === 'Devolución' ? 'Gasto' : tipo;
  let source = data.filter((movement) => movement.Tipo === sourceType && movement.Concepto === concepto.trim());
  if (tipo === 'Apuestas_r') {
    const positionKey = (r: Movement) => `${r.Concepto}\u0000${r.Subconcepto ?? ''}`;
    const casadas = new Set(data.filter((r) => r.Tipo === 'Apuestas_r' && r._idx !== excludeIdx).map(positionKey));
    source = source.filter((movement) => !casadas.has(positionKey(movement)));
  }
  return conceptStats(source.filter((movement) =>
    movement.Subconcepto?.trim()
    && (sourceType !== tipo || excludeIdx == null || movement._idx !== excludeIdx),
  ).map((movement) => ({ ...movement, Concepto: movement.Subconcepto! })));
}

export function subconceptCandidatesForSearch(data: Movement[], searchTipo: string, searchConcepto: string): ConceptStat[] {
  const parent = searchConcepto.trim().toLocaleLowerCase();
  if (!parent) return [];
  const rows = data.filter((movement) =>
    (!searchTipo || movement.Tipo === searchTipo)
    && movement.Concepto.toLocaleLowerCase() === parent
    && movement.Subconcepto?.trim(),
  );
  return conceptStats(rows.map((movement) => ({ ...movement, Concepto: movement.Subconcepto! })));
}

export function suggestNextApuestaSubconcept(data: Movement[], concepto: string): ConceptStat | null {
  const numbers = data
    .filter((r) => r.Tipo === 'Apuestas' && r.Concepto === concepto)
    .filter((r) => r.Subconcepto?.trim())
    .map((r) => Number(r.Subconcepto))
    .filter(Number.isInteger);
  if (!numbers.length) return null;
  const next = String(Math.max(...numbers) + 1);
  return {
    concepto: next,
    count: numbers.length,
    lastFecha: '',
    suggested: true,
  };
}
