import { useState } from 'react';
import { updateAccountView } from '../../api/client';
import type { AccountKind } from '../../api/types';
import { useToast } from '../../components/ToastContext';
import { defaultVisiblePanels } from './viewPanels';

interface Props {
  accountId: string;
  kind: AccountKind;
  visiblePanels?: string[] | null;
  onSaved: () => void;
}

export function AssistantVisibilityToggle({ accountId, kind, visiblePanels, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const showToast = useToast();
  const current = visiblePanels ?? defaultVisiblePanels(kind);
  const isVisible = current.includes('assistant');

  async function toggle() {
    setSaving(true);
    const next = isVisible
      ? current.filter((panel) => panel !== 'assistant')
      : [...current, 'assistant'];
    try {
      const result = await updateAccountView(accountId, next);
      if (!result.ok) {
        showToast(result.error || 'No se pudo actualizar la vista del asistente', 'err');
        return;
      }
      onSaved();
    } catch {
      showToast('Error de conexión', 'err');
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      className="btn btn-ghost btn-compact"
      type="button"
      onClick={toggle}
      disabled={saving}
      aria-label={`${isVisible ? 'Ocultar' : 'Mostrar'} agente para esta cuenta`}
    >
      {saving ? 'Guardando…' : `${isVisible ? 'Ocultar' : 'Mostrar'} agente`}
    </button>
  );
}
