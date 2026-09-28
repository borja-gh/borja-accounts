import type { AccountKind } from '../../api/types';

export interface ViewPanelOption {
  id: string;
  label: string;
}

export const VIEW_PANELS: Record<AccountKind, ViewPanelOption[]> = {
  CASH: [
    { id: 'assistant', label: 'Asistente IA' },
    { id: 'overview', label: 'Resumen general' },
    { id: 'cash_budget', label: 'Presupuesto' },
    { id: 'cash_balance', label: 'Evolución del saldo' },
    { id: 'monthly', label: 'Evolución mensual' },
    { id: 'expenses', label: 'Gastos por concepto' },
    { id: 'bets', label: 'Apuestas' },
    { id: 'add_movement', label: 'Añadir movimiento' },
    { id: 'movement_total', label: 'Total por tipo y concepto' },
  ],
  INVESTMENT: [
    { id: 'assistant', label: 'Asistente IA' },
    { id: 'overview', label: 'Resumen general' },
    { id: 'investment_balance', label: 'Capital aportado' },
    { id: 'portfolios', label: 'Capital por cartera' },
    { id: 'holdings', label: 'Inversiones' },
    { id: 'add_movement', label: 'Añadir movimiento' },
    { id: 'movement_total', label: 'Total por tipo y concepto' },
  ],
};

export function defaultVisiblePanels(kind: AccountKind): string[] {
  return VIEW_PANELS[kind].map(({ id }) => id);
}
