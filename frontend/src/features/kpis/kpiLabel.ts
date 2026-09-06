import type { KpiPeriod, KpiPeriodFilter } from '../../api/types';
import { monthLabel } from '../filters/monthLabel';

export function kpiLabel(period: KpiPeriod | KpiPeriodFilter): string {
  const type = typeof period === 'string' ? period : period.type;
  if (type === 'custom' && typeof period !== 'string' && period.fromYm && period.toYm) {
    return `${monthLabel(period.fromYm)} — ${monthLabel(period.toYm)}`;
  }
  if (type === 'trimestre') return 'últimos 3 meses';
  if (type === 'año') return 'este año';
  return 'este mes';
}
