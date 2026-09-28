import { useCallback, useEffect, useState } from 'react';
import { updateAccountView } from '../../api/client';
import type { AccountKind } from '../../api/types';
import { useToast } from '../../components/ToastContext';
import { defaultVisiblePanels, VIEW_PANELS } from './viewPanels';

interface Props {
  accountId: string;
  kind: AccountKind;
  visiblePanels?: string[] | null;
  onSaved: () => void;
}

export function ViewCustomizer({ accountId, kind, visiblePanels, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  if (!open) {
    return (
      <button className="btn btn-ghost btn-compact" type="button" onClick={() => setOpen(true)}>
        Personalizar vista
      </button>
    );
  }

  return (
    <ViewCustomizerDialog
      key={accountId}
      accountId={accountId}
      kind={kind}
      visiblePanels={visiblePanels}
      onClose={close}
      onSaved={onSaved}
    />
  );
}

interface DialogProps extends Props {
  onClose: () => void;
}

function ViewCustomizerDialog({ accountId, kind, visiblePanels, onClose, onSaved }: DialogProps) {
  const [selected, setSelected] = useState<string[]>(visiblePanels ?? defaultVisiblePanels(kind));
  const [saving, setSaving] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggle(panelId: string) {
    setSelected((current) => current.includes(panelId)
      ? current.filter((id) => id !== panelId)
      : [...current, panelId]);
  }

  async function save() {
    setSaving(true);
    try {
      const result = await updateAccountView(accountId, selected);
      if (!result.ok) {
        showToast(result.error || 'No se pudo guardar la vista', 'err');
        return;
      }
      onClose();
      showToast('Vista guardada', 'ok');
      onSaved();
    } catch {
      showToast('Error de conexión', 'err');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay on" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="modal view-customizer" role="dialog" aria-modal="true" aria-labelledby="view-customizer-title">
        <h3 id="view-customizer-title">Personalizar vista</h3>
        <p className="view-customizer-copy">Elige qué paneles mostrar en esta cuenta. La cabecera y los movimientos siempre estarán visibles.</p>
        <div className="view-customizer-list-label">Paneles disponibles</div>
        <div className="view-customizer-options">
          {VIEW_PANELS[kind].map(({ id, label }) => (
            <label className="view-customizer-option" key={id}>
              <span>{label}</span>
              <input
                type="checkbox"
                checked={selected.includes(id)}
                onChange={() => toggle(id)}
                aria-label={label}
              />
            </label>
          ))}
        </div>
        <div className="modal-actions view-customizer-actions">
          <button
            className="btn btn-ghost view-customizer-reset"
            type="button"
            onClick={() => setSelected(defaultVisiblePanels(kind))}
            disabled={saving}
          >
            Restaurar predeterminada
          </button>
          <div className="view-customizer-confirm-actions">
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
