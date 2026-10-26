import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backendFixture, expectedValues } from '../../test/goldenMaster';
import { extractVisibleText } from '../../test/extractVisibleText';
import { GastoAlert } from './GastoAlert';

describe('GastoAlert', () => {
  it('muestra el neto negativo y evita porcentajes frente a una media no positiva', () => {
    render(<GastoAlert alert={{ curTotal: -60, avg: -20, pct: null, monthsCount: 2, isWarning: false }} />);
    expect(screen.getByText(/Gastos este mes/)).toHaveTextContent('-60,00€');
    expect(screen.getByText(/Gastos este mes/)).toHaveTextContent('-20,00€');
    expect(screen.getByText(/Gastos este mes/)).not.toHaveTextContent('%');
  });
  it('coincide con el golden master', () => {
    const alert = backendFixture.cash1_gastos_mes_actual.alert;
    const { container } = render(<GastoAlert alert={alert} />);
    expect(extractVisibleText(container)).toEqual(expectedValues.cash1_gasto_alert);
  });
});
