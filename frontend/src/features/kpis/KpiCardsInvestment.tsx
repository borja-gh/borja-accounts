import type { InvestmentKpis, KpiPeriod } from '../../api/types';
import { eur, money } from '../../lib/format';
import { kpiLabel } from './kpiLabel';
import { KpiDelta } from './KpiDelta';

interface Props {
  kpi: InvestmentKpis;
  period: KpiPeriod;
  currency: string;
}

/** "Aportado neto"/"P&L cerrado" se quedan en eur(): son transferencias
 * reales en EUR desde una cuenta CASH y el histórico de Cartera 1 (legado, sin
 * CSV, cerrada antes del cambio de divisa) -- ver docs/ARCHITECTURE.md.
 * Solo Saldo/En carteras reflejan el valor de mercado en la divisa real
 * de la cuenta (USD). */
export function KpiCardsInvestment({ kpi, period, currency }: Props) {
  const lbl = kpiLabel(period);
  return (
    <>
      <div className="kpi">
        <div className="kpi-label">Saldo</div>
        <div className="kpi-value">{money(kpi.saldo, currency)}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">{`Aportado neto · ${lbl}`}</div>
        <div className={`kpi-value ${kpi.aportado >= 0 ? 'pos' : 'neg'}`}>{eur(kpi.aportado)}</div>
        <KpiDelta delta={kpi.aportadoDelta} />
      </div>
      <div className="kpi">
        <div className="kpi-label">En carteras</div>
        <div className="kpi-value">{money(kpi.enCarteras, currency)}</div>
        <div className="kpi-delta neu">
          {kpi.enCarterasCount ? `${kpi.enCarterasCount} abierta${kpi.enCarterasCount !== 1 ? 's' : ''}` : 'ninguna abierta'}
        </div>
      </div>
      <div className="kpi">
        <div className="kpi-label">{`P&L cerrado · ${lbl}`}</div>
        <div className={`kpi-value ${kpi.pnl >= 0 ? 'pos' : 'neg'}`}>{eur(kpi.pnl)}</div>
        <KpiDelta delta={kpi.pnlDelta} />
      </div>
    </>
  );
}
