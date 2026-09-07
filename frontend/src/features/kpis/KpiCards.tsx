import type { AccountKpis, KpiPeriod, KpiPeriodFilter } from '../../api/types';
import { money } from '../../lib/format';
import { kpiLabel } from './kpiLabel';
import { KpiDelta } from './KpiDelta';

interface Props {
  kpi: AccountKpis;
  period: KpiPeriod | KpiPeriodFilter;
  currency: string;
}

export function KpiCards({ kpi, period, currency }: Props) {
  const lbl = kpiLabel(period);
  return (
    <>
      <div className="kpi">
        <div className="kpi-label">Saldo actual</div>
        <div className="kpi-value">{money(kpi.saldo, currency)}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">{`Ingresos · ${lbl}`}</div>
        <div className="kpi-value pos">{money(kpi.ingresos, currency)}</div>
        <KpiDelta delta={kpi.ingresosDelta} currency={currency} />
      </div>
      <div className="kpi">
        <div className="kpi-label">{`Gastos · ${lbl}`}</div>
        <div className="kpi-value neg">{money(kpi.gastos, currency)}</div>
        <KpiDelta delta={kpi.gastosDelta} currency={currency} inverse />
      </div>
      <div className="kpi">
        <div className="kpi-label">{`Balance · ${lbl}`}</div>
        <div className={`kpi-value ${kpi.balance >= 0 ? 'pos' : 'neg'}`}>{money(kpi.balance, currency)}</div>
        <KpiDelta delta={kpi.balanceDelta} currency={currency} />
      </div>
    </>
  );
}
