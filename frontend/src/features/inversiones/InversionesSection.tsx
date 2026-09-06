import { useState } from 'react';
import { fetchCarteras } from '../../api/client';
import type { AccountId } from '../../api/types';
import type { RangeFilter } from '../filters/RangeFilter';
import { useRangeReport } from '../filters/useRangeReport';
import { ClosePositionModal, type ClosePositionRequest } from '../positions/ClosePositionModal';
import { InversionesBody } from './InversionesBody';

interface Props {
  account: AccountId;
  filter: RangeFilter;
  onDataChanged: () => void;
}

export function InversionesSection({ account, filter, onDataChanged }: Props) {
  const { report, reload } = useRangeReport((f) => fetchCarteras(account, f), filter, [account]);
  const [closing, setClosing] = useState<ClosePositionRequest | null>(null);

  if (!report) return null;

  return (
    <div className="section" style={{ marginBottom: 14, paddingTop: 6 }}>
      <InversionesBody report={report} onClosePosition={setClosing} />

      <ClosePositionModal
        account={account}
        request={closing}
        onClose={() => setClosing(null)}
        onSaved={() => {
          reload();
          onDataChanged();
        }}
      />
    </div>
  );
}
