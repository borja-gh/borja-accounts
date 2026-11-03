import { describe, expect, it } from 'vitest';
import { parseDecimal } from './math';

describe('parseDecimal', () => {
  it.each([
    ['285,39', 285.39], ['285.39', 285.39],
    ['6,2616', 6.2616], ['6.2616', 6.2616],
    ['0,35', 0.35], ['0.35', 0.35],
    ['0', 0], ['-1,25', -1.25], [' 1,0875 ', 1.0875],
    [',5', 0.5], ['.5', 0.5], ['1e-4', 0.0001],
  ])('interpreta %s como %s', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it.each(['', ' ', ',', '.', '12abc', '1,2,3', '1.2.3', '1.234,56', '1,234.56', 'Infinity', '1e999', '0x10'])(
    'rechaza %s sin truncar el importe', (input) => {
      expect(parseDecimal(input)).toBeNaN();
    },
  );
});
