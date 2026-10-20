import type { KeyboardEvent } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function DateTimeField({ value, onChange, className }: Props) {
  const [date = '', time = '00'] = value.replace(' ', 'T').split('T');
  const hour = time.slice(0, 2).padStart(2, '0');

  function closeOnEnter(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  return (
    <div className="date-time-field">
      <input
        type="date"
        className={className}
        value={date}
        onChange={(event) => onChange(`${event.target.value}T${hour}:00`)}
        onKeyDown={closeOnEnter}
      />
      <select
        className="date-time-hour"
        aria-label="Hora (24 horas)"
        value={hour}
        onChange={(event) => onChange(`${date}T${event.target.value}:00`)}
        onKeyDown={closeOnEnter}
      >
        {Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0')).map((option) => (
          <option key={option} value={option}>{option}:00</option>
        ))}
      </select>
    </div>
  );
}
