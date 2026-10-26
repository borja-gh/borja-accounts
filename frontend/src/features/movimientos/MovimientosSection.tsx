import { useRef, useState } from 'react';
import { deleteMovement } from '../../api/client';
import type { AccountId, AccountKind, Movement } from '../../api/types';
import { useToast } from '../../components/ToastContext';
import { fd, money } from '../../lib/format';
import { AddMovementForm, type AddMovementFormHandle } from './AddMovementForm';
import { EditMovementModal } from './EditMovementModal';
import { MovimientosSearch } from './MovimientosSearch';
import { MovimientosTable } from './MovimientosTable';
import { MovementTotalPanel } from './MovementTotalPanel';
import { EMPTY_SEARCH, isSearchActive, searchedMovs, type MovSearch } from './search';

interface Props {
  account: AccountId;
  kind: AccountKind;
  currency: string;
  data: Movement[];
  visiblePanels: string[];
  onDataChanged: () => void;
}

export function MovimientosSection({ account, kind, currency, data, visiblePanels, onDataChanged }: Props) {
  const [search, setSearch] = useState<MovSearch>(EMPTY_SEARCH);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const formRef = useRef<AddMovementFormHandle>(null);
  const formSectionRef = useRef<HTMLDivElement>(null);
  const showToast = useToast();

  const movs = searchedMovs(data, search);
  const countLabel = isSearchActive(search) ? `${movs.length} resultado(s)` : 'Últimos 20';
  const canAddMovement = visiblePanels.includes('add_movement');
  const canShowMovementTotal = visiblePanels.includes('movement_total');
  const hasSidePanels = canAddMovement || canShowMovementTotal;

  function afterMutation() {
    onDataChanged();
  }

  function handleDuplicate(idx: number) {
    const row = data.find((r) => r._idx === idx);
    if (!row || row.Tipo === 'Saldo Inicial') return;
    if (formRef.current?.fillFrom(row)) {
      showToast('Duplicado en el formulario · revisa y guarda', 'ok');
      formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  async function handleDelete(idx: number) {
    const row = data.find((item) => item._idx === idx);
    if (!row || row.Tipo === 'Saldo Inicial') return;
    if (!window.confirm(`¿Borrar este movimiento?\n\n${fd(row.Fecha)} · ${row.Tipo} · ${row.Concepto} · ${money(row.Total, currency)}\n\nSi es una transferencia, también se borrará la otra cuenta.`)) return;
    try {
      const result = await deleteMovement(account, idx);
      if (!result.ok) {
        showToast(result.error || 'Error al borrar', 'err');
        return;
      }
      showToast(`Borrado · Saldo: ${money(result.saldo, currency)}`, 'ok');
      afterMutation();
    } catch {
      showToast('Error de conexión', 'err');
    }
  }

  return (
    <div className={`bottom-grid ${hasSidePanels ? 'has-side-panels' : ''}`}>
      <div className="section section-raised">
        <div className="section-head">
          <span className="section-title">
            Movimientos · <span className="mov-count">{countLabel}</span>
          </span>
        </div>
        <MovimientosSearch kind={kind} data={data} search={search} onChange={setSearch} />
        <div className="table-scroll table-scroll-y">
          <MovimientosTable
            rows={movs}
            currency={currency}
            onFilterByConcept={(concepto) => setSearch((s) => ({ ...s, concepto }))}
            onDuplicate={canAddMovement ? handleDuplicate : undefined}
            onEdit={setEditingIdx}
            onDelete={handleDelete}
          />
        </div>
      </div>

      {hasSidePanels && (
        <div className="movement-side-panels">
          {canAddMovement && (
            <div className="section section-raised" ref={formSectionRef}>
              <div className="section-head">
                <span className="section-title">Añadir movimiento</span>
              </div>
              <AddMovementForm ref={formRef} account={account} kind={kind} currency={currency} data={data} onSaved={afterMutation} />
            </div>
          )}
          {canShowMovementTotal && (
            <MovementTotalPanel account={account} kind={kind} currency={currency} data={data} />
          )}
        </div>
      )}

      <EditMovementModal
        idx={editingIdx}
        account={account}
        kind={kind}
        currency={currency}
        data={data}
        onClose={() => setEditingIdx(null)}
        onSaved={afterMutation}
      />
    </div>
  );
}
