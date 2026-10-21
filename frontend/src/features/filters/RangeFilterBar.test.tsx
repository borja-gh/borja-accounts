import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RangeFilterBar } from './RangeFilterBar';

describe('RangeFilterBar', () => {
  it('limita gastos por concepto a histórico y este mes', () => {
    const onChange = vi.fn();
    render(
      <RangeFilterBar
        data={[]}
        filter={{ type: 'all' }}
        onChange={onChange}
        allLabel="Histórico"
        oneMonthLabel="Este mes"
        historicalAndCurrentMonthOnly
      />,
    );

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Histórico', 'Este mes']);
    fireEvent.click(screen.getByRole('button', { name: 'Este mes' }));
    expect(onChange).toHaveBeenCalledWith({ type: '1m' });
  });
});
