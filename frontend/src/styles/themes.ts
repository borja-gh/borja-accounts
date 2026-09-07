export type ThemeName = 'clay' | 'forest' | 'slate' | 'plum' | 'amber' | 'teal';

export interface ThemeColors {
  accent: string;
  accentSoft: string;
  bg: string;
  chartLine?: string;
}

// clay.chartLine preserva el azul legado de SaldoChart en cuentas CASH --
// las demás paletas no tenían un color de línea propio antes de este
// bloque, así que usan accent como línea por defecto (ver chartLineColor).
export const THEMES: Record<ThemeName, ThemeColors> = {
  clay: { accent: '#8B5E3C', accentSoft: 'rgba(139,94,60,0.10)', bg: '#F6F3EF', chartLine: '#0969da' },
  forest: { accent: '#2F5D50', accentSoft: 'rgba(47,93,80,0.10)', bg: '#F2F5F3' },
  slate: { accent: '#3F4756', accentSoft: 'rgba(63,71,86,0.10)', bg: '#F2F3F5' },
  plum: { accent: '#6B3FA0', accentSoft: 'rgba(107,63,160,0.10)', bg: '#F5F2F8' },
  amber: { accent: '#9A6700', accentSoft: 'rgba(154,103,0,0.10)', bg: '#F8F4EC' },
  teal: { accent: '#0F7C7C', accentSoft: 'rgba(15,124,124,0.10)', bg: '#EFF6F6' },
};

export const DEFAULT_THEME_BY_KIND: Record<'CASH' | 'INVESTMENT', ThemeName> = {
  CASH: 'clay',
  INVESTMENT: 'forest',
};

export function resolveTheme(theme: ThemeName | null | undefined, kind: 'CASH' | 'INVESTMENT'): ThemeColors {
  return THEMES[theme as ThemeName] ?? THEMES[DEFAULT_THEME_BY_KIND[kind]];
}

export function chartLineColor(theme: ThemeName | null | undefined, kind: 'CASH' | 'INVESTMENT'): string {
  const colors = resolveTheme(theme, kind);
  return colors.chartLine ?? colors.accent;
}
