import type { AccountKind } from '../api/types';

const FILL_BY_KIND: Record<AccountKind, string> = {
  CASH: '#8B5E3C',
  INVESTMENT: '#2F5D50',
};

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function AccountMark({ name, kind, small = false }: { name: string; kind: AccountKind; small?: boolean }) {
  const fill = FILL_BY_KIND[kind];
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
