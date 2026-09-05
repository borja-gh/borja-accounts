import type { AccountKind } from '../api/types';

export const TIPOS_NEGATIVOS = new Set(['Gasto', 'Apuestas', 'Inversión', 'Transferencia']);

// Indexado por kind, no por cuenta individual -- cualquier cuenta CASH o
// INVESTMENT admite los mismos tipos (mismo criterio que
// domain/value_objects.py TIPOS_POR_KIND en el backend).
export const TIPOS_POR_KIND: Record<AccountKind, string[]> = {
  CASH: ['Gasto', 'Devolución', 'Ingreso', 'Nómina', 'Apuestas', 'Apuestas_r', 'Transferencia'],
  INVESTMENT: ['Gasto', 'Ingreso', 'Inversión', 'Inversión_r', 'Transferencia'],
};

const BADGE_MAP: Record<string, string> = {
  Gasto: 'gasto',
  Ingreso: 'ingreso',
  Nómina: 'nomina',
  Devolución: 'devolucion',
  Apuestas: 'apuestas',
  Apuestas_r: 'apuestasr',
  Inversión: 'inversion',
  Inversión_r: 'inversionr',
  Transferencia: 'transferencia',
  'Saldo Inicial': 'saldo',
};

export function badgeClass(tipo: string): string {
  return `b-${BADGE_MAP[tipo] || 'saldo'}`;
}

const DISPLAY_TIPO: Record<string, string> = {
  Inversión_r: 'Retorno inv.',
  Apuestas_r: 'Cobro apuesta',
};

export function displayTipo(tipo: string): string {
  return DISPLAY_TIPO[tipo] || tipo;
}
