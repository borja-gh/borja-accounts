import { forwardRef, useImperativeHandle, useState } from 'react';
import { AccountMark } from '../../components/AccountMark';
import { fetchSaldoEvolucion, fetchCarterasRanking } from '../../api/client';
import { KpiCardsIbkr } from '../kpis/KpiCardsIbkr';
import { PeriodSelector } from '../kpis/PeriodSelector';
import { useIbkrKpis } from '../kpis/useIbkrKpis';
import { MovimientosSection } from '../movimientos/MovimientosSection';
import { useAccountData } from '../movimientos/useAccountData';
import { InversionesSection } from '../inversiones/InversionesSection';
import { TransferenciasSection } from '../transferencias/TransferenciasSection';
import { DEFAULT_RANGE_FILTER, type RangeFilter } from '../filters/RangeFilter';
import { RangeFilterBar } from '../filters/RangeFilterBar';
import { useRangeReport } from '../filters/useRangeReport';
import { SaldoChart } from '../charts/SaldoChart';
import { CarterasChart } from '../charts/CarterasChart';
import { RankingModeToggle } from '../charts/RankingModeToggle';
import type { AccountViewHandle } from '../shared/viewHandle';
import type { AccountSummary, KpiPeriod, RankingMode } from '../../api/types';

interface Props {
  account: AccountSummary;
  onDataChanged: () => void;
  onOpenTransferModal: () => void;
}

export const InvestmentAccountView = forwardRef<AccountViewHandle, Props>(function InvestmentAccountView(
  { account, onDataChanged, onOpenTransferModal },
  ref,
) {
  const [period, setPeriod] = useState<KpiPeriod>('mes');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>(DEFAULT_RANGE_FILTER);
  const [carterasMode, setCarterasMode] = useState<RankingMode>('total');
  const [refreshCounter, setRefreshCounter] = useState(0);
  const { kpi, reload: reloadKpis } = useIbkrKpis(account.id, period);
  const { data, reload: reloadData } = useAccountData(account.id);
  const { report: saldoReport, reload: reloadSaldo } = useRangeReport(
    (f) => fetchSaldoEvolucion(account.id, f),
    rangeFilter,
    [account.id],
  );
  const { report: carterasReport, reload: reloadCarterasRanking } = useRangeReport(
    (f) => fetchCarterasRanking(account.id, f, carterasMode),
    rangeFilter,
    [account.id, carterasMode],
  );

  function refreshAll() {
    reloadKpis();
    reloadData();
    reloadSaldo();
    reloadCarterasRanking();
    setRefreshCounter((c) => c + 1);
    onDataChanged();
  }

  useImperativeHandle(ref, () => ({ refreshAll }));

  return (
    <>
      <div className="account-hero">
        <AccountMark name={account.name} kind={account.kind} />
        <div>
          <h2>{account.name}</h2>
          <p>Capital, carteras y transferencias</p>
        </div>
        <div className="spacer" />
        <PeriodSelector period={{ type: period }} onChange={(p) => setPeriod(p.type as KpiPeriod)} />
      </div>
      <div className="kpis">{kpi && <KpiCardsIbkr kpi={kpi} period={period} />}</div>

      {data && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <RangeFilterBar data={data} filter={rangeFilter} onChange={setRangeFilter} />
        </div>
      )}

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-label">Evolución del saldo</div>
          <div style={{ height: 280 }}>{saldoReport && <SaldoChart kind={account.kind} report={saldoReport} />}</div>
        </div>
        <div className="chart-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="chart-label" style={{ marginBottom: 0 }}>
              Capital por cartera
            </div>
            <RankingModeToggle mode={carterasMode} onChange={setCarterasMode} btnClass="carteras-mode-btn" />
          </div>
          <div style={{ height: 280 }}>{carterasReport && <CarterasChart report={carterasReport} />}</div>
        </div>
      </div>

      {data && (
        <TransferenciasSection key={refreshCounter} account={account.id} filter={rangeFilter} onOpenTransferModal={onOpenTransferModal} />
      )}

      <InversionesSection account={account.id} filter={rangeFilter} onDataChanged={refreshAll} />

      {data && <MovimientosSection account={account.id} kind={account.kind} data={data} onDataChanged={refreshAll} />}
    </>
  );
});
