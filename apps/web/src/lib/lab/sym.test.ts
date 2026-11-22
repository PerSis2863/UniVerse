import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { inline, plainOf } from './values';
import { Graphics } from './plot';

// M396: symbolic maths in Hyperion, through the language as people type it.
const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out: plainOf(out), raw: out, graphics, v: (n: string) => inline(lab.vars.get(n)!, { long: true }) }; };
const v = (code: string, name = 'y') => run(code).v(name);

describe('Hyperion: symbolic maths (M396)', () => {
  it('makes symbols with syms and sym, and keeps expressions tidy', () => {
    expect(v('syms x y\ny = (x + 1)^2 - (x + 1)^2 + 2*x*x;')).toBe('2*x^2');
    expect(v("x = sym('x'); y = x/2 + x/3;")).toBe('5*x/6');
    expect(v('y = sym(1/3) + sym(1/6);')).toBe('1/2');
    expect(v('y = sym(pi)/2;')).toBe('pi/2');
    expect(v('y = sqrt(sym(8));')).toBe('2*2^(1/2)');
    expect(v("a = sym('a', [1 3]); y = sum(a);")).toBe('a1 + a2 + a3');
  });
  it('differentiates, integrates and simplifies', () => {
    expect(v('syms x\ny = diff(sin(x)^2);')).toBe('2*cos(x)*sin(x)');
    expect(v('syms x\ny = diff(x^3, x, 2);')).toBe('6*x');
    expect(v('syms x\ny = int(x*exp(x));')).toBe('(x - 1)*exp(x)');
    expect(v('syms x\ny = int(1/(1 + x^2));')).toBe('atan(x)');
    expect(v('syms x\ny = int(x^2, 0, 3);')).toBe('9');
    expect(v('syms x\ny = int(exp(-x), x, 0, Inf);')).toBe('1');
    expect(v('syms x\ny = simplify(sin(x)^2 + cos(x)^2);')).toBe('1');
    expect(v('syms x\ny = simplify((x^2 - 1)/(x - 1));')).toBe('x + 1');
    expect(v('syms x y\ny = expand((x + y)^3);')).toBe('x^3 + 3*x^2*y + 3*x*y^2 + y^3');
    expect(run('syms x\ny = factor(x^3 - x)').out).toBe('y =\n\n[x, x - 1, x + 1]\n\n');
  });
  it('solves equations and systems', () => {
    const r = run('syms x\ns = solve(x^2 - 5*x + 6 == 0); a = s(1); b = s(2);');
    expect([r.v('a'), r.v('b')]).toEqual(['2', '3']);
    expect(v('syms x\ny = solve(x^2 == 2, x); y = y(2);')).toBe('2^(1/2)');
    const sys = run('syms x y\n[a, b] = solve([x + y == 3, x - y == 1], [x, y]);');
    expect([sys.v('a'), sys.v('b')]).toEqual(['2', '1']);
    const st = run('syms x y\nS = solve([x + 2*y == 4, 3*x - y == 5]); p = S.x; q = S.y;');
    expect([st.v('p'), st.v('q')]).toEqual(['2', '1']);
  });
  it('takes limits, series, sums and substitutes values', () => {
    expect(v('syms x\ny = limit(sin(x)/x, x, 0);')).toBe('1');
    expect(v('syms x\ny = limit((1 + 1/x)^x, x, Inf);')).toBe('exp(1)');
    expect(v('syms x\ny = taylor(exp(x), x, \'Order\', 4);')).toBe('x^3/6 + x^2/2 + x + 1');
    expect(v('syms k n\ny = symsum(k, k, 1, n);')).toBe('n*(n + 1)/2');
    expect(v('syms k\ny = symsum(1/k^2, k, 1, Inf);')).toBe('pi^2/6');
    expect(v('syms x\nf = x^2 + 1; y = subs(f, x, 3);')).toBe('10');
    expect(v('syms x\nf = x^2; y = double(subs(f, x, sqrt(2)));')).toBe('2');
    expect(v('syms x\ny = vpa(sqrt(sym(2)), 6);')).toBe('1.41421');
  });
  it('shows results as text and as typeset maths, and turns them into functions', () => {
    const r = run('syms x\ny = x^2/2');
    expect(r.out).toBe('y =\n\nx^2/2\n\n');
    expect(r.raw).toContain('\\frac{x^{2}}{2}');
    expect(v("syms x\ny = latex(sqrt(x));")).toBe("'\\sqrt{x}'");
    expect(v('syms x\nf = matlabFunction(x^2 + 1); y = f(3);')).toBe('10');
    expect(v('syms x y\nf = matlabFunction(x*y); y = f(2, 5);')).toBe('10');
    const g = run('syms x\nfplot(sin(x), [0 pi]);').graphics;
    expect(g.current?.axes.size).toBe(1);
  });
  it('works with symbolic matrices', () => {
    expect(v('syms a b c d\nA = [a b; c d]; y = det(A);')).toBe('a*d - b*c');
    expect(v('syms t\nA = [t 0; 0 2*t]; B = A*A; y = B(2, 2);')).toBe('4*t^2');
    expect(v('syms x y\nJ = jacobian([x*y, x + y], [x, y]); y = J(1, 1);')).toBe('y');
    expect(v('A = sym([2 0; 0 3]); e = eig(A); y = e(2);')).toBe('3');
  });
  it('explains what it can’t do', () => {
    expect(() => run('syms x\ny = double(x + 1);')).toThrow(/still has x/);
    expect(() => run('syms f(x)')).toThrow(/Symbolic functions/);
  });
});
