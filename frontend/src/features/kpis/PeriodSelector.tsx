import type { KpiPeriod, KpiPeriodFilter } from '../../api/types';
import { MonthRangeChip } from '../filters/MonthRangeChip';

const OPTIONS: { value: KpiPeriod; label: string }[] = [
  { value: 'mes', label: 'Mes' },
  { value: 'trimestre', label: 'Trimestre' },
  { value: 'año', label: 'Año' },
];

interface Props {
  period: KpiPeriodFilter;
  onChange: (period: KpiPeriodFilter) => void;
  /** Ofrece el chip "Personalizado" -- solo la vista CASH lo soporta hoy en
   * el backend (compute_kpis rama "custom"); INVESTMENT no lo pasa. */
  allowCustom?: boolean;
}

export function PeriodSelector({ period, onChange, allowCustom }: Props) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`fbtn kpi-period-btn ${period.type === opt.value ? 'active' : ''}`}
          onClick={() => onChange({ type: opt.value })}
        >
          {opt.label}
        </button>
      ))}
      {allowCustom && (
        <MonthRangeChip
          key={period.type}
          active={period.type === 'custom'}
          fromYm={period.fromYm}
          toYm={period.toYm}
          onApply={(fromYm, toYm) => onChange({ type: 'custom', fromYm, toYm })}
        />
      )}
    </div>
  );
}
