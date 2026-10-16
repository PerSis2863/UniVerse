import { describe, expect, it } from 'vitest';
import { evaluate, parseExpr, plain, sameExpr, toLatex } from './math-expr';

const same = (a: string, b: string) => { const x = parseExpr(a), y = parseExpr(b); return !!x && !!y && sameExpr(x, y); };

describe('maths answers', () => {
  it('reads what students type', () => {
    expect(evaluate(parseExpr('2x^2 + 3x')!, { x: 2 })).toBe(14);
    expect(evaluate(parseExpr('-x^2')!, { x: 3 })).toBe(-9);
    expect(evaluate(parseExpr('2^-1')!, {})).toBe(0.5);
    expect(evaluate(parseExpr('2(x+1)')!, { x: 1 })).toBe(4);
    expect(evaluate(parseExpr('|x - 5|')!, { x: 2 })).toBe(3);
    expect(evaluate(parseExpr('sqrt(16) + sin(0)')!, {})).toBe(4);
    expect(evaluate(parseExpr('3 × 4 ÷ 2 − 1')!, {})).toBe(5);
    expect(evaluate(parseExpr('x²')!, { x: 3 })).toBe(9);
  });
  it('reads LaTeX', () => {
    expect(plain('\\frac{1}{2}x^{2}')).toBe('((1)/(2))x^(2)');
    expect(evaluate(parseExpr('\\frac{1}{2}x^{2}')!, { x: 4 })).toBe(8);
    expect(evaluate(parseExpr('\\sqrt[3]{27}')!, {})).toBeCloseTo(3);
    expect(evaluate(parseExpr('\\left(a+b\\right)\\cdot c')!, { a: 1, b: 2, c: 3 })).toBe(9);
    expect(evaluate(parseExpr('x_1 + x_2')!, { x1: 1, x2: 2 })).toBe(3);
    expect(evaluate(parseExpr('2\\pi r')!, { r: 1 })).toBeCloseTo(2 * Math.PI);
  });
  it('says when two answers are the same expression', () => {
    expect(same('(x+1)^2', 'x^2 + 2x + 1')).toBe(true);
    expect(same('x^2 + 2x', 'x(x+2)')).toBe(true);
    expect(same('\\frac{x}{2}', '0.5x')).toBe(true);
    expect(same('1/2', '0.5')).toBe(true);
    expect(same('xy', 'yx')).toBe(true);
    expect(same('sqrt(x^2)', '|x|')).toBe(true);
    expect(same('(x+1)^2', 'x^2 + 1')).toBe(false);
    expect(same('xy', 'x^2')).toBe(false);
    expect(same('x', 'y')).toBe(false);
    expect(same('2', '3')).toBe(false);
  });
  it('turns away what it can’t read', () => {
    for (const bad of ['', '2 +', '(x', 'x)', '\\foo{x}', 'x = 2', '\\frac{1}', 'a'.repeat(300)]) expect(parseExpr(bad), bad).toBeNull();
    // Very deep nesting stops instead of running out of stack.
    expect(parseExpr('('.repeat(150) + 'x' + ')'.repeat(150))).toBeNull();
  });
  it('shows the answer back in maths notation', () => {
    expect(toLatex(parseExpr('1/2 x^2')!)).toBe('\\frac{1}{2} x^{2}');
    expect(toLatex(parseExpr('sqrt(x+1)')!)).toBe('\\sqrt{x + 1}');
    expect(toLatex(parseExpr('(a+b)^2')!)).toBe('\\left(a + b\\right)^{2}');
  });
});
