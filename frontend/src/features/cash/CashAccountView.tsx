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
import { GastosEvolucionSection } from '../charts/GastosEvolucionSection';
import { RankingModeToggle } from '../charts/RankingModeToggle';
import { GastoAlert } from '../gastos/GastoAlert';
import { useGastosMesActual } from '../gastos/useGastosMesActual';
import { ExpenseRecurrenceSection } from '../gastos/ExpenseRecurrenceSection';
import { CashBudgetSection } from '../presupuestos/CashBudgetSection';
import { ViewCustomizer } from '../accounts/ViewCustomizer';
import { AssistantVisibilityToggle } from '../accounts/AssistantVisibilityToggle';
import { defaultVisiblePanels } from '../accounts/viewPanels';
import type { AccountViewHandle } from '../shared/viewHandle';
import type { AccountSummary, KpiPeriodFilter, RankingMode } from '../../api/types';

interface Props {
  account: AccountSummary;
  onDataChanged: () => void;
}

export const CashAccountView = forwardRef<AccountViewHandle, Props>(function CashAccountView(
  { account, onDataChanged }, ref,
) {
  const [period, setPeriod] = useState<KpiPeriodFilter>({ type: 'mes' });
  const [desgloseRange, setDesgloseRange] = useState<RangeFilter>(DEFAULT_RANGE_FILTER);
  const [gastosRange, setGastosRange] = useState<RangeFilter>(DEFAULT_RANGE_FILTER);
  const [apuestasRange, setApuestasRange] = useState<RangeFilter>(DEFAULT_RANGE_FILTER);
  const [gastosMode, setGastosMode] = useState<RankingMode>('media');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [budgetReloadToken, setBudgetReloadToken] = useState(0);
  const [recurrenceReloadToken, setRecurrenceReloadToken] = useState(0);
  const [expenseEvolutionReloadToken, setExpenseEvolutionReloadToken] = useState(0);
  const { kpi, reload: reloadKpis } = useAccountKpis(account.id, period);
  const { data, reload: reloadData } = useAccountData(account.id);
  const { report: saldoReport, reload: reloadSaldo } = useRangeReport(
    (f) => fetchSaldoEvolucion(account.id, f),
    desgloseRange,
    [account.id],
  );
  const { report: mensualReport, reload: reloadMensual } = useRangeReport(
    (f) => fetchMensualEvolucion(account.id, f),
    desgloseRange,
    [account.id],
  );
  const { report: gastosRanking, reload: reloadGastosRanking } = useRangeReport(
    (f) => fetchGastosRanking(account.id, f, f.type === '1m' ? 'total' : gastosMode),
    gastosRange,
    [account.id, gastosMode],
  );
  const { report: gastosMesActual, reload: reloadGastosMesActual } = useGastosMesActual(account.id);
  const visiblePanels = new Set(account.visiblePanels ?? defaultVisiblePanels(account.kind));
  const hasBreakdownPanels = ['cash_balance', 'monthly'].some((panel) => visiblePanels.has(panel));

  function refreshAll() {
    reloadKpis();
    reloadData();
    reloadSaldo();
    reloadMensual();
    reloadGastosRanking();
    reloadGastosMesActual();
    setExpenseEvolutionReloadToken((value) => value + 1);
    setBudgetReloadToken((value) => value + 1);
    setRecurrenceReloadToken((value) => value + 1);
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
          <AssistantVisibilityToggle
            accountId={account.id}
            kind={account.kind}
            visiblePanels={account.visiblePanels}
            onSaved={onDataChanged}
          />
          <ViewCustomizer
            accountId={account.id}
            kind={account.kind}
            visiblePanels={account.visiblePanels}
            onSaved={onDataChanged}
          />
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
      {visiblePanels.has('overview') && (
        <>
          <SectionHeading title="Resumen general" />
          <div className="kpis">{kpi && <KpiCards kpi={kpi} period={period} currency={account.currency} />}</div>
          {gastosMesActual && <GastoAlert alert={gastosMesActual.alert} currency={account.currency} />}
        </>
      )}

      {visiblePanels.has('cash_budget') && (
        <>
          <SectionHeading title="Presupuesto" />
          <CashBudgetSection account={account.id} currency={account.currency} reloadToken={budgetReloadToken} />
        </>
      )}

      {(visiblePanels.has('cash_balance') || visiblePanels.has('monthly') || visiblePanels.has('expenses') || visiblePanels.has('expense_evolution')) && (
        <>
          <SectionHeading title="Desglose" />
          {data && hasBreakdownPanels && <div className="filter-row"><RangeFilterBar data={data} filter={desgloseRange} onChange={setDesgloseRange} /></div>}
          <div className="charts-grid">
            {visiblePanels.has('cash_balance') && (
              <div className="chart-card">
                <div className="chart-label">Evolución del saldo</div>
                <div className="chart-plot">
                  {saldoReport && <SaldoChart kind={account.kind} report={saldoReport} currency={account.currency} theme={account.theme} />}
                </div>
              </div>
            )}
            {visiblePanels.has('monthly') && (
              <div className="chart-card">
                <div className="chart-label">Evolución mensual</div>
                <div className="chart-plot">{mensualReport && <MensualChart report={mensualReport} />}</div>
              </div>
            )}
            {visiblePanels.has('expenses') && gastosRanking && (
              <div className="chart-card full">
                <div className="chart-head">
                  <div className="chart-label">Gastos por concepto</div>
                  <div className="chart-head-controls">
                    {data && <RangeFilterBar
                      data={data}
                      filter={gastosRange}
                      onChange={setGastosRange}
                      allLabel="Histórico"
                      oneMonthLabel="Este mes"
                      historicalAndCurrentMonthOnly
                    />}
                    {gastosRange.type === '1m'
                      ? <span className="gastos-current-total-label">Total del mes</span>
                      : <RankingModeToggle mode={gastosMode} onChange={setGastosMode} btnClass="gastos-mode-btn" />}
                  </div>
                </div>
                <GastosChart
                  ranking={gastosRanking.ranking}
                  movements={data ?? []}
                  showDailyDetails={gastosRange.type === 'all'}
                  showMonthComparison={gastosRange.type === '1m'}
                />
              </div>
            )}
            {visiblePanels.has('expenses') && (
              <div className="chart-card full">
                <ExpenseRecurrenceSection
                  account={account.id}
                  reloadToken={recurrenceReloadToken}
                  onUpdated={refreshAll}
                />
              </div>
            )}
            {visiblePanels.has('expense_evolution') && (
              <GastosEvolucionSection
                account={account.id}
                currency={account.currency}
                theme={account.theme}
                movements={data ?? []}
                reloadToken={expenseEvolutionReloadToken}
              />
            )}
          </div>
        </>
      )}

      {visiblePanels.has('bets') && (
        <>
          <SectionHeading title="Apuestas" />
          {data && <div className="filter-row"><RangeFilterBar data={data} filter={apuestasRange} onChange={setApuestasRange} /></div>}
          <ApuestasSection account={account.id} filter={apuestasRange} onDataChanged={refreshAll} />
        </>
      )}

      <SectionHeading title="Movimientos" />
      {data && (
        <MovimientosSection
          account={account.id}
          kind={account.kind}
          currency={account.currency}
          data={data}
          visiblePanels={account.visiblePanels ?? defaultVisiblePanels(account.kind)}
          onDataChanged={refreshAll}
        />
      )}
    </>
  );
});
