import { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { Tabs } from './components/Tabs';
import { ToastProvider } from './components/ToastContext';
import { fetchAccounts } from './api/client';
import type { AccountId, AccountSummary } from './api/types';
import { CashAccountView } from './features/cash/CashAccountView';
import { InvestmentAccountView } from './features/investment/InvestmentAccountView';
import { TransferModal } from './features/transferencias/TransferModal';
import { CreateAccountModal } from './features/accounts/CreateAccountModal';
import { OnboardingEmptyState } from './components/OnboardingEmptyState';
import type { AccountViewHandle } from './features/shared/viewHandle';
import { resolveTheme } from './styles/themes';
import './styles/app.css';

function App() {
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null);
  const [account, setAccount] = useState<AccountId | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [createAccountModalOpen, setCreateAccountModalOpen] = useState(false);
  const viewRef = useRef<AccountViewHandle>(null);

  const refreshAccounts = useCallback(() => {
    fetchAccounts().then((list) => {
      setAccounts(list);
      setAccount((current) => (current && list.some((a) => a.id === current) ? current : (list[0]?.id ?? null)));
    });
  }, []);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  const selected = accounts?.find((a) => a.id === account) ?? null;

  useEffect(() => {
    if (!selected) return;
    const colors = resolveTheme(selected.theme, selected.kind);
    document.body.style.setProperty('--accent', colors.accent);
    document.body.style.setProperty('--accent-soft', colors.accentSoft);
    document.body.style.setProperty('--bg', colors.bg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.kind, selected?.theme]);

  return (
    <ToastProvider>
      <Header accounts={accounts} onOpenTransfer={() => setTransferModalOpen(true)} />
      {accounts && (
        <Tabs
          accounts={accounts}
          account={account ?? ''}
          onChange={setAccount}
          onOpenNewAccount={() => setCreateAccountModalOpen(true)}
        />
      )}
      <main className="content">
        {accounts && accounts.length === 0 && (
          <OnboardingEmptyState onCreateAccount={() => setCreateAccountModalOpen(true)} />
        )}
        {selected &&
          (selected.kind === 'CASH' ? (
            <CashAccountView key={selected.id} account={selected} ref={viewRef} onDataChanged={refreshAccounts} />
          ) : (
            <InvestmentAccountView key={selected.id} account={selected} ref={viewRef} onDataChanged={refreshAccounts} />
          ))}
      </main>
      <TransferModal
        open={transferModalOpen}
        accounts={accounts ?? []}
        onClose={() => setTransferModalOpen(false)}
        onSaved={() => viewRef.current?.refreshAll()}
      />
      <CreateAccountModal
        open={createAccountModalOpen}
        onClose={() => setCreateAccountModalOpen(false)}
        onCreated={(created) => {
          refreshAccounts();
          setAccount(created.id);
        }}
      />
    </ToastProvider>
  );
}

export default App;
