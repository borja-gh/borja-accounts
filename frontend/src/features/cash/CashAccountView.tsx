import { forwardRef, useImperativeHandle, useState } from 'react';
import { AccountMark } from '../../components/AccountMark';
import { SectionHeading } from '../../components/SectionHeading';
import { fetchSaldoEvolucion, fetchMensualEvolucion, fetchGastosRanking } from '../../api/client';
import { KpiCards } from '../kpis/KpiCards';
import { PeriodSelector } from '../kpis/PeriodSelector';
import { useAccountKpis } from '../kpis/useAccountKpis';
import { MovimientosSection } from '../movimientos/MovimientosSection';
import { useAccountData } from '../movimientos/useAccountData';
import { ApuestasSection } from '../apuestas/ApuestasSection';
import { DEFAULT_RANGE_FILTER, type RangeFilter } from '../filters/RangeFilter';
import { RangeFilterBar } from '../filters/RangeFilterBar';
import { useRangeReport } from '../filters/useRangeReport';
import { SaldoChart } from '../charts/SaldoChart';
import { MensualChart } from '../charts/MensualChart';
import { GastosChart } from '../charts/GastosChart';
import { DonutChart } from '../charts/DonutChart';
import { RankingModeToggle } from '../charts/RankingModeToggle';
import { GastoAlert } from '../gastos/GastoAlert';
import { useGastosMesActual } from '../gastos/useGastosMesActual';
import type { AccountViewHandle } from '../shared/viewHandle';
import type { AccountSummary, KpiPeriodFilter, RankingMode } from '../../api/types';

interface Props {
  account: AccountSummary;
  onDataChanged: () => void;
}

export const CashAccountView = forwardRef<AccountViewHandle, Props>(function CashAccountView({ account, onDataChanged }, ref) {
  const [period, setPeriod] = useState<KpiPeriodFilter>({ type: 'mes' });
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>(DEFAULT_RANGE_FILTER);
  const [gastosMode, setGastosMode] = useState<RankingMode>('media');
  const { kpi, reload: reloadKpis } = useAccountKpis(account.id, period);
  const { data, reload: reloadData } = useAccountData(account.id);
  const { report: saldoReport, reload: reloadSaldo } = useRangeReport(
    (f) => fetchSaldoEvolucion(account.id, f),
    rangeFilter,
    [account.id],
  );
  const { report: mensualReport, reload: reloadMensual } = useRangeReport(
    (f) => fetchMensualEvolucion(account.id, f),
    rangeFilter,
    [account.id],
  );
  const { report: gastosRanking, reload: reloadGastosRanking } = useRangeReport(
    (f) => fetchGastosRanking(account.id, f, gastosMode),
    rangeFilter,
    [account.id, gastosMode],
  );
  const { report: gastosMesActual, reload: reloadGastosMesActual } = useGastosMesActual(account.id);

  function refreshAll() {
    reloadKpis();
    reloadData();
    reloadSaldo();
    reloadMensual();
    reloadGastosRanking();
    reloadGastosMesActual();
    onDataChanged();
  }

  useImperativeHandle(ref, () => ({ refreshAll }));

  return (
    <>
      <div className="account-hero">
        <AccountMark name={account.name} kind={account.kind} />
        <div>
          <h2>{account.name}</h2>
          <p>Día a día · gastos, nómina y apuestas</p>
        </div>
        <div className="spacer" />
        <PeriodSelector period={period} onChange={setPeriod} allowCustom />
      </div>
      <SectionHeading title="Resumen general" />
      <div className="kpis">{kpi && <KpiCards kpi={kpi} period={period} />}</div>
      {gastosMesActual && <GastoAlert alert={gastosMesActual.alert} />}

      {data && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Rango de Desglose y Apuestas</span>
          <RangeFilterBar data={data} filter={rangeFilter} onChange={setRangeFilter} />
        </div>
      )}

      <SectionHeading title="Desglose" />
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-label">Evolución del saldo</div>
          <div style={{ height: 280 }}>{saldoReport && <SaldoChart kind={account.kind} report={saldoReport} />}</div>
        </div>
        <div className="chart-card">
          <div className="chart-label">Evolución mensual</div>
          <div style={{ height: 280 }}>{mensualReport && <MensualChart report={mensualReport} />}</div>
        </div>
        <div className="chart-card full">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="chart-label" style={{ marginBottom: 0 }}>
              Gastos por concepto
            </div>
            <RankingModeToggle mode={gastosMode} onChange={setGastosMode} btnClass="gastos-mode-btn" />
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="chart-label" style={{ marginBottom: 6 }}>
                Top 20 · Ranking
              </div>
              {gastosRanking && <GastosChart ranking={gastosRanking.ranking} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="chart-label" style={{ marginBottom: 6 }}>
                Distribución
              </div>
              {gastosRanking && <DonutChart donut={gastosRanking.donut} />}
            </div>
          </div>
        </div>
      </div>

      <SectionHeading title="Apuestas" />
      <ApuestasSection account={account.id} filter={rangeFilter} onDataChanged={refreshAll} />

      <SectionHeading title="Movimientos" />
      {data && <MovimientosSection account={account.id} kind={account.kind} data={data} onDataChanged={refreshAll} />}
    </>
  );
});
