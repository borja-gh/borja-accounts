import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Movement } from '../../api/types';
import { MovimientosSearch } from './MovimientosSearch';
import { EMPTY_SEARCH } from './search';

const rows: Movement[] = [
  { Fecha: '2026-01-01', Tipo: 'Gasto', Concepto: 'Concierto', Subconcepto: 'Artista A', Total: 10, Saldo: 90, _idx: 0 },
  { Fecha: '2026-01-02', Tipo: 'Gasto', Concepto: 'Concierto', Subconcepto: 'Artista B', Total: 15, Saldo: 75, _idx: 1 },
  { Fecha: '2026-01-03', Tipo: 'Gasto', Concepto: 'Restaurante', Subconcepto: 'Artista C', Total: 20, Saldo: 55, _idx: 2 },
];

describe('MovimientosSearch', () => {
  it('muestra el filtro de subconcepto solo al definir un concepto y lo acota a ese concepto', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MovimientosSearch kind="CASH" data={rows} search={EMPTY_SEARCH} onChange={onChange} />,
    );

    expect(screen.queryByPlaceholderText('Subconcepto…')).not.toBeInTheDocument();
    rerender(
      <MovimientosSearch
        kind="CASH"
        data={rows}
        search={{ ...EMPTY_SEARCH, concepto: 'Concierto' }}
        onChange={onChange}
      />,
    );

    const subconcept = screen.getByPlaceholderText('Subconcepto…');
    fireEvent.focus(subconcept);
    expect(screen.getByText('Artista A')).toBeInTheDocument();
    expect(screen.getByText('Artista B')).toBeInTheDocument();
    expect(screen.queryByText('Artista C')).not.toBeInTheDocument();
  });
});
