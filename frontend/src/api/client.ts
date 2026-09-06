import type {
  AccountKpis,
  AccountSummary,
  AddMovementRequest,
  BettingReport,
  CarterasRankingReport,
  CreateAccountRequest,
  CreateAccountResult,
  DeleteResult,
  EditMovementRequest,
  GastosMesActualReport,
  GastosRankingReport,
  IbkrKpis,
  KpiPeriod,
  KpiPeriodFilter,
  MensualEvolucionReport,
  Movement,
  MutationResult,
  PortfolioReport,
  RankingMode,
  SaldoEvolucionReport,
  TransferRequest,
  TransferResult,
  TransfersReport,
} from './types';
import type { RangeFilter } from '../features/filters/RangeFilter';

async function fetchRangeReport<T>(path: string, filter: RangeFilter, extraParams?: Record<string, string>): Promise<T> {
  const params = new URLSearchParams({ range: filter.type, ...extraParams });
  if (filter.type === 'custom' && filter.fromYm && filter.toYm) {
    params.set('year', `${filter.fromYm}:${filter.toYm}`);
  } else if (filter.year !== undefined) {
    params.set('year', String(filter.year));
  }
  const res = await fetch(`${path}?${params}`);
  return res.json();
}

export async function fetchAccounts(): Promise<AccountSummary[]> {
  const res = await fetch('/api/accounts');
  return res.json();
}

export async function createAccount(body: CreateAccountRequest): Promise<CreateAccountResult> {
  const res = await fetch('/api/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { ok: res.ok, ...json };
}

export async function fetchAccountKpis(cuenta: string, period: KpiPeriodFilter): Promise<AccountKpis | null> {
  const params = new URLSearchParams({ period: period.type });
  if (period.type === 'custom' && period.fromYm && period.toYm) {
    params.set('year', `${period.fromYm}:${period.toYm}`);
  }
  const res = await fetch(`/api/accounts/${cuenta}/kpis?${params}`);
  // Un 400 (rango inválido) devuelve {"error": ...}, no un AccountKpis --
  // tratarlo como tal rompía KpiDelta (delta.diff de un campo inexistente).
  if (!res.ok) return null;
  return res.json();
}

export async function fetchInvestmentKpis(cuenta: string, period: KpiPeriod): Promise<IbkrKpis> {
  const res = await fetch(`/api/accounts/${cuenta}/ibkr-kpis?period=${encodeURIComponent(period)}`);
  return res.json();
}

export async function fetchAccountData(cuenta: string): Promise<Movement[]> {
  const res = await fetch(`/api/data/${cuenta}`);
  return res.json();
}

export async function addMovement(cuenta: string, body: AddMovementRequest): Promise<MutationResult> {
  const res = await fetch(`/api/movimiento/${cuenta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { ok: res.ok, ...json };
}

export async function editMovement(cuenta: string, body: EditMovementRequest): Promise<MutationResult> {
  const res = await fetch(`/api/movimiento/${cuenta}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { ok: res.ok, ...json };
}

export async function deleteLastMovement(cuenta: string): Promise<DeleteResult> {
  const res = await fetch(`/api/movimiento/${cuenta}`, { method: 'DELETE' });
  const json = await res.json();
  return { ok: res.ok, ...json };
}

export function fetchApuestas(cuenta: string, filter: RangeFilter): Promise<BettingReport> {
  return fetchRangeReport(`/api/accounts/${cuenta}/apuestas`, filter);
}

export function fetchCarteras(cuenta: string, filter: RangeFilter): Promise<PortfolioReport> {
  return fetchRangeReport(`/api/accounts/${cuenta}/carteras`, filter);
}

export function fetchTransferencias(cuenta: string, filter: RangeFilter): Promise<TransfersReport> {
  return fetchRangeReport(`/api/accounts/${cuenta}/transferencias`, filter);
}

export async function submitTransfer(body: TransferRequest): Promise<TransferResult> {
  const res = await fetch('/api/transferencia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { ok: res.ok, ...json };
}

export function fetchSaldoEvolucion(cuenta: string, filter: RangeFilter): Promise<SaldoEvolucionReport> {
  return fetchRangeReport(`/api/accounts/${cuenta}/saldo-evolucion`, filter);
}

export function fetchMensualEvolucion(cuenta: string, filter: RangeFilter): Promise<MensualEvolucionReport> {
  return fetchRangeReport(`/api/accounts/${cuenta}/mensual-evolucion`, filter);
}

export function fetchGastosRanking(cuenta: string, filter: RangeFilter, mode: RankingMode): Promise<GastosRankingReport> {
  return fetchRangeReport(`/api/accounts/${cuenta}/gastos-ranking`, filter, { mode });
}

export function fetchCarterasRanking(cuenta: string, filter: RangeFilter, mode: RankingMode): Promise<CarterasRankingReport> {
  return fetchRangeReport(`/api/accounts/${cuenta}/carteras-ranking`, filter, { mode });
}

export async function fetchGastosMesActual(cuenta: string): Promise<GastosMesActualReport> {
  const res = await fetch(`/api/accounts/${cuenta}/gastos-mes-actual`);
  return res.json();
}
