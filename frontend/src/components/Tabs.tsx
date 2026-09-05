import type { AccountId, AccountSummary } from '../api/types';
import { AccountMark } from './AccountMark';

interface Props {
  accounts: AccountSummary[];
  account: AccountId;
  onChange: (account: AccountId) => void;
  onOpenNewAccount: () => void;
}

export function Tabs({ accounts, account, onChange, onOpenNewAccount }: Props) {
  return (
    <div className="tabs">
      {accounts.map((a) => (
        <button key={a.id} className={`tab ${account === a.id ? 'active' : ''}`} onClick={() => onChange(a.id)}>
          <span className="tab-inner">
            <AccountMark name={a.name} kind={a.kind} small />
            {a.name}
          </span>
        </button>
      ))}
      <button className="tab tab-new" onClick={onOpenNewAccount} title="Abrir cuenta nueva">
        + Cuenta
      </button>
    </div>
  );
}
