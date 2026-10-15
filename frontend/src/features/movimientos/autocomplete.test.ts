import { describe, expect, it } from 'vitest';
import type { Movement } from '../../api/types';
import {
  candidatesForSubconcept,
  candidatesForTipo,
  subconceptCandidatesForSearch,
  suggestNextApuestaSubconcept,
} from './autocomplete';

const rows: Movement[] = [
  { Fecha: '2026-01-01', Tipo: 'Gasto', Concepto: 'Concierto', Subconcepto: 'Artista A', Total: 10, Saldo: 90, _idx: 0 },
  { Fecha: '2026-02-01', Tipo: 'Gasto', Concepto: 'Concierto', Subconcepto: 'Artista A', Total: 15, Saldo: 75, _idx: 1 },
  { Fecha: '2026-02-02', Tipo: 'Gasto', Concepto: 'Concierto', Subconcepto: 'Artista B', Total: 20, Saldo: 55, _idx: 2 },
  { Fecha: '2026-02-03', Tipo: 'Gasto', Concepto: 'Restaurante', Subconcepto: 'Artista C', Total: 20, Saldo: 35, _idx: 3 },
  { Fecha: '2026-02-04', Tipo: 'Gasto', Concepto: 'Concierto', Subconcepto: null, Total: 20, Saldo: 15, _idx: 4 },
  { Fecha: '2026-02-05', Tipo: 'Ingreso', Concepto: 'Concierto', Subconcepto: 'No gasto', Total: 30, Saldo: 45, _idx: 5 },
];

describe('candidatesForSubconcept', () => {
  it('sugiere subconceptos usados solo dentro del concepto padre seleccionado', () => {
    expect(candidatesForSubconcept(rows, 'Concierto', null, 'Gasto').map(({ concepto, count }) => [concepto, count]))
      .toEqual([['Artista A', 2], ['Artista B', 1]]);
  });

  it('excluye el movimiento editado para no sugerir su propio subconcepto', () => {
    expect(candidatesForSubconcept(rows, 'Concierto', 0, 'Gasto').map(({ concepto, count }) => [concepto, count]))
      .toEqual([['Artista A', 1], ['Artista B', 1]]);
  });

  it('sugiere subconceptos del gasto original al registrar una devolución', () => {
    expect(candidatesForSubconcept(rows, 'Concierto', null, 'Devolución').map(({ concepto }) => concepto))
      .toEqual(['Artista A', 'Artista B']);
  });

  it('empareja apuestas y cobros por concepto y subconcepto', () => {
    const bets: Movement[] = [
      { Fecha: '2026-01-01', Tipo: 'Apuestas', Concepto: 'B365', Subconcepto: '1', Total: 50, Saldo: 50, _idx: 0 },
      { Fecha: '2026-01-02', Tipo: 'Apuestas', Concepto: 'B365', Subconcepto: '2', Total: 50, Saldo: 0, _idx: 1 },
      { Fecha: '2026-01-03', Tipo: 'Apuestas_r', Concepto: 'B365', Subconcepto: '1', Total: 80, Saldo: 80, _idx: 2 },
    ];
    expect(candidatesForTipo(bets, 'Apuestas_r', null).map(({ concepto }) => concepto)).toEqual(['B365']);
    expect(candidatesForSubconcept(bets, 'B365', null, 'Apuestas_r').map(({ concepto }) => concepto)).toEqual(['2']);
    expect(candidatesForSubconcept(bets, 'B365', 2, 'Apuestas_r').map(({ concepto }) => concepto)).toEqual(['1', '2']);
    expect(suggestNextApuestaSubconcept(bets, 'B365')?.concepto).toBe('3');
  });

  it('sugiere subconceptos de todos los tipos y puede limitar por tipo', () => {
    expect(subconceptCandidatesForSearch(rows, '', 'Concierto').map(({ concepto }) => concepto))
      .toEqual(['Artista A', 'Artista B', 'No gasto']);
    expect(subconceptCandidatesForSearch(rows, 'Ingreso', 'Concierto').map(({ concepto }) => concepto))
      .toEqual(['No gasto']);
    expect(subconceptCandidatesForSearch(rows, '', 'Otro concepto')).toEqual([]);
  });
});
