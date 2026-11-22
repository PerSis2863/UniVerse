import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { inline } from './values';

const run = (code: string) => { let out = ''; const lab = new Lab({ out: (t) => { out += t; } }); lab.run(code); return { out, lab, v: (n: string) => inline(lab.vars.get(n)!, { long: true }) }; };

describe('Hyperion: the language (M374)', () => {
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

describe('Hyperion: complex numbers (M377)', () => {
  it('reads, computes and prints complex numbers', () => {
    expect(run('z = 3 + 4i').out).toBe('z = 3 + 4i\n');
    expect(run('a = abs(3 + 4i);').v('a')).toBe('5');
    expect(run('s = sqrt(-4)').out).toBe('s = 0 + 2i\n');
    expect(run('p = (1 + 2i) * (3 - 1i)').out).toBe('p = 5 + 5i\n');
    expect(run("w = [1+1i 2-1i]'; c = w(2)").out).toBe('c = 2 + 1i\n');
    expect(run('e = exp(1i*pi); r = round(real(e)); ok = abs(imag(e)) < 1e-12;').v('r')).toBe('-1');
  });
  it('finds complex roots and eigenvalues', () => {
    expect(run('r = roots([1 0 1])').out).toBe('r =\n\n  0 + 1i\n  0 - 1i\n\n');
    expect(run('r = roots([1 -3 2]);').v('r')).toBe('2x1 double');
    const ev = run('e = eig([0 -1; 1 0]); a = abs(e);');
    expect(ev.v('a')).toBe('2x1 double');
    expect(run('x = [2 1i; -1i 3] \\ [1; 1]; ok = norm(abs([2 1i; -1i 3] * x - [1; 1])) < 1e-12;').v('ok')).toBe('1');
  });
});
describe('Hyperion: powers of negatives (M377)', () => {
  it('gives the complex principal root', () => {
    expect(run('k = (-8)^(1/3)').out).toBe('k = 1.0000 + 1.7321i\n');
  });
});

describe('Hyperion: signals and statistics (M378)', () => {
  it('transforms any length and back', () => {
    expect(run('X = fft([1 2 3 4]);').v('X')).toBe('1x4 complex double');
    expect(run('X = fft([1 2 3 4]); a = real(X(1)); b = round(abs(X(2)) * 1e9) / 1e9;').v('b')).toBe('2.828427125000000');
    expect(run('x = [3 1 4 1 5]; y = ifft(fft(x)); ok = max(abs(y - x)) < 1e-12;').v('ok')).toBe('1');
    expect(run('X = fft([1 0 0], 4); n = numel(X);').v('n')).toBe('4');
  });
  it('filters, convolves and correlates', () => {
    expect(run('y = filter(1, [1 -0.5], [1 0 0 0]);').v('y')).toBe('[1 0.500000000000000 0.250000000000000 0.125000000000000]');
    expect(run('[q, r] = deconv([1 5 6], [1 2]);').v('q')).toBe('[1 3]');
    expect(run('m = movmean([1 2 3 4 5], 3);').v('m')).toBe('[1.500000000000000 2 3 4 4.500000000000000]');
  });
  it('describes data', () => {
    expect(run('c = corrcoef([1 2 3 4], [2 4 6 8]); r = round(c(1, 2) * 1e12) / 1e12;').v('r')).toBe('1');
    expect(run('p = prctile([1 2 3 4], 50);').v('p')).toBe('2.500000000000000');
    expect(run('v = round(normcdf(1.96) * 1e4) / 1e4;').v('v')).toBe('0.975000000000000');
    expect(run('z = round(norminv(0.975) * 1e4) / 1e4;').v('z')).toBe('1.960000000000000');
    expect(run('s = round(spline(0:3, [0 1 8 27], 1.5) * 1e6) / 1e6;').v('s')).toBe('3.375000000000000');
  });
});
