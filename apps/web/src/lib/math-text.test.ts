import { describe, expect, it } from 'vitest';
import { splitMath } from './math-text';

describe('splitMath', () => {
  it('finds inline and display formulas and chemistry', () => {
    expect(splitMath('Use $a^2 + b^2 = c^2$ here.')).toEqual([{ math: false, text: 'Use ' }, { math: true, tex: 'a^2 + b^2 = c^2', display: false }, { math: false, text: ' here.' }]);
    expect(splitMath('$$\\int_0^1 x\\,dx$$')).toEqual([{ math: true, tex: '\\int_0^1 x\\,dx', display: true }]);
    expect(splitMath('So \\(x>1\\) and \\[y=2\\]').map((p) => (p.math === true ? `${p.display ? 'D' : 'I'}:${p.tex}` : p.text))).toEqual(['So ', 'I:x>1', ' and ', 'D:y=2']);
    expect(splitMath('Water is \\ce{H2O}, burning: $\\ce{CH4 + 2O2 -> CO2 + 2H2O}$.').filter((p) => p.math).map((p) => p.math && p.tex)).toEqual(['\\ce{H2O}', '\\ce{CH4 + 2O2 -> CO2 + 2H2O}']);
  });

  it('leaves money and lone dollar signs as text', () => {
    expect(splitMath('It costs $5 and $10 later.')).toEqual([{ math: false, text: 'It costs $5 and $10 later.' }]);
    expect(splitMath('Pay $ 20 now')).toEqual([{ math: false, text: 'Pay $ 20 now' }]);
    expect(splitMath('$x$')).toEqual([{ math: true, tex: 'x', display: false }]);
  });
});
