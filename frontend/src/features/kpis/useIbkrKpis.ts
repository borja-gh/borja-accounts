import { useCallback, useEffect, useState } from 'react';
import { fetchInvestmentKpis } from '../../api/client';
import type { IbkrKpis, KpiPeriod } from '../../api/types';

export function useIbkrKpis(cuenta: string, period: KpiPeriod) {
  const [kpi, setKpi] = useState<IbkrKpis | null>(null);

  const reload = useCallback(() => {
    fetchInvestmentKpis(cuenta, period).then(setKpi);
  }, [cuenta, period]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { kpi, reload };
}
