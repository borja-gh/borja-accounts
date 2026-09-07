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
    // El vanilla nunca distinguió divisa por cuenta (siempre € fijo); ahora
    // que MovimientosTable usa money(v, currency) (ver MovimientosTable.tsx),
    // los importes de una cuenta USD se muestran en $ -- se transforma el
    // símbolo en el expected, los montos numéricos no cambian.
    const expected = expectedValues.investment1_movimientos_default.map((s: string) => s.replace(/€/g, '$'));
    expect(extractVisibleText(container)).toEqual(expected);
  });
});
