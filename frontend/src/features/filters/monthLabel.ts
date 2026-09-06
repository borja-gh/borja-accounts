// Abreviaturas fijas en vez de toLocaleDateString: el resultado de
// Intl/ICU para 'es-ES' + month:'short' varía entre entornos (algunos
// añaden punto, "sept." vs "sept"), y aquí conviene un resultado
// predecible en el chip.
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}
