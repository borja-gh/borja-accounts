import { describe, expect, it } from 'vitest';
import type { Movement } from '../../api/types';
import { EMPTY_SEARCH, isSearchActive, searchedMovs } from './search';

const rows: Movement[] = [
  { Fecha: '2026-01-01', Tipo: 'Gasto', Concepto: 'Comida', Subconcepto: 'Cena', Total: 12.5, Saldo: 90, _idx: 0 },
  { Fecha: '2026-01-02', Tipo: 'Gasto', Concepto: 'Ocio', Subconcepto: null, Total: 112.5, Saldo: 80, _idx: 1 },
  { Fecha: '2026-01-03', Tipo: 'Gasto', Concepto: 'Comida', Subconcepto: 'Cena', Total: 12.55, Saldo: 70, _idx: 2 },
  { Fecha: '2026-01-04', Tipo: 'Ingreso', Concepto: 'Comida', Subconcepto: 'Cena', Total: 12.5, Saldo: 80, _idx: 3 },
  { Fecha: '2026-01-05', Tipo: 'Apuestas_r', Concepto: 'Liga', Subconcepto: null, Total: 0, Saldo: 80, _idx: 4 },
];

describe('búsqueda por importe', () => {
  it.each(['12,50', '12.50', ' 12,5 '])('compara %s como importe exacto y mantiene el orden', (importe) => {
    expect(searchedMovs(rows, { ...EMPTY_SEARCH, importe }).map((row) => row._idx)).toEqual([3, 0]);
  });

  it('combina importe con tipo, concepto, subconcepto y fecha', () => {
    expect(searchedMovs(rows, {
      tipo: 'Gasto', concepto: 'COMIDA', subconcepto: 'cena', fecha: '2026-01-01', importe: '12,5',
    })).toEqual([rows[0]]);
  });

  it('busca un importe cero como filtro activo', () => {
    const search = { ...EMPTY_SEARCH, importe: '0' };
    expect(isSearchActive(search)).toBe(true);
    expect(searchedMovs(rows, search)).toEqual([rows[4]]);
  });

  it.each(['abc', '12,50abc', '12,5.0'])('no trunca el importe inválido %s', (importe) => {
    expect(searchedMovs(rows, { ...EMPTY_SEARCH, importe })).toEqual([]);
  });

  it('considera vacío un importe con espacios', () => {
    const search = { ...EMPTY_SEARCH, importe: ' ' };
    expect(isSearchActive(search)).toBe(false);
    expect(searchedMovs(rows, search)).toEqual(searchedMovs(rows, EMPTY_SEARCH));
  });

  it('busca en todo el historial antes de aplicar el límite de resultados', () => {
    const history = Array.from({ length: 25 }, (_, index) => ({
      ...rows[0], _idx: index, Fecha: `2026-01-${String(index + 1).padStart(2, '0')}`, Total: index === 0 ? 12.5 : 10,
    }));
    expect(searchedMovs(history, { ...EMPTY_SEARCH, importe: '12,5' })).toEqual([history[0]]);
  });
});
