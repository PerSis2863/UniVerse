import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { inline } from './values';

const run = (code: string) => { let out = ''; const lab = new Lab({ out: (t) => { out += t; } }); lab.run(code); return { out, lab, v: (n: string) => inline(lab.vars.get(n)!, { long: true }) }; };

describe('UniVerse Lab: the language (M374)', () => {
  it('does arithmetic with MATLAB’s precedence', () => {
    expect(run('x = -2^2 + 3*4/2;').v('x')).toBe('2');
    expect(run('x = 2^-1;').v('x')).toBe('0.500000000000000');
    expect(run('a = 1:5; b = a(end) - a(2);').v('b')).toBe('3');
  });
  it('builds matrices with spaces, commas, semicolons and new lines', () => {
    const r = run('A = [1 2; 3 4]; B = [1 -2]; C = [1 - 2]; D = [1, 2\n3, 4];');
    expect(r.v('B')).toBe('[1 -2]');
    expect(r.v('C')).toBe('-1');
    expect(r.v('D')).toBe('2x2 double');
    expect(r.out).toBe('');
  });
  it('multiplies, solves and transposes matrices', () => {
    const r = run("A = [2 1; 1 3]; b = [3; 5]; x = A\\b; y = round((A*x)' * 1e9) / 1e9; d = round(det(A) * 1e9) / 1e9; I = inv(A)*A;");
    expect(r.v('y')).toBe('[3 5]');
    expect(r.v('d')).toBe('5');
    expect(run('A = [2 1; 1 3]; x = A\\[3; 5]; e = abs(x(1) - 0.8) < 1e-12;').v('e')).toBe('1');
  });
  it('expands rows and columns implicitly', () => {
    expect(run("M = (1:3)' + (1:2); s = size(M);").v('s')).toBe('[3 2]');
  });
  it('indexes, grows, deletes and uses end and logical masks', () => {
    const r = run('x = []; for k = 1:4, x(k) = k^2; end; x(end+1) = 0; y = x(x > 4); x(2) = []; A = magic(3); r = A(2, :); c = A(:, end);');
    expect(r.v('x')).toBe('[1 9 16 0]');
    expect(r.v('y')).toBe('[9 16]');
    expect(r.v('r')).toBe('[3 5 7]');
  });
  it('runs if, while, switch, try and functions with several outputs', () => {
    const r = run([
      'function [s, p] = sp(a, b)', '  s = a + b; p = a * b;', 'end',
      '[s, p] = sp(3, 4);',
      'n = 0; while true, n = n + 1; if n >= 5, break; end, end',
      "switch 'b', case {'a', 'b'}, w = 1; otherwise, w = 2; end",
      "try, error('bad %d', 7); catch err, m = err.message; end",
    ].join('\n'));
    expect([r.v('s'), r.v('p'), r.v('n'), r.v('w'), r.v('m')]).toEqual(['7', '12', '5', '1', "'bad 7'"]);
  });
  it('makes handles that keep their variables, and maps them over arrays', () => {
    const r = run('k = 3; f = @(x) k*x.^2; k = 10; y = f(2); z = arrayfun(@(t) t + 1, [1 2 3]); q = integral(@(x) x.^2, 0, 3);');
    expect([r.v('y'), r.v('z')]).toEqual(['12', '[2 3 4]']);
    expect(Math.abs(Number(r.v('q')) - 9)).toBeLessThan(1e-8);
  });
  it('prints results as MATLAB does, and text with sprintf', () => {
    expect(run('x = 3').out).toBe('x = 3\n');
    expect(run('pi').out).toBe('ans = 3.1416\n');
    expect(run("fprintf('%d apples, %.2f each\\n', 3, 0.5)").out).toBe('3 apples, 0.50 each\n');
    expect(run("s = ['ab', 'cd'];").v('s')).toBe("'abcd'");
  });
  it('fits polynomials and solves ODEs', () => {
    const r = run('p = polyfit([0 1 2], [1 3 5], 1); r = round(p * 1e8) / 1e8; [t, y] = ode45(@(t, y) -y, [0 1], 1); e = abs(y(end) - exp(-1)) < 1e-3;');
    expect(r.v('r')).toBe('[2 1]');
    expect(r.v('e')).toBe('1');
  });
  it('explains mistakes plainly', () => {
    expect(() => run('x = [1 2] * [3 4];')).toThrow(/inner sizes must match/);
    expect(() => run('y = sinn(1);')).toThrow(/Did you mean “sin”/);
    expect(() => run('if 1\n x = 2;')).toThrow(/needs an “end”/);
  });
});
