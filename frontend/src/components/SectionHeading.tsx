import type { ReactNode } from 'react';

interface Props {
  title: string;
  actions?: ReactNode;
}

// Divisor tipográfico entre los grandes bloques de una vista de cuenta
// (Resumen general / Desglose / Apuestas / Movimientos) -- la barra usa
// --accent, que ya cambia por tipo de cuenta (CASH/INVESTMENT), así el
// divisor hereda la identidad visual de la cuenta sin lógica propia.
export function SectionHeading({ title, actions }: Props) {
  return (
    <div className="dash-heading">
      <span className="dash-heading-bar" />
      <h3 className="dash-heading-title">{title}</h3>
      {actions && <div className="dash-heading-actions">{actions}</div>}
    </div>
  );
}
