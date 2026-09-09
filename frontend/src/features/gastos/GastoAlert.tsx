import type { GastoAlert as GastoAlertData } from '../../api/types';
import { money } from '../../lib/format';

export function GastoAlert({ alert, currency = 'EUR' }: { alert: GastoAlertData | null; currency?: string }) {
  if (!alert) return null;
  if (!alert.isWarning) {
    return (
      <div className="soft-alert ok">
        {`Gastos este mes ${money(alert.curTotal, currency)} · ${Math.abs(alert.pct).toFixed(0)}% por debajo de la media de los ${alert.monthsCount} meses anteriores (${money(alert.avg, currency)})`}
      </div>
    );
  }
  return (
    <div className="soft-alert warn">
      {`Gastos este mes ${money(alert.curTotal, currency)} · ${alert.pct.toFixed(0)}% por encima de la media de los ${alert.monthsCount} meses anteriores (${money(alert.avg, currency)})`}
    </div>
  );
}
