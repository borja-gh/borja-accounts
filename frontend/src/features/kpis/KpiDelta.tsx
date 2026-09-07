import type { Delta } from '../../api/types';
import { money } from '../../lib/format';

interface Props {
  delta: Delta;
  currency: string;
  inverse?: boolean;
}

export function KpiDelta({ delta, currency, inverse = false }: Props) {
  const goodDir = inverse ? delta.diff <= 0 : delta.diff >= 0;
  if (delta.diff === 0) {
    return <div className="kpi-delta neu">= igual al período anterior</div>;
  }
  const cls = goodDir ? 'pos' : 'neg';
  const arrow = delta.diff > 0 ? '↑' : '↓';
  const sign = delta.diff > 0 ? '+' : '';
  return <div className={`kpi-delta ${cls}`}>{`${arrow} ${sign}${money(delta.diff, currency)} vs ant.`}</div>;
}
