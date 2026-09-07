import type { InvestmentKpis, KpiPeriod } from '../../api/types';
import { money } from '../../lib/format';
import { kpiLabel } from './kpiLabel';
import { KpiDelta } from './KpiDelta';

interface Props {
  kpi: InvestmentKpis;
  period: KpiPeriod;
  currency: string;
}

// Todos los KPIs se muestran en la divisa nativa de la cuenta (money()) --
// una cuenta no mezcla divisas internamente (ver docs/ARCHITECTURE.md §0).
// Aportado/P&L cerrado ya no fuerzan EUR: las transferencias entre cuentas
// y el histórico de Cartera 1 se convierten a la divisa de la cuenta al
// registrarse (TransferBetweenAccountsUseCase, scripts/backfill_exchange_rates.py).
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
        <div className={`kpi-value ${kpi.aportado >= 0 ? 'pos' : 'neg'}`}>{money(kpi.aportado, currency)}</div>
        <KpiDelta delta={kpi.aportadoDelta} currency={currency} />
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
        <div className={`kpi-value ${kpi.pnl >= 0 ? 'pos' : 'neg'}`}>{money(kpi.pnl, currency)}</div>
        <KpiDelta delta={kpi.pnlDelta} currency={currency} />
      </div>
    </>
  );
}
