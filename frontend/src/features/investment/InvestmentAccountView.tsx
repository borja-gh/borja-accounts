import { forwardRef, useImperativeHandle, useState } from 'react';
import { AccountMark } from '../../components/AccountMark';
import { SectionHeading } from '../../components/SectionHeading';
import { fetchSaldoEvolucion, fetchCarterasRanking, updateAccountTheme } from '../../api/client';
import { ThemePicker } from '../accounts/ThemePicker';
import { DEFAULT_THEME_BY_KIND, type ThemeName } from '../../styles/themes';
import { KpiCardsInvestment } from '../kpis/KpiCardsInvestment';
import { PeriodSelector } from '../kpis/PeriodSelector';
import { useInvestmentKpis } from '../kpis/useInvestmentKpis';
import { MovimientosSection } from '../movimientos/MovimientosSection';
import { useAccountData } from '../movimientos/useAccountData';
import { InversionesSection } from '../inversiones/InversionesSection';
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
}

export const InvestmentAccountView = forwardRef<AccountViewHandle, Props>(function InvestmentAccountView(
  { account, onDataChanged },
  ref,
) {
  const [period, setPeriod] = useState<KpiPeriod>('mes');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>(DEFAULT_RANGE_FILTER);
  const [carterasMode, setCarterasMode] = useState<RankingMode>('total');
  const { kpi, reload: reloadKpis } = useInvestmentKpis(account.id, period);
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
    onDataChanged();
  }

  useImperativeHandle(ref, () => ({ refreshAll }));

  async function handleThemeChange(theme: ThemeName) {
    await updateAccountTheme(account.id, theme);
    onDataChanged();
  }

  return (
    <>
      <div className="account-hero">
        <AccountMark name={account.name} kind={account.kind} theme={account.theme} />
        <div>
          <h2>{account.name}</h2>
          <p>Capital y carteras</p>
        </div>
        <ThemePicker value={account.theme ?? DEFAULT_THEME_BY_KIND[account.kind]} onChange={handleThemeChange} />
        <div className="spacer" />
        <PeriodSelector period={{ type: period }} onChange={(p) => setPeriod(p.type as KpiPeriod)} />
      </div>

      <SectionHeading title="Resumen general" />
      <div className="kpis">{kpi && <KpiCardsInvestment kpi={kpi} period={period} currency={account.currency} />}</div>

      {data && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <RangeFilterBar data={data} filter={rangeFilter} onChange={setRangeFilter} />
        </div>
      )}

      <SectionHeading title="Desglose" />
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-label">Capital aportado · histórico (EUR)</div>
          <div style={{ height: 280 }}>
            {saldoReport && <SaldoChart kind={account.kind} report={saldoReport} currency={account.currency} theme={account.theme} />}
          </div>
        </div>
        <div className="chart-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="chart-label" style={{ marginBottom: 0 }}>
              Capital por cartera
            </div>
            <RankingModeToggle mode={carterasMode} onChange={setCarterasMode} btnClass="carteras-mode-btn" />
          </div>
          <div style={{ height: 280 }}>
            {carterasReport && <CarterasChart report={carterasReport} kind={account.kind} theme={account.theme} />}
          </div>
        </div>
      </div>

      <SectionHeading title="Inversiones" />
      <InversionesSection account={account.id} currency={account.currency} filter={rangeFilter} />

      <SectionHeading title="Movimientos" />
      {data && (
        <MovimientosSection account={account.id} kind={account.kind} currency={account.currency} data={data} onDataChanged={refreshAll} />
      )}
    </>
  );
});
