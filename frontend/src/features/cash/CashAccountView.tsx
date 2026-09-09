import { forwardRef, useImperativeHandle, useState } from 'react';
import { AccountMark } from '../../components/AccountMark';
import { SectionHeading } from '../../components/SectionHeading';
import { fetchSaldoEvolucion, fetchMensualEvolucion, fetchGastosRanking, updateAccountTheme } from '../../api/client';
import { ThemePicker } from '../accounts/ThemePicker';
import { DeleteAccountModal } from '../accounts/DeleteAccountModal';
import { DEFAULT_THEME_BY_KIND, type ThemeName } from '../../styles/themes';
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
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
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

  async function handleThemeChange(theme: ThemeName) {
    await updateAccountTheme(account.id, theme);
    onDataChanged();
  }

  return (
    <>
      <div className="account-hero">
        <ThemePicker value={account.theme ?? DEFAULT_THEME_BY_KIND[account.kind]} onChange={handleThemeChange} />
        <AccountMark name={account.name} kind={account.kind} theme={account.theme} />
        <div className="account-hero-copy">
          <div className="account-hero-title">
            <h2>{account.name}</h2>
            <span className="badge b-nomina">Cash</span>
          </div>
          <p>Día a día · gastos, nómina y apuestas</p>
        </div>
        <div className="account-hero-actions">
          <button className="btn btn-ghost btn-compact" onClick={() => setDeleteModalOpen(true)}>
            Eliminar cuenta
          </button>
          <PeriodSelector period={period} onChange={setPeriod} allowCustom />
        </div>
      </div>
      <DeleteAccountModal
        account={account}
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onDeleted={onDataChanged}
      />
      <SectionHeading title="Resumen general" />
      <div className="kpis">{kpi && <KpiCards kpi={kpi} period={period} currency={account.currency} />}</div>
      {gastosMesActual && <GastoAlert alert={gastosMesActual.alert} currency={account.currency} />}

      {data && (
        <div className="filter-row">
          <span className="filter-row-label">Rango de Desglose y Apuestas</span>
          <RangeFilterBar data={data} filter={rangeFilter} onChange={setRangeFilter} />
        </div>
      )}

      <SectionHeading title="Desglose" />
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-label">Evolución del saldo</div>
          <div className="chart-plot">
            {saldoReport && <SaldoChart kind={account.kind} report={saldoReport} currency={account.currency} theme={account.theme} />}
          </div>
        </div>
        <div className="chart-card">
          <div className="chart-label">Evolución mensual</div>
          <div className="chart-plot">{mensualReport && <MensualChart report={mensualReport} />}</div>
        </div>
        <div className="chart-card full">
          <div className="chart-head">
            <div className="chart-label">Gastos por concepto</div>
            <RankingModeToggle mode={gastosMode} onChange={setGastosMode} btnClass="gastos-mode-btn" />
          </div>
          {gastosRanking && <GastosChart ranking={gastosRanking.ranking} />}
        </div>
      </div>

      <SectionHeading title="Apuestas" />
      <ApuestasSection account={account.id} filter={rangeFilter} onDataChanged={refreshAll} />

      <SectionHeading title="Movimientos" />
      {data && (
        <MovimientosSection account={account.id} kind={account.kind} currency={account.currency} data={data} onDataChanged={refreshAll} />
      )}
    </>
  );
});
