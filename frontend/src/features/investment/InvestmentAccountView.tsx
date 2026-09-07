import { forwardRef, useImperativeHandle, useState } from 'react';
import { AccountMark } from '../../components/AccountMark';
import { SectionHeading } from '../../components/SectionHeading';
import { fetchCarteras, fetchSaldoEvolucion, fetchCarterasRanking, refreshHoldingPrices, updateAccountTheme } from '../../api/client';
import { useToast } from '../../components/ToastContext';
import { ThemePicker } from '../accounts/ThemePicker';
import { DeleteAccountModal } from '../accounts/DeleteAccountModal';
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
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [priceBanner, setPriceBanner] = useState<{ updated: number; total: number; failedTickers: string[] } | null>(null);
  const showToast = useToast();
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
  const { report: carterasDetail, reload: reloadCarterasDetail } = useRangeReport(
    (f) => fetchCarteras(account.id, f),
    rangeFilter,
    [account.id],
  );

  function refreshAll() {
    reloadKpis();
    reloadData();
    reloadSaldo();
    reloadCarterasRanking();
    reloadCarterasDetail();
    onDataChanged();
  }

  useImperativeHandle(ref, () => ({ refreshAll }));

  async function handleThemeChange(theme: ThemeName) {
    await updateAccountTheme(account.id, theme);
    onDataChanged();
  }

  async function handleRefreshPrices() {
    setRefreshingPrices(true);
    setPriceBanner(null);
    try {
      const result = await refreshHoldingPrices(account.id);
      if (!result.ok) {
        showToast(result.error || 'Error al consultar precios', 'err');
        return;
      }
      setPriceBanner({ updated: result.updated, total: result.total, failedTickers: result.failedTickers });
      reloadKpis();
      reloadCarterasDetail();
    } catch {
      showToast('Error de conexión', 'err');
    } finally {
      setRefreshingPrices(false);
    }
  }

  return (
    <>
      <div className="account-hero">
        <ThemePicker value={account.theme ?? DEFAULT_THEME_BY_KIND[account.kind]} onChange={handleThemeChange} />
        <AccountMark name={account.name} kind={account.kind} theme={account.theme} />
        <div>
          <h2>{account.name}</h2>
          <p>Capital y carteras</p>
        </div>
        <div className="spacer" />
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setDeleteModalOpen(true)}>
          Eliminar cuenta
        </button>
        <PeriodSelector period={{ type: period }} onChange={(p) => setPeriod(p.type as KpiPeriod)} />
      </div>
      <DeleteAccountModal
        account={account}
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onDeleted={onDataChanged}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 0 4px' }}>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} disabled={refreshingPrices} onClick={handleRefreshPrices}>
          {refreshingPrices ? 'Consultando…' : 'Precios actuales'}
        </button>
        {priceBanner && (
          <span className={`soft-alert ${priceBanner.failedTickers.length ? 'warn' : 'ok'}`} style={{ margin: 0 }}>
            {`${priceBanner.updated}/${priceBanner.total} posiciones actualizadas`}
            {priceBanner.failedTickers.length > 0 && ` · fallo en ${priceBanner.failedTickers.join(', ')}`}
          </span>
        )}
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
      <InversionesSection
        account={account.id}
        currency={account.currency}
        report={carterasDetail}
        onSaved={reloadCarterasDetail}
      />

      <SectionHeading title="Movimientos" />
      {data && (
        <MovimientosSection account={account.id} kind={account.kind} currency={account.currency} data={data} onDataChanged={refreshAll} />
      )}
    </>
  );
});
