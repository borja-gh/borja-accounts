import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backendFixture, expectedValues } from '../../test/goldenMaster';
import { extractVisibleText } from '../../test/extractVisibleText';
import { MovimientosTable } from './MovimientosTable';
import { EMPTY_SEARCH, searchedMovs } from './search';
import type { Movement } from '../../api/types';

const noop = () => {};

// El vanilla (index.html) ordenaba los empates de misma Fecha por orden de
// inserción ascendente (sort estable sobre una clave que no incluye hora).
// searchedMovs() ahora rompe esos empates por _idx descendente -- el
// movimiento insertado más tarde ese día aparece arriba, coherente con
// "más reciente primero" -- así que dos filas del 05/07/2026 (Supermercado/
// Restaurante) se ven en orden invertido respecto al snapshot congelado.
function swapAdjacentRows(expected: string[], anchor: string, rowLen: number): string[] {
  const anchorIdx = expected.indexOf(anchor);
  const rowStart = anchorIdx - 2; // Fecha, Tipo, <anchor=Concepto>, ...
  const result = [...expected];
  const rowA = result.splice(rowStart, rowLen);
  const rowB = result.splice(rowStart, rowLen);
  result.splice(rowStart, 0, ...rowB, ...rowA);
  return result;
}

describe('MovimientosTable', () => {
  it('coincide con el golden master para cash1 salvo el reorden de empates de fecha', () => {
    const data: Movement[] = backendFixture.initial_data_cash1;
    const rows = searchedMovs(data, EMPTY_SEARCH);
    const { container } = render(
      <MovimientosTable rows={rows} currency="EUR" onFilterByConcept={noop} onDuplicate={noop} onEdit={noop} />,
    );
    const expected = swapAdjacentRows(expectedValues.cash1_movimientos_default, 'Supermercado', 7);
    expect(extractVisibleText(container)).toEqual(expected);
  });

  it('coincide con el golden master para investment1', () => {
    const data: Movement[] = backendFixture.initial_data_investment1;
    const rows = searchedMovs(data, EMPTY_SEARCH);
    const { container } = render(
      <MovimientosTable rows={rows} currency="USD" onFilterByConcept={noop} onDuplicate={noop} onEdit={noop} />,
    );
    // Ya no es una transformación ligera del fixture congelado del vanilla:
    // build_investment_ledger (get_investment_kpis.py) ahora fusiona el
    // histórico con una fila "Inversión" por cartera de holdings ("Cartera
    // Prueba" aquí, ver tests/scenario.py), sin _idx real (no editable) y
    // sin signo (Inversión no mueve el saldo al abrir, ver ledger.py) --
    // esto desplaza todos los saldos posteriores respecto al vanilla.
    const expected = [
      'Fecha', 'Tipo', 'Concepto', 'Importe', 'Saldo',
      '02/07/2026', 'Ingreso', 'Dividendo', '+15.00$', '1355.00$', 'Duplicar', 'Editar',
      '25/06/2026', 'Ingreso', 'Desde OPENBANK', '+400.00$', '1340.00$', 'Duplicar', 'Editar',
      '08/06/2026', 'Retorno inv.', 'Cartera Bonos', '+150.00$', '940.00$', 'Duplicar', 'Editar',
      '01/06/2026', 'Retorno inv.', 'Cartera Prueba · MSFT #2', '+900.00$', '990.00$', 'Duplicar', 'Editar',
      '10/05/2026', 'Retorno inv.', 'Cartera Tech', '+400.00$', '1090.00$', 'Duplicar', 'Editar',
      '01/05/2026', 'Inversión', 'Cartera Prueba · MSFT #2', '1000.00$', '990.00$', 'Duplicar', 'Editar',
      '01/05/2026', 'Inversión', 'Cartera Prueba', '1000.00$', '990.00$',
      '12/04/2026', 'Inversión', 'Cartera Global', '250.00$', '990.00$', 'Duplicar', 'Editar',
      '01/03/2026', 'Gasto', 'Comisión custodia', '-10.00$', '990.00$', 'Duplicar', 'Editar',
      '05/02/2026', 'Inversión', 'Cartera Bonos', '200.00$', '1000.00$', 'Duplicar', 'Editar',
      '10/01/2026', 'Inversión', 'Cartera Tech', '300.00$', '1000.00$', 'Duplicar', 'Editar',
      '01/01/2026', 'Saldo Inicial', 'Apertura de cuenta', '+1000.00$', '1000.00$',
    ];
    expect(extractVisibleText(container)).toEqual(expected);
  });
});
