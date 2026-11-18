import { useEffect, useState } from 'react';
import { renamePortfolio } from '../../api/client';
import type { AccountId } from '../../api/types';
import { useToast } from '../../components/ToastContext';

interface Props {
  account: AccountId;
  portfolio: string;
  onClose: () => void;
  onRenamed: () => void;
}

export function RenamePortfolioModal({ account, portfolio, onClose, onRenamed }: Props) {
  const [name, setName] = useState(portfolio);
  const [submitting, setSubmitting] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit() {
    const newName = name.trim();
    if (!newName) {
      showToast('Introduce el nombre de la cartera', 'err');
      return;
    }
    if (newName === portfolio) {
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      const result = await renamePortfolio(account, { portfolio, newName });
      if (!result.ok) {
        showToast(result.error || 'Error al renombrar la cartera', 'err');
        return;
      }
      onClose();
      showToast(`Cartera renombrada a ${newName}`, 'ok');
      onRenamed();
    } catch {
      showToast('Error de conexión', 'err');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="overlay on">
      <div className="modal">
        <h3>Renombrar cartera</h3>
        <div className="fg">
          <label>Nombre</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <p className="hint-total" style={{ minHeight: 0, marginBottom: 12 }}>
          El cambio afecta a todos los lotes de la cartera, abiertos y cerrados.
        </p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            Guardar nombre
          </button>
        </div>
      </div>
    </div>
  );
}
