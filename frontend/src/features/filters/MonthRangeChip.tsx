import { useEffect, useRef, useState } from 'react';
import { monthLabel } from './monthLabel';

interface MonthInputProps {
  value: string;
  onChange: (value: string) => void;
}

function MonthInput({ value, onChange }: MonthInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="month-input-wrap">
      <input ref={ref} type="month" className="date-input" value={value} onChange={(e) => onChange(e.target.value)} />
      <button
        type="button"
        className="month-input-cal"
        aria-label="Abrir calendario"
        onClick={() => ref.current?.showPicker?.()}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" />
          <path d="M1.5 6h13M4.5 1v2.5M11.5 1v2.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

interface Props {
  active: boolean;
  fromYm?: string;
  toYm?: string;
  onApply: (fromYm: string, toYm: string) => void;
}

// Chip que abre un popover con "Desde"/"Hasta" (mes+año) y un botón
// Aplicar -- reemplaza los dos <input type="month"> sueltos que se
// aplicaban en cada tecla (UX confusa: refetch a mitad de selección).
// Compartido entre RangeFilterBar (gráficos/rankings) y PeriodSelector
// (KPIs), que necesitan el mismo control de rango libre por separado.
export function MonthRangeChip({ active, fromYm, toYm, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(fromYm ?? '');
  const [draftTo, setDraftTo] = useState(toYm ?? '');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function openPopover() {
    setDraftFrom(fromYm ?? '');
    setDraftTo(toYm ?? '');
    setOpen(true);
  }

  function apply() {
    if (!draftFrom || !draftTo || draftFrom > draftTo) return;
    onApply(draftFrom, draftTo);
    setOpen(false);
  }

  const canApply = !!draftFrom && !!draftTo && draftFrom <= draftTo;
  const label = active && fromYm && toYm ? `${monthLabel(fromYm)} — ${monthLabel(toYm)}` : 'Personalizado';

  return (
    <div className="range-popover-wrap" ref={wrapRef}>
      <button className={`fbtn ${active ? 'active' : ''}`} onClick={() => (open ? setOpen(false) : openPopover())}>
        {label}
      </button>
      {open && (
        <div className="range-popover">
          <div className="range-popover-row">
            <label>Desde</label>
            <MonthInput value={draftFrom} onChange={setDraftFrom} />
          </div>
          <div className="range-popover-row">
            <label>Hasta</label>
            <MonthInput value={draftTo} onChange={setDraftTo} />
          </div>
          <div className="range-popover-actions">
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '5px 12px' }}
              disabled={!canApply}
              onClick={apply}
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
