import type { Movement } from '../../api/types';

// Meses de calendario: 1m = este mes; 3m = mes actual + 2 anteriores; 6m = mes actual + 5 anteriores.
function calendarMonthStart(monthsBack: number): string {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth() - monthsBack, 1);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export interface RangeOption {
  label: string;
  type: 'all' | '6m' | '3m' | '1m' | 'year';
  year?: number;
}

/** Deriva los botones de rango disponibles a partir del histórico de la cuenta. */
export function rangeOptions(allRows: Movement[]): RangeOption[] {
  const c1m = calendarMonthStart(0);
  const c3m = calendarMonthStart(2);
  const c6m = calendarMonthStart(5);
  const has1m = allRows.some((r) => r.Fecha >= c1m);
  const has3m = allRows.some((r) => r.Fecha >= c3m);
  const has6m = allRows.some((r) => r.Fecha >= c6m);
  const years = [...new Set(allRows.map((r) => r.Fecha.slice(0, 4)))].sort();

  const options: RangeOption[] = [{ label: 'Todo', type: 'all' }];
  if (has6m) options.push({ label: '6 meses', type: '6m' });
  if (has3m) options.push({ label: '3 meses', type: '3m' });
  if (has1m) options.push({ label: 'Mes', type: '1m' });
  if (years.length > 1) {
    for (const y of years) options.push({ label: y, type: 'year', year: parseInt(y, 10) });
  } else if (years[0]) {
    options.push({ label: years[0], type: 'year', year: parseInt(years[0], 10) });
  }
  return options;
}
