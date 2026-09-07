import type { AccountKind } from '../api/types';
import { resolveTheme, type ThemeName } from '../styles/themes';

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

interface Props {
  name: string;
  kind: AccountKind;
  theme?: ThemeName | null;
  small?: boolean;
}

export function AccountMark({ name, kind, theme, small = false }: Props) {
  const fill = resolveTheme(theme, kind).accent;
  const label = initials(name);
  return (
    <svg className={`mark ${small ? 'mark-sm' : ''}`} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill={fill} />
      <text x="16" y="21" textAnchor="middle" fontFamily="Outfit,system-ui,sans-serif" fontSize="11" fontWeight="700" fill="#fff">
        {label}
      </text>
    </svg>
  );
}
