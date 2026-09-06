export interface RangeFilter {
  type: 'all' | '6m' | '3m' | '1m' | 'year' | 'custom';
  year?: number;
  /** Solo con type: 'custom' -- 'YYYY-MM', ambos inclusive. */
  fromYm?: string;
  toYm?: string;
}

export const DEFAULT_RANGE_FILTER: RangeFilter = { type: 'all' };
