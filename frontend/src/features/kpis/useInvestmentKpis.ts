import { useCallback, useEffect, useState } from 'react';
import { fetchInvestmentKpis } from '../../api/client';
import type { InvestmentKpis, KpiPeriod } from '../../api/types';

export function useInvestmentKpis(cuenta: string, period: KpiPeriod) {
  const [kpi, setKpi] = useState<InvestmentKpis | null>(null);

  const reload = useCallback(() => {
    fetchInvestmentKpis(cuenta, period).then(setKpi);
  }, [cuenta, period]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { kpi, reload };
}
