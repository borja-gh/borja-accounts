import type { AccountId, PortfolioReport } from '../../api/types';
import { InversionesBody } from './InversionesBody';

interface Props {
  account: AccountId;
  currency: string;
  report: PortfolioReport | null;
  onSaved: () => void;
}

export function InversionesSection({ account, currency, report, onSaved }: Props) {
  if (!report) return null;

  return (
    <div className="section" style={{ marginBottom: 14, paddingTop: 6 }}>
      <InversionesBody account={account} report={report} currency={currency} onSaved={onSaved} />
    </div>
  );
}
