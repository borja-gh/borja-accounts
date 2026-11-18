import { useEffect, useState } from 'react';
import { fetchConsolidatedKpis } from '../../api/client';
import type { ConsolidatedKpis, KpiPeriodFilter } from '../../api/types';

export function useConsolidatedKpis(period: KpiPeriodFilter, currency: string): ConsolidatedKpis | null {
  const [kpi, setKpi] = useState<ConsolidatedKpis | null>(null);

  useEffect(() => {
    let active = true;
    fetchConsolidatedKpis(period, currency)
      .then((result) => {
        if (active) setKpi(result && typeof result.ingresos === 'number' ? result : null);
      })
      .catch(() => {
        if (active) setKpi(null);
      });
    return () => {
      active = false;
    };
  }, [period, currency]);

  return kpi;
}
