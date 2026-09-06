import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backendFixture, expectedValues } from '../../test/goldenMaster';
import { extractVisibleText } from '../../test/extractVisibleText';
import { ApuestasBody } from './ApuestasBody';

describe('ApuestasBody', () => {
  it('coincide con el golden master (rango 3m del fixture) + el nuevo sub-KPI de P&L % sobre cerradas', () => {
    // El vanilla (index.html) nunca tuvo este sub-KPI -- se añadió después
    // del Bloque 5, así que expectedValues.cash1_apuestas_body (extraído del
    // vanilla congelado) no puede reflejarlo. Se inserta aquí, calculado
    // desde el propio report, en la posición exacta donde aparece en el DOM.
    const report = backendFixture.cash1_apuestas_report_3m;
    const { container } = render(<ApuestasBody report={report} onClosePosition={() => {}} />);
    const expected = [...expectedValues.cash1_apuestas_body];
    expected.splice(5, 0, `${report.totalPnLPct.toFixed(2)}% sobre cerradas`);
    expect(extractVisibleText(container)).toEqual(expected);
  });
});
