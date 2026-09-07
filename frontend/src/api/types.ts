import type { ThemeName } from '../styles/themes';

export type AccountId = string;
export type AccountKind = 'CASH' | 'INVESTMENT';
export type Currency = 'EUR' | 'USD';
export type KpiPeriod = 'mes' | 'trimestre' | 'año';
export type KpiPeriodType = KpiPeriod | 'custom';

export interface KpiPeriodFilter {
  type: KpiPeriodType;
  /** Solo con type: 'custom' -- 'YYYY-MM', ambos inclusive. */
  fromYm?: string;
  toYm?: string;
}

export interface AccountSummary {
  id: AccountId;
  name: string;
  kind: AccountKind;
  currency: Currency;
  saldo: number;
  theme?: ThemeName | null;
}

export interface CreateAccountRequest {
  name: string;
  kind: AccountKind;
  currency: Currency;
  initialBalance?: number;
  theme?: ThemeName;
}

export interface CreateAccountResult {
  ok: boolean;
  id: string;
  name: string;
  kind: AccountKind;
  currency: Currency;
  theme?: ThemeName | null;
  error?: string;
}

export interface UpdateAccountThemeResult {
  ok: boolean;
  id: string;
  theme?: ThemeName | null;
  error?: string;
}

export interface Delta {
  diff: number;
}

export interface AccountKpis {
  saldo: number;
  ingresos: number;
  ingresosDelta: Delta;
  gastos: number;
  gastosDelta: Delta;
  balance: number;
  balanceDelta: Delta;
}

export interface InvestmentKpis {
  saldo: number;
  aportado: number;
  aportadoDelta: Delta;
  enCarteras: number;
  enCarterasCount: number;
  pnl: number;
  pnlDelta: Delta;
}

export interface Movement {
  Fecha: string;
  Tipo: string;
  Concepto: string;
  Total: number;
  Saldo: number;
  _idx: number | null;
}

export interface AddMovementRequest {
  fecha: string;
  tipo: string;
  concepto: string;
  total: number;
}

export interface EditMovementRequest {
  idx: number;
  tipo: string;
  concepto: string;
  total: number;
  fecha: string;
}

export interface MutationResult {
  ok: boolean;
  saldo: number;
  error?: string;
}

export interface DeleteResult {
  ok: boolean;
  eliminado: Movement;
  saldo: number;
  error?: string;
}

export interface OpenBetPosition {
  concepto: string;
  fi: string;
  banca: number;
}

export interface ClosedBetPosition {
  Concepto: string;
  fi: string;
  fr: string;
  banca: number;
  devuelto: number;
  bal: number;
  crec: number;
  balH: number;
  crecH: number;
}

export interface BettingReport {
  openCount: number;
  closedCount: number;
  openPositions: OpenBetPosition[];
  closedPositions: ClosedBetPosition[];
  openTotal: number;
  totalApostado: number;
  totalBets: number;
  totalPnL: number;
  totalPnLPct: number;
  winRate: number;
  wins: number;
}

export interface PortfolioHoldingDetail {
  id: number;
  ticker: string;
  company: string;
  avgPrice: number;
  capital: number;
  closePrice: number | null;
  pnl: number | null;
  pnlPct: number | null;
  note: string | null;
}

export interface OpenInvestPosition {
  concepto: string;
  fi: string;
  invertido: number;
  pnl: number | null;
  pnlPct: number | null;
  holdings: PortfolioHoldingDetail[];
}

export interface ClosedInvestPosition {
  Concepto: string;
  fi: string;
  fr: string;
  invertido: number;
  devuelto: number;
  bal: number;
  roi: number;
  balH: number;
  roiH: number;
}

export interface PortfolioReport {
  openCount: number;
  closedCount: number;
  openPositions: OpenInvestPosition[];
  closedPositions: ClosedInvestPosition[];
  openTotal: number;
  totalInv: number;
  totalCarteras: number;
  totalPnL: number;
  totalRoi: number;
}

export interface TransferRequest {
  origen: AccountId;
  destino: AccountId;
  total: number;
  fecha: string;
  exchangeRate?: number;
}

export interface TransferResult {
  ok: boolean;
  saldo_origen: number;
  saldo_destino: number;
  error?: string;
}

export interface UpdatePortfolioHoldingRequest {
  closePrice?: number | null;
  note?: string | null;
}

export interface UpdatePortfolioHoldingResult {
  ok: boolean;
  closePrice: number | null;
  note: string | null;
  error?: string;
}

export interface SaldoEvolucionReport {
  dates: string[];
  saldos: number[];
  actual: number;
  mediaMovil?: number[] | null;
}

export interface MensualEvolucionReport {
  meses: string[];
  ingresos: number[];
  gastos: number[];
  balance: number[];
}

export interface RankingEntry {
  concepto: string;
  valor: number;
}

export interface GastosRankingSection {
  entries: RankingEntry[];
  hasGastos: boolean;
  hoverSuffix: string;
}

export interface GastosRankingReport {
  ranking: GastosRankingSection;
}

export interface CarterasRankingReport {
  entries: RankingEntry[];
  hoverSuffix: string;
}

export interface GastoAlert {
  isWarning: boolean;
  curTotal: number;
  pct: number;
  monthsCount: number;
  avg: number;
}

export interface GastosMesActualReport {
  alert: GastoAlert | null;
  topMerchants: { concepto: string; total: number }[];
}

export type RankingMode = 'media' | 'total';
