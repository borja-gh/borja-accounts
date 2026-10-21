import type { Movement } from '../../api/types';
import { MonthRangeChip } from './MonthRangeChip';
import { rangeOptions } from './rangeOptions';
import type { RangeFilter } from './RangeFilter';

interface Props {
  data: Movement[];
  filter: RangeFilter;
  onChange: (filter: RangeFilter) => void;
  allLabel?: string;
  oneMonthLabel?: string;
  historicalAndCurrentMonthOnly?: boolean;
}

// Cada instancia controla el rango de su propio grupo de paneles.
export function RangeFilterBar({
  data,
  filter,
  onChange,
  allLabel = 'Todo',
  oneMonthLabel = 'Mes',
  historicalAndCurrentMonthOnly = false,
}: Props) {
  const options = historicalAndCurrentMonthOnly
    ? [{ label: allLabel, type: 'all' as const }, { label: oneMonthLabel, type: '1m' as const }]
    : rangeOptions(data);

  return (
    <div className="filter-bar">
      {options.map((opt) => {
        const active = filter.type === opt.type && (opt.year === undefined || opt.year === filter.year);
        return (
          <button
            key={`${opt.type}-${opt.year ?? ''}`}
            className={`fbtn ${active ? 'active' : ''}`}
            onClick={() => onChange(opt.year !== undefined ? { type: opt.type, year: opt.year } : { type: opt.type })}
          >
            {opt.label}
          </button>
        );
      })}
      {!historicalAndCurrentMonthOnly && (
        <MonthRangeChip
          key={filter.type}
          active={filter.type === 'custom'}
          fromYm={filter.fromYm}
          toYm={filter.toYm}
          onApply={(fromYm, toYm) => onChange({ type: 'custom', fromYm, toYm })}
        />
      )}
    </div>
  );
}
