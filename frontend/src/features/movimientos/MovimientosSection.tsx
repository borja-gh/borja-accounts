import { useRef, useState } from 'react';
import { deleteLastMovement } from '../../api/client';
import type { AccountId, AccountKind, Movement } from '../../api/types';
import { useToast } from '../../components/ToastContext';
import { fd, money } from '../../lib/format';
import { AddMovementForm, type AddMovementFormHandle } from './AddMovementForm';
import { EditMovementModal } from './EditMovementModal';
import { MovimientosSearch } from './MovimientosSearch';
import { MovimientosTable } from './MovimientosTable';
import { EMPTY_SEARCH, isSearchActive, searchedMovs, type MovSearch } from './search';

interface Props {
  account: AccountId;
  kind: AccountKind;
  currency: string;
  data: Movement[];
  onDataChanged: () => void;
}

export function MovimientosSection({ account, kind, currency, data, onDataChanged }: Props) {
  const [search, setSearch] = useState<MovSearch>(EMPTY_SEARCH);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const formRef = useRef<AddMovementFormHandle>(null);
  const formSectionRef = useRef<HTMLDivElement>(null);
  const showToast = useToast();

  const movs = searchedMovs(data, search);
  const countLabel = isSearchActive(search) ? `${movs.length} resultado(s)` : 'Últimos 20';

  function afterMutation() {
    onDataChanged();
  }

  function handleRepeatLast() {
    // Filtra filas sin _idx (carteras de holdings fusionadas por
    // build_investment_ledger, ver GET /api/data/{cuenta}) -- no son
    // movimientos reales editables/repetibles.
    const sorted = data.filter((r) => r._idx != null).sort((a, b) => a.Fecha.localeCompare(b.Fecha));
    const last = sorted.at(-1);
    if (!last || last.Tipo === 'Saldo Inicial') {
      showToast('No hay movimiento que repetir', 'err');
      return;
    }
    if (formRef.current?.fillFrom(last)) showToast('Formulario rellenado · revisa y guarda', 'ok');
  }

  function handleDuplicate(idx: number) {
    const row = data.find((r) => r._idx === idx);
    if (!row || row.Tipo === 'Saldo Inicial') return;
    if (formRef.current?.fillFrom(row)) {
      showToast('Duplicado en el formulario · revisa y guarda', 'ok');
      formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  async function handleDeleteLast() {
    // El backend (DeleteMovementUseCase) siempre borra el último movimiento
    // real -- filtra las filas sin _idx (holdings fusionadas) para que el
    // diálogo de confirmación muestre exactamente lo que se va a borrar.
    const sorted = data.filter((r) => r._idx != null).sort((a, b) => a.Fecha.localeCompare(b.Fecha));
    const last = sorted.at(-1);
    if (!last) return;
    if (!window.confirm(`¿Borrar el último movimiento?\n\n${fd(last.Fecha)} · ${last.Tipo} · ${last.Concepto} · ${money(last.Total, currency)}`)) return;
    try {
      const body = await deleteLastMovement(account);
      if (!body.ok) {
        showToast(body.error || 'Error al borrar', 'err');
        return;
      }
      showToast(`Borrado · Saldo: ${money(body.saldo, currency)}`, 'ok');
      afterMutation();
    } catch {
      showToast('Error de conexión', 'err');
    }
  }

  return (
    <div className="bottom-grid">
      <div className="section section-raised">
        <div className="section-head">
          <span className="section-title">
            Movimientos · <span className="mov-count">{countLabel}</span>
          </span>
          <div className="section-head-actions">
            <button
              className="btn btn-ghost btn-compact"
              onClick={handleRepeatLast}
              title="Rellena el formulario con el último movimiento"
            >
              Repetir último
            </button>
            <button className="btn btn-danger btn-compact" onClick={handleDeleteLast}>
              Borrar último
            </button>
          </div>
        </div>
        <MovimientosSearch kind={kind} data={data} search={search} onChange={setSearch} />
        <div className="table-scroll table-scroll-y">
          <MovimientosTable
            rows={movs}
            currency={currency}
            onFilterByConcept={(concepto) => setSearch((s) => ({ ...s, concepto }))}
            onDuplicate={handleDuplicate}
            onEdit={setEditingIdx}
          />
        </div>
      </div>

      <div className="section section-raised" ref={formSectionRef}>
        <div className="section-head">
          <span className="section-title">Añadir movimiento</span>
        </div>
        <AddMovementForm ref={formRef} account={account} kind={kind} currency={currency} data={data} onSaved={afterMutation} />
      </div>

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
