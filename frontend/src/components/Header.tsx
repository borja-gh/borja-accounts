import { money } from '../lib/format';
import type { AccountSummary } from '../api/types';

// El patrimonio total nunca suma cuentas de distinta divisa entre sí (EUR +
// USD directamente sería sumar unidades distintas) -- se agrupa por
// divisa y se muestra un total por cada una. Sin conversión de tipo de
// cambio: es una decisión explícita, no una limitación temporal (ver
// conversación de diseño del punto 5).
function totalsByCurrency(accounts: AccountSummary[]): [string, number][] {
  const totals = new Map<string, number>();
  for (const a of accounts) {
    totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.saldo);
  }
  return [...totals.entries()];
}

export function Header({ accounts, onOpenTransfer }: { accounts: AccountSummary[] | null; onOpenTransfer: () => void }) {
  const totals = accounts ? totalsByCurrency(accounts) : [];
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
        {accounts ? (
          <>
            {totals.map(([currency, total], i) => (
              <span key={currency}>
                {i > 0 && '  ·  '}
                Total {currency} <b>{money(total, currency)}</b>
              </span>
            ))}
            {accounts.length > 0 && (
              <>
                {' — '}
                {accounts.map((a, i) => (
                  <span key={a.id}>
                    {i > 0 && ' · '}
                    {a.name} {money(a.saldo, a.currency)}
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
