import { useEffect, useRef, useState } from 'react';
import { monthLabel } from './monthLabel';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function yearOptions(): string[] {
  const now = new Date().getFullYear();
  return Array.from({ length: 8 }, (_, i) => String(now - 6 + i));
}

interface MonthInputProps {
  value: string;
  onChange: (value: string) => void;
}

// Dos <select> (mes + año) en vez de <input type="month"> -- el value
// real que llegaba al backend con el input nativo fue "03/26" en vez de
// "2026-03" (ver logs), y el 400 resultante rompía el front porque
// KpiDelta leía delta.diff de un payload de error. Un <select> no admite
// ese formato ambiguo y funciona igual en cualquier navegador.
function MonthInput({ value, onChange }: MonthInputProps) {
  const [year = '', month = ''] = value ? value.split('-') : [];
  const years = yearOptions();
  const currentYear = String(new Date().getFullYear());

  return (
    <div className="month-input-wrap">
      <select value={month} onChange={(e) => onChange(`${year || currentYear}-${e.target.value}`)}>
        <option value="" disabled>
          Mes
        </option>
        {MESES.map((label, i) => (
          <option key={label} value={String(i + 1).padStart(2, '0')}>
            {label}
          </option>
        ))}
      </select>
      <select value={year} onChange={(e) => onChange(`${e.target.value}-${month || '01'}`)}>
        <option value="" disabled>
          Año
        </option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
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
            <button className="btn btn-ghost btn-compact" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button
              className="btn btn-primary btn-compact"
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
