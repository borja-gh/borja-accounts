import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backendFixture, expectedValues } from '../../test/goldenMaster';
import { extractVisibleText } from '../../test/extractVisibleText';
import { KpiCardsInvestment } from './KpiCardsInvestment';
import type { KpiPeriod } from '../../api/types';

describe('KpiCardsInvestment', () => {
  it.each(['mes', 'trimestre', 'año'] satisfies KpiPeriod[])(
    // Todos los importes reflejan la divisa real de la cuenta (USD) -- el
    // vanilla nunca distinguió divisa por cuenta, siempre € fijo (ver
    // KpiCardsInvestment.tsx).
    'coincide con el golden master para period=%s salvo todos los importes en USD',
    (period) => {
      const kpi = backendFixture.investment1_kpis_by_period[period];
      const { container } = render(<KpiCardsInvestment kpi={kpi} period={period} currency="USD" />);
      // El Saldo ya no es cash_override + en_carteras (doble contaba el
      // capital invertido, que el ledger ya incluye al no restar en
      // "Inversión") -- ahora es el balance del histórico combinado, ver
      // build_investment_ledger. "En carteras" no cambia. "Saldo preventa"
      // es una tarjeta nueva (KpiCardsInvestment.tsx) -- sin holdings con
      // current_price en el fixture, coincide con Saldo.
      const base = expectedValues.investment1_kpis[period]
        .map((s: string) => s.replace(/€/g, '$'))
        .map((s: string, i: number) => (i === 1 ? '1455,00$' : s));
      const expected = [
        ...base.slice(0, 2),
        'Saldo preventa', '1455,00$', 'Con el último precio de mercado consultado',
        ...base.slice(2),
      ];
      expect(extractVisibleText(container)).toEqual(expected);
    },
  );
});
