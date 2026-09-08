export function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Importe válido para un movimiento. 0 solo en cobro de apuesta (pérdida total). */
export function isValidMovementAmount(n: number, tipo: string): boolean {
  if (Number.isNaN(n) || n < 0) return false;
  if (n === 0) return tipo === 'Apuestas_r';
  return true;
}
