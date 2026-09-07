import { THEMES, type ThemeName } from '../../styles/themes';

interface Props {
  value: ThemeName;
  onChange: (theme: ThemeName) => void;
}

// Swatches sin texto visible (solo aria-label) a propósito: los tests de
// golden master comparan el texto visible renderizado
// (frontend/src/test/extractVisibleText.ts), y este picker no forma parte
// de ese contrato -- ver docs/ARCHITECTURE.md §9.
export function ThemePicker({ value, onChange }: Props) {
  return (
    <div className="theme-picker" role="radiogroup" aria-label="Tema de la cuenta">
      {(Object.keys(THEMES) as ThemeName[]).map((name) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={value === name}
          aria-label={name}
          className={`theme-swatch ${value === name ? 'active' : ''}`}
          style={{ background: THEMES[name].accent }}
          onClick={() => onChange(name)}
        />
      ))}
    </div>
  );
}
