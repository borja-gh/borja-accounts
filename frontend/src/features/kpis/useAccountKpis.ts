import { useCallback, useEffect, useState } from 'react';
import { fetchAccountKpis } from '../../api/client';
import type { AccountKpis, KpiPeriodFilter } from '../../api/types';

export function useAccountKpis(cuenta: string, period: KpiPeriodFilter) {
  const [kpi, setKpi] = useState<AccountKpis | null>(null);

  const reload = useCallback(() => {
    fetchAccountKpis(cuenta, period).then(setKpi);
  }, [cuenta, period]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { kpi, reload };
}
