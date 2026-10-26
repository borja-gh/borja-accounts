import type { Movement } from '../api/types';

export function expenseAmount(movement: Movement): number {
  if (movement.Tipo === 'Gasto') return movement.Total;
  if (movement.Tipo === 'Devolución') return -movement.Total;
  return 0;
}
