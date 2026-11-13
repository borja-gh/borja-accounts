import { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { Tabs } from './components/Tabs';
import { ToastProvider } from './components/ToastContext';
import { fetchAccounts, fetchAssistantStatus } from './api/client';
import type { AccountId, AccountSummary, AssistantStatus } from './api/types';
import { CashAccountView } from './features/cash/CashAccountView';
import { InvestmentAccountView } from './features/investment/InvestmentAccountView';
import { TransferModal } from './features/transferencias/TransferModal';
import { CreateAccountModal } from './features/accounts/CreateAccountModal';
import { OnboardingEmptyState } from './components/OnboardingEmptyState';
import type { AccountViewHandle } from './features/shared/viewHandle';
import { resolveTheme } from './styles/themes';
import { AssistantPanel } from './features/asistente/AssistantPanel';
import { AssistantControl } from './features/asistente/AssistantControl';
import { defaultVisiblePanels } from './features/accounts/viewPanels';
import './styles/app.css';

function App() {
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null);
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus | null>(null);
  const assistantEnabled = assistantStatus?.enabled ?? false;
  const [account, setAccount] = useState<AccountId | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [createAccountModalOpen, setCreateAccountModalOpen] = useState(false);
  const viewRef = useRef<AccountViewHandle>(null);

  const [loadError, setLoadError] = useState(false);

  const refreshAccounts = useCallback(() => {
    fetchAccounts()
      .then((list) => {
        setLoadError(false);
        setAccounts(list);
        setAccount((current) => (current && list.some((a) => a.id === current) ? current : (list[0]?.id ?? null)));
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    refreshAccounts();
    fetchAssistantStatus().then(setAssistantStatus).catch(() => setAssistantStatus({
      enabled: false, activeProject: null, startupMode: 'disabled', project: '', promptOnStart: false,
      error: 'No se pudo consultar el estado del asistente. Comprueba la conexión con el servidor local.',
    }));
  }, [refreshAccounts]);

  const selected = accounts?.find((a) => a.id === account) ?? null;
  const assistantVisible = selected
    ? (selected.visiblePanels ?? defaultVisiblePanels(selected.kind)).includes('assistant')
    : true;

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
        {accounts && assistantStatus && <AssistantControl status={assistantStatus} onChanged={setAssistantStatus} />}
        {!accounts && !loadError && (
          <div className="loading" role="status">
            Cargando cuentas…
          </div>
        )}
        {!accounts && loadError && (
          <div className="empty" role="alert">
            <p>
              No se pudo conectar con el servidor local. Comprueba que la terminal desde la que arrancaste la
              aplicación sigue en marcha y vuelve a intentarlo.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                setLoadError(false);
                refreshAccounts();
              }}
            >
              Reintentar
            </button>
          </div>
        )}
        {accounts && assistantEnabled && assistantVisible && (
          <AssistantPanel
            accounts={accounts}
            selectedAccount={account}
          />
        )}
        {accounts && accounts.length === 0 && (
          <OnboardingEmptyState onCreateAccount={() => setCreateAccountModalOpen(true)} />
        )}
        {selected &&
          (selected.kind === 'CASH' ? (
            <CashAccountView
              key={selected.id}
              account={selected}
              assistantEnabled={assistantEnabled}
              ref={viewRef}
              onDataChanged={refreshAccounts}
            />
          ) : (
            <InvestmentAccountView
              key={selected.id}
              account={selected}
              assistantEnabled={assistantEnabled}
              ref={viewRef}
              onDataChanged={refreshAccounts}
            />
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
