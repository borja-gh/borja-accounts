import { eur } from '../lib/format';
import type { AccountSummary } from '../api/types';

export function Header({ accounts, onOpenTransfer }: { accounts: AccountSummary[] | null; onOpenTransfer: () => void }) {
  const total = accounts?.reduce((sum, a) => sum + a.saldo, 0) ?? null;
  return (
    <header className="header">
      <div className="brand">
        <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="currentColor" />
          <text x="16" y="22" textAnchor="middle" fontFamily="Outfit,system-ui,sans-serif" fontSize="15" fontWeight="700" fill="#fff">
            C
          </text>
        </svg>
        <h1>Cuentas</h1>
      </div>
      <div className="patrimonio-pill">
        {accounts && total !== null ? (
          <>
            Total <b>{eur(total)}</b>
            {accounts.length > 0 && (
              <>
                {' — '}
                {accounts.map((a, i) => (
                  <span key={a.id}>
                    {i > 0 && ' · '}
                    {a.name} {eur(a.saldo)}
                  </span>
                ))}
              </>
            )}
          </>
        ) : (
          '—'
        )}
      </div>
      <div className="spacer" />
      <button className="btn-transfer" onClick={onOpenTransfer}>
        ⇄ Transferencia
      </button>
    </header>
  );
}
