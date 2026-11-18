import { useState } from 'react';
import type { Delta, KpiPeriodFilter } from '../api/types';
import { KpiDelta } from '../features/kpis/KpiDelta';
import { PeriodSelector } from '../features/kpis/PeriodSelector';
import { useConsolidatedKpis } from '../features/kpis/useConsolidatedKpis';
import { money } from '../lib/format';

type Currency = 'EUR' | 'USD';

function Metric({ label, value, delta, currency, inverse, className, title }: {
  label: string;
  value: number;
  delta: Delta;
  currency: string;
  inverse?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <div className="header-consolidated-metric" title={title}>
      <span className="header-consolidated-label">{label}</span>
      <span className={`header-consolidated-value ${className ?? ''}`}>{money(value, currency)}</span>
      <KpiDelta delta={delta} currency={currency} inverse={inverse} />
    </div>
  );
}

export function HeaderConsolidatedKpis() {
  const [period, setPeriod] = useState<KpiPeriodFilter>({ type: 'mes' });
  const [currency, setCurrency] = useState<Currency>('EUR');
  const kpi = useConsolidatedKpis(period, currency);

  return (
    <div className="header-consolidated">
      <PeriodSelector period={period} onChange={setPeriod} allowCustom />
      <select
        aria-label="Divisa del consolidado"
        value={currency}
        onChange={(event) => setCurrency(event.target.value as Currency)}
      >
        <option value="EUR">EUR</option>
        <option value="USD">USD</option>
      </select>
      {kpi ? (
        <div className="header-consolidated-metrics">
          <Metric
            label="Ingresos"
            value={kpi.ingresos}
            delta={kpi.ingresosDelta}
            currency={kpi.currency}
            className="pos"
            title={`Cash ${money(kpi.ingresosCash, kpi.currency)} · PnL inversión ${money(kpi.ingresosPnl, kpi.currency)}`}
          />
          <Metric label="Gastos" value={kpi.gastos} delta={kpi.gastosDelta} currency={kpi.currency} inverse className="neg" />
          <Metric
            label="Balance"
            value={kpi.balance}
            delta={kpi.balanceDelta}
            currency={kpi.currency}
            className={kpi.balance >= 0 ? 'pos' : 'neg'}
          />
        </div>
      ) : (
        <span className="header-consolidated-empty">—</span>
      )}
    </div>
  );
}
