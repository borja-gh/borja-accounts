import { useState } from 'react';
import { fetchApuestas } from '../../api/client';
import type { AccountId } from '../../api/types';
import type { RangeFilter } from '../filters/RangeFilter';
import { useRangeReport } from '../filters/useRangeReport';
import { ClosePositionModal, type ClosePositionRequest } from '../positions/ClosePositionModal';
import { ApuestasBody } from './ApuestasBody';

interface Props {
  account: AccountId;
  filter: RangeFilter;
  onDataChanged: () => void;
}

// El filtro de rango se muestra una única vez a nivel de vista (ver
// CashAccountView) -- ver docs/ARCHITECTURE.md §0, "filtro único global".
export function ApuestasSection({ account, filter, onDataChanged }: Props) {
  const { report, reload } = useRangeReport((f) => fetchApuestas(account, f), filter, [account]);
  const [closing, setClosing] = useState<ClosePositionRequest | null>(null);

  if (!report) return null;

  return (
    <div className="section section-flush">
      <ApuestasBody report={report} onClosePosition={setClosing} />

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
