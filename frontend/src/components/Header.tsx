import { useEffect, useState } from 'react';
import { fetchFxRate } from '../api/client';
import { money } from '../lib/format';
import type { AccountSummary } from '../api/types';

function totalsByCurrency(accounts: AccountSummary[]): [string, number][] {
  const totals = new Map<string, number>();
  for (const a of accounts) {
    totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.saldo);
  }
  return [...totals.entries()];
}

export function Header({ accounts, onOpenTransfer }: { accounts: AccountSummary[] | null; onOpenTransfer: () => void }) {
  const totals = accounts ? totalsByCurrency(accounts) : [];
  const hasMultipleCurrencies = totals.length > 1;
  const [estimateCurrency, setEstimateCurrency] = useState<AccountSummary['currency']>('EUR');
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);

  useEffect(() => {
    if (!hasMultipleCurrencies) {
      setExchangeRate(null);
      return;
    }
    setExchangeRate(null);
    let active = true;
    const source = estimateCurrency === 'EUR' ? 'USD' : 'EUR';
    fetchFxRate(source, estimateCurrency)
      .then((result) => {
        if (active) setExchangeRate(result.ok && typeof result.rate === 'number' ? result.rate : null);
      })
      .catch(() => {
        if (active) setExchangeRate(null);
      });
    return () => { active = false; };
  }, [estimateCurrency, hasMultipleCurrencies]);

  const estimatedTotal = hasMultipleCurrencies && exchangeRate !== null && accounts
    ? accounts.reduce(
        (total, account) => total + account.saldo * (account.currency === estimateCurrency ? 1 : exchangeRate),
        0,
      )
    : null;

  return (
    <header className="header">
      <div className="brand">
        <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="currentColor" />
          <text x="16" y="22" textAnchor="middle" fontFamily="Geist,system-ui,sans-serif" fontSize="15" fontWeight="700" fill="#fff">
            C
          </text>
        </svg>
        <h1>Cuentas</h1>
      </div>
      <div className="patrimonio-pill">
        {accounts ? (
          <>
            <span className="patrimonio-totals">
              {totals.map(([currency, total]) => (
                <span key={currency} className="patrimonio-total">
                  Total {currency} <b>{money(total, currency)}</b>
                </span>
              ))}
            </span>
            {hasMultipleCurrencies && (
              <span className="patrimonio-estimate">
                <span>Capital estimado en</span>
                <select
                  aria-label="Divisa del capital estimado"
                  value={estimateCurrency}
                  onChange={(event) => setEstimateCurrency(event.target.value as AccountSummary['currency'])}
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
                <b>{estimatedTotal === null ? '—' : money(estimatedTotal, estimateCurrency)}</b>
              </span>
            )}
            {accounts.length > 0 && (
              <span className="patrimonio-accounts">
                {accounts.map((a) => (
                  <span key={a.id} className="patrimonio-account">
                    {a.name} {money(a.saldo, a.currency)}
                  </span>
                ))}
              </span>
            )}
          </>
        ) : (
          '—'
        )}
      </div>
      <div className="spacer" />
      {accounts && accounts.length >= 2 && (
        <button className="btn-transfer" onClick={onOpenTransfer}>
          ⇄ Transferencia
        </button>
      )}
    </header>
  );
}
