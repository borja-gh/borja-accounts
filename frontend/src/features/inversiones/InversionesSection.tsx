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
    <div className="section section-flush">
      <InversionesBody account={account} report={report} currency={currency} onSaved={onSaved} />
    </div>
  );
}
