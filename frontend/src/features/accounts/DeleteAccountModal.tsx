import { useEffect, useState } from 'react';
import { deleteAccount } from '../../api/client';
import type { AccountSummary } from '../../api/types';
import { useToast } from '../../components/ToastContext';

interface Props {
  account: AccountSummary;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteAccountModal({ account, open, onClose, onDeleted }: Props) {
  const [confirmName, setConfirmName] = useState('');
  const showToast = useToast();

  useEffect(() => {
    if (open) setConfirmName('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canConfirm = confirmName.trim() === account.name;

  async function handleConfirm() {
    if (!canConfirm) return;
    try {
      const result = await deleteAccount(account.id);
      if (!result.ok) {
        showToast(result.error || 'Error al eliminar la cuenta', 'err');
        return;
      }
      onClose();
      showToast(`Cuenta "${account.name}" eliminada`, 'ok');
      onDeleted();
    } catch {
      showToast('Error de conexión', 'err');
    }
  }

  return (
    <div className="overlay on">
      <div className="modal">
        <h3>Eliminar cuenta</h3>
        <p>
          Esto borra «{account.name}» y todo su histórico
          {account.kind === 'INVESTMENT' ? ' (movimientos y carteras)' : ' de movimientos'} de forma permanente.
        </p>
        <div className="fg">
          <label>Escribe «{account.name}» para confirmar</label>
          <input type="text" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-danger" disabled={!canConfirm} onClick={handleConfirm}>
            Eliminar cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
