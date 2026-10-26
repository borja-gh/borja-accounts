import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MovementTotalPanel } from './MovementTotalPanel';

describe('MovementTotalPanel', () => {
  it('compensa gastos con devoluciones por concepto y fecha conservando el total propio de devoluciones', () => {
    const data = [
      { Fecha: '2026-09-05', Tipo: 'Gasto', Total: 100, Subconcepto: 'Cena' },
      { Fecha: '2026-10-05', Tipo: 'Devolución', Total: 60, Subconcepto: 'Cena' },
      { Fecha: '2026-10-10', Tipo: 'Gasto', Total: 5, Subconcepto: null },
    ].map((row, _idx) => ({ ...row, Concepto: 'Salida', Subconcepto: row.Subconcepto, Saldo: 0, _idx }));
    render(<MovementTotalPanel account="cash" kind="CASH" currency="EUR" data={data} />);
    expect(screen.getByLabelText(/Desde · Siempre/)).toHaveValue('');
    expect(screen.getByLabelText(/Hasta · Hoy/)).toHaveValue(new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0'));
    fireEvent.change(screen.getByPlaceholderText('Busca un concepto…'), { target: { value: 'Salida' } });
    expect(screen.getByText('45,00€')).toBeInTheDocument();
    expect(screen.getByText(/Total gastado neto en Salida · desde siempre hasta hoy/)).toBeInTheDocument();
    expect(screen.getByLabelText('Subconcepto')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Subconcepto'), { target: { value: 'Cena' } });
    expect(screen.getByLabelText('Subconcepto')).toHaveValue('Cena');
    expect(screen.getByText('40,00€')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Subconcepto'), { target: { value: '__without__' } });
    expect(screen.getByText('5,00€')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Subconcepto'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Desde ·/), { target: { value: '2026-10-01' } });
    expect(screen.getByText('-55,00€')).toBeInTheDocument();
    expect(screen.getByText(/desde 1\/10\/2026 hasta hoy/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'Devolución' } });
    expect(screen.getByText('60,00€')).toBeInTheDocument();
  });
});
