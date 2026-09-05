import { fetchTransferencias } from '../../api/client';
import type { AccountId } from '../../api/types';
import type { RangeFilter } from '../filters/RangeFilter';
import { useRangeReport } from '../filters/useRangeReport';
import { TransferenciasBody } from './TransferenciasBody';

interface Props {
  account: AccountId;
  filter: RangeFilter;
  onOpenTransferModal: () => void;
}

export function TransferenciasSection({ account, filter, onOpenTransferModal }: Props) {
  const { report } = useRangeReport((f) => fetchTransferencias(account, f), filter, [account]);

  if (!report) return null;

  return (
    <div className="section" style={{ marginBottom: 14, overflow: 'visible' }}>
      <div className="section-head">
        <span className="section-title">Transferencias</span>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={onOpenTransferModal}>
          ⇄ Nueva
        </button>
      </div>
      <TransferenciasBody report={report} />
    </div>
  );
}
