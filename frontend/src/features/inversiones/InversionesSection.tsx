import { fetchCarteras } from '../../api/client';
import type { AccountId } from '../../api/types';
import type { RangeFilter } from '../filters/RangeFilter';
import { useRangeReport } from '../filters/useRangeReport';
import { InversionesBody } from './InversionesBody';

interface Props {
  account: AccountId;
  currency: string;
  filter: RangeFilter;
}

export function InversionesSection({ account, currency, filter }: Props) {
  const { report, reload } = useRangeReport((f) => fetchCarteras(account, f), filter, [account]);

  if (!report) return null;

  return (
    <div className="section" style={{ marginBottom: 14, paddingTop: 6 }}>
      <InversionesBody account={account} report={report} currency={currency} onSaved={reload} />
    </div>
  );
}
