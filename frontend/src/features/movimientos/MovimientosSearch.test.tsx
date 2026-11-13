import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Movement } from '../../api/types';
import { MovimientosSearch } from './MovimientosSearch';
import { EMPTY_SEARCH } from './search';
import { MovimientosSection } from './MovimientosSection';
import { ToastProvider } from '../../components/ToastContext';

const rows: Movement[] = [
  { Fecha: '2026-01-01', Tipo: 'Gasto', Concepto: 'Concierto', Subconcepto: 'Artista A', Total: 10, Saldo: 90, _idx: 0 },
  { Fecha: '2026-01-02', Tipo: 'Gasto', Concepto: 'Concierto', Subconcepto: 'Artista B', Total: 15, Saldo: 75, _idx: 1 },
  { Fecha: '2026-01-03', Tipo: 'Gasto', Concepto: 'Restaurante', Subconcepto: 'Artista C', Total: 20, Saldo: 55, _idx: 2 },
];

describe('MovimientosSearch', () => {
  it('la vista de inversión permite añadir y duplicar movimientos sin mostrar totales', () => {
    render(
      <ToastProvider>
        <MovimientosSection account="investment" kind="INVESTMENT" currency="EUR" data={rows}
          visiblePanels={['add_movement', 'movement_total']} onDataChanged={vi.fn()} />
      </ToastProvider>,
    );
    expect(screen.getByText('Añadir movimiento')).toBeInTheDocument();
    expect(screen.queryByText('Total por tipo y concepto')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Duplicar' })).toHaveLength(rows.length);
    expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(rows.length);
  });
  it.each(['15,00', '15.00'])('busca gastos por importe %s y limpia el filtro', (amount) => {
    render(
      <ToastProvider>
        <MovimientosSection
          account="cash1" kind="CASH" currency="EUR" data={rows}
          visiblePanels={[]} onDataChanged={vi.fn()}
        />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Gasto' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Importe exacto' }), { target: { value: amount } });

    expect(screen.getByText('1 resultado(s)')).toBeInTheDocument();
    expect(screen.getByText('Artista B')).toBeInTheDocument();
    expect(screen.queryByText('Artista A')).not.toBeInTheDocument();
    expect(screen.queryByText('Artista C')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(screen.getByRole('textbox', { name: 'Importe exacto' })).toHaveValue('');
    expect(screen.getByText('Últimos 20')).toBeInTheDocument();
    expect(screen.getByText('Artista A')).toBeInTheDocument();
    expect(screen.getByText('Artista C')).toBeInTheDocument();
  });

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
