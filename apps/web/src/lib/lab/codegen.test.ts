import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { FileStore } from './files';
import { toMat } from './values';
import './codegen-lab';
import * as X from './fixed';
import * as Fx from './fixed';

const SRC = `function [y, total] = smooth3(x, k)
  y = zeros(1, 8);
  total = 0;
  for i = 1:numel(x)
    lo = max(1, i - 1); hi = min(numel(x), i + 1);
    s = 0;
    for j = lo:hi
      s = s + x(j);
    end
    y(i) = k * s / (hi - lo + 1);
    if y(i) > 10
      y(i) = 10;
    end
  end
  total = sum(y) + norm2(y);
end
function n = norm2(v)
  n = sqrt(sum(v .* v));
end
function z = gain(a, b)
  z = a * b';
  z = z + 2 .* z .^ 2 - z / 4;
end
function q = toint(x)
  q = int16(x * 1000) + int16(40000);
end`;
const lab = () => { const files = new FileStore(); const l = new Lab({ out: () => {}, files }); l.run(SRC); return { l, files }; };
let hasCc = true;
try { execFileSync('cc', ['--version'], { stdio: 'ignore' }); } catch { hasCc = false; }

describe('Hyperion C code generation (M480)', () => {
  it('writes readable C and a header for a function, with its helpers', () => {
    const { l, files } = lab();
    l.run("codegen('smooth3', {zeros(1, 8), 1})");
    const c = files.text('smooth3.c'), h = files.text('smooth3.h');
    expect(h).toContain('void smooth3(const double x[8], double k_, double y[8], double *total);');
    expect(c).toContain('static double norm2(const double v[8])');
    expect(c).not.toMatch(/malloc/);
    expect(() => l.run("codegen('smooth3', {zeros(1, 8)})")).toThrow(/takes 2 inputs/);
    expect(() => l.run("codegen('nope', {})")).toThrow(/no function nope/);
  });
  it.skipIf(!hasCc)('the C gives the same answers as Hyperion (compiled with the computer’s C compiler)', () => {
    const { l, files } = lab();
    const x = [3, 1, 4, 1, 5, 9, 2, 6];
    l.run(`codegen('smooth3', {zeros(1, 8), 1}); codegen('gain', {zeros(2, 3), zeros(2, 3)}); codegen('toint', {zeros(1, 3)});
      [y, t] = smooth3([${x.join(' ')}], 1.5); g = gain([1 2 3; 4 5 6], [1 0 1; 0 1 0]); q = toint([1.5 -2 50]);`);
    const dir = mkdtempSync(join(tmpdir(), 'hyp-cg-'));
    for (const f of ['smooth3', 'gain', 'toint']) { writeFileSync(join(dir, `${f}.c`), files.text(`${f}.c`)); writeFileSync(join(dir, `${f}.h`), files.text(`${f}.h`)); }
    writeFileSync(join(dir, 'main.c'), `#include <stdio.h>
#include "smooth3.h"
#include "gain.h"
#include "toint.h"
int main(void) {
  double x[8] = {${x.join(', ')}}, y[8], t, a[6] = {1, 4, 2, 5, 3, 6}, b[6] = {1, 0, 0, 1, 1, 0}, g[4], v[3] = {1.5, -2, 50};
  int16_t q[3];
  smooth3(x, 1.5, y, &t);
  gain(a, b, g);
  toint(v, q);
  for (int i = 0; i < 8; i++) printf("%.12g ", y[i]);
  printf("%.12g ", t);
  for (int i = 0; i < 4; i++) printf("%.12g ", g[i]);
  for (int i = 0; i < 3; i++) printf("%d ", q[i]);
  return 0;
}`);
    execFileSync('cc', ['-std=c99', '-Wall', '-Werror', '-o', join(dir, 'run'), join(dir, 'main.c'), join(dir, 'smooth3.c'), join(dir, 'gain.c'), join(dir, 'toint.c'), '-lm'], { cwd: dir });
    const got = execFileSync(join(dir, 'run')).toString().trim().split(/\s+/).map(Number);
    const want = [...toMat(l.vars.get('y')!).d, ...toMat(l.vars.get('t')!).d, ...toMat(l.vars.get('g')!).d, ...toMat(l.vars.get('q')!).d];
    got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 9));
  });
  it('refuses what can’t be fixed-size C, saying why', () => {
    const l = new Lab({ out: () => {} });
    l.run('function y = grow(n)\n  y = [];\n  for i = 1:n, y(end + 1) = i; end\nend\nfunction s = txt(x)\n  s = num2str(x);\nend');
    expect(() => l.run("codegen('grow', {3})")).toThrow(/codegen: grow/);
    expect(() => l.run("codegen('txt', {3})")).toThrow(/num2str can’t become C/);
  });
  it('fixed point: quantisation, full-precision growth, bits', () => {
    expect(X.quantize(Math.PI, { signed: true, wl: 16, fl: 13 })).toBeCloseTo(3.1416015625, 12);
    expect(X.bestFl([Math.PI], true, 16)).toBe(13);
    expect(X.stored(1000, { signed: true, wl: 8, fl: 0 })).toBe(127);
    expect(X.sumType({ signed: true, wl: 16, fl: 13 }, { signed: true, wl: 16, fl: 13 })).toEqual({ signed: true, wl: 17, fl: 13 });
    expect(X.productType({ signed: true, wl: 16, fl: 13 }, { signed: true, wl: 8, fl: 4 })).toEqual({ signed: true, wl: 24, fl: 17 });
    expect(X.bits(-1, { signed: true, wl: 8, fl: 0 })).toBe('11111111');
    expect(X.hex(0.5, { signed: false, wl: 8, fl: 8 })).toBe('80');
    const l = new Lab({ out: () => {} });
    l.run("a = fi(pi); b = fi(0.1, 1, 16, 15); c = a + b; d = a * b; w = c.WordLength; e = double(d); s = storedInteger(a); k = bin(fi(-1, 1, 8, 0));");
    expect(toMat(l.vars.get('w')!).d[0]).toBe(19); // 3 integer bits, 15 fraction bits, the sign
    expect(toMat(l.vars.get('e')!).d[0]).toBeCloseTo(3.1416015625 * X.quantize(0.1, { signed: true, wl: 16, fl: 15 }), 12);
    expect(toMat(l.vars.get('s')!).d[0]).toBe(25736);
    expect((l.vars.get('k') as { v: string }).v).toBe('11111111');
  });
  const FIR = `function [y, acc] = firfx(x, h)
  y = x;
  acc = fi(0, 1, 40, 28);
  for n = 1:numel(x)
    acc(:) = 0;
    for k = 1:numel(h)
      if n - k + 1 >= 1
        acc(:) = acc + x(n - k + 1) * h(k);
      end
    end
    y(n) = acc;
  end
end
function z = mixfx(a, b)
  z = fi(a * b - a + 0.25, 1, 10, 4);   % 7.9 * 7.9 - 7.9 is past 32: held at the top
  if z > a
    z(:) = -z;
  end
end
function bad = growfx(x)
  bad = fi(0, 1, 16, 8);
  for k = 1:3
    bad = bad + x;
  end
end`;
  it('M524: fixed-point C: the signature holds the stored integers; a type that changes is refused with the fix', () => {
    const l = new Lab({ out: () => {}, files: new FileStore() });
    l.run(FIR);
    const g = l.run("x = fi(zeros(1, 8), 1, 16, 12); h = fi(zeros(1, 4), 1, 16, 14); r = codegen('firfx', {x, h});") as unknown;
    void g;
    const c = (l.vars.get('r') as { f: Map<string, { v: string }> }).f.get('C')!.v, hh = (l.vars.get('r') as { f: Map<string, { v: string }> }).f.get('H')!.v;
    expect(hh).toContain('void firfx(const int16_t x[8], const int16_t h[4], int16_t y[8], int64_t *acc);');
    expect(c).toContain('fx_shift');
    expect(c).toMatch(/acc: fi\(signed, 40 bits, 28 fraction\)/);
    expect(() => l.run("codegen('growfx', {fi(0, 1, 16, 8)})")).toThrow(/bad changes type .*bad\(:\) = …/);
  });
  it.skipIf(!hasCc)('M524: the fixed-point C gives exactly Hyperion’s bits (a FIR filter and saturation)', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files });
    l.run(FIR);
    l.run(`xv = [0.9 -0.7 0.3 1.2 -1.9 0.05 0.6 -0.33]; hv = [0.5 -0.25 0.125 0.9];
      x = fi(xv, 1, 16, 12); h = fi(hv, 1, 16, 14);
      codegen('firfx', {x, h}); codegen('mixfx', {fi(0, 1, 16, 12), fi(0, 1, 12, 8)});
      [y, acc] = firfx(x, h); ys = storedInteger(y); as = storedInteger(acc);
      xs = storedInteger(x); hs = storedInteger(h);
      a1 = fi(1.75, 1, 16, 12); b1 = fi(-3.5, 1, 12, 8); z1 = storedInteger(mixfx(a1, b1)); a1s = storedInteger(a1); b1s = storedInteger(b1);
      a2 = fi(7.9, 1, 16, 12); b2 = fi(7.9, 1, 12, 8); z2 = storedInteger(mixfx(a2, b2)); a2s = storedInteger(a2); b2s = storedInteger(b2);`);
    const v = (n: string) => [...toMat(l.vars.get(n)!).d];
    const dir = mkdtempSync(join(tmpdir(), 'hyp-fx-'));
    for (const f of ['firfx', 'mixfx']) { writeFileSync(join(dir, `${f}.c`), files.text(`${f}.c`)); writeFileSync(join(dir, `${f}.h`), files.text(`${f}.h`)); }
    writeFileSync(join(dir, 'main.c'), `#include <stdio.h>
#include "firfx.h"
#include "mixfx.h"
int main(void) {
  int16_t x[8] = {${v('xs').join(', ')}}, h[4] = {${v('hs').join(', ')}}, y[8];
  int64_t acc;
  firfx(x, h, y, &acc);
  for (int i = 0; i < 8; i++) printf("%d ", y[i]);
  printf("%lld %d %d", (long long)acc, (int)mixfx(${v('a1s')[0]}, ${v('b1s')[0]}), (int)mixfx(${v('a2s')[0]}, ${v('b2s')[0]}));
  return 0;
}`);
    execFileSync('cc', ['-std=c99', '-Wall', '-Werror', '-o', join(dir, 'run'), join(dir, 'main.c'), join(dir, 'firfx.c'), join(dir, 'mixfx.c'), '-lm'], { cwd: dir });
    const got = execFileSync(join(dir, 'run')).toString().trim().split(/\s+/).map(Number);
    expect(got).toEqual([...v('ys'), ...v('as'), ...v('z1'), ...v('z2')]);
  });
  const DIV = `function q = ratiofx(a, b)
  q = a ./ b;
end
function q = scalefx(a, b)
  q = divide(numerictype(1, 24, 16), a, b);
end
function z = widefx(a, b, c)
  z = a * b + c;   % 40 + 40 bits: an 80-bit product, worked in 128 bits
end`;
  it('M527: fixed-point division and types over 62 bits in Hyperion', () => {
    const l = new Lab({ out: () => {}, files: new FileStore() });
    l.run(DIV);
    l.run(`r = ratiofx(fi(1.75, 1, 16, 12), fi(-0.5, 1, 12, 8)); rt = numerictype(r); rs = storedInteger(r);
      d = scalefx(fi(1, 1, 16, 12), fi(3, 1, 16, 12)); z0 = storedInteger(scalefx(fi(1, 1, 16, 12), fi(0, 1, 16, 12)));
      w = widefx(fi(3.25, 1, 40, 30), fi(-2.5, 1, 40, 30), fi(1, 1, 40, 30)); ww = w.WordLength;`);
    expect((l.vars.get('rt') as { v: string }).v).toBe('Signed, word length 16, fraction length 4');
    expect(toMat(l.vars.get('rs')!).d[0]).toBe(-56); // -3.5 × 2^4
    expect(toMat((l.vars.get('d') as unknown as { f: Map<string, never> }).f.get('Value')!).d[0]).toBe(Math.floor(2 ** 16 / 3 + 0.5) / 2 ** 16);
    expect(toMat(l.vars.get('z0')!).d[0]).toBe(2 ** 23 - 1); // 1 / 0: the top of the range
    expect(toMat(l.vars.get('ww')!).d[0]).toBe(81);
    expect(toMat((l.vars.get('w') as unknown as { f: Map<string, never> }).f.get('Value')!).d[0]).toBe(-7.125);
  });
  it.skipIf(!hasCc)('M527: the C for ./, divide and an 81-bit sum gives exactly Hyperion’s stored integers', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files });
    l.run(DIV);
    const pairs = [[1.75, -0.5], [-7.3, 0.9], [0.4, 0], [-0.4, 0], [0, 0], [5.5, 0.75], [-1.0625, -2.5]];
    l.run(`codegen('ratiofx', {fi(0, 1, 16, 12), fi(0, 1, 12, 8)}); codegen('scalefx', {fi(0, 1, 16, 12), fi(0, 1, 16, 12)});
      codegen('widefx', {fi(0, 1, 40, 30), fi(0, 1, 40, 30), fi(0, 1, 40, 30)});`);
    const ins: number[][] = [], want: number[] = [];
    const st = (v: string) => toMat(l.run(`zz = storedInteger(${v});`) === undefined ? l.vars.get('zz')! : l.vars.get('zz')!).d[0];
    for (const [x, y] of pairs) {
      const a = `fi(${x}, 1, 16, 12)`, b = `fi(${y}, 1, 12, 8)`, b2 = `fi(${y}, 1, 16, 12)`;
      ins.push([st(a), st(b), st(b2)]);
      want.push(st(`ratiofx(${a}, ${b})`), st(`scalefx(${a}, ${b2})`));
    }
    const wa = st('fi(3.25, 1, 40, 30)'), wb = st('fi(-2.5, 1, 40, 30)'), wc = st('fi(1, 1, 40, 30)');
    const wz = BigInt(wa) * BigInt(wb) + BigInt(wc) * (BigInt(1) << BigInt(30));
    expect(Number(wz) / 2 ** 60).toBe(st('widefx(fi(3.25, 1, 40, 30), fi(-2.5, 1, 40, 30), fi(1, 1, 40, 30))') / 2 ** 60);
    const dir = mkdtempSync(join(tmpdir(), 'hyp-fxdiv-'));
    for (const f of ['ratiofx', 'scalefx', 'widefx']) { writeFileSync(join(dir, `${f}.c`), files.text(`${f}.c`)); writeFileSync(join(dir, `${f}.h`), files.text(`${f}.h`)); }
    expect(files.text('widefx.h')).toContain('fx128_t widefx(int64_t a, int64_t b, int64_t c);');
    expect(files.text('ratiofx.c')).toContain('typedef int64_t fxw_t;');
    writeFileSync(join(dir, 'main.c'), `#include <stdio.h>
#include "ratiofx.h"
#include "scalefx.h"
#include "widefx.h"
int main(void) {
  int16_t a[] = {${ins.map((r) => r[0]).join(', ')}}, b[] = {${ins.map((r) => r[1]).join(', ')}}, b2[] = {${ins.map((r) => r[2]).join(', ')}};
  for (int i = 0; i < ${ins.length}; i++) printf("%d %d ", (int)ratiofx(a[i], b[i]), (int)scalefx(a[i], b2[i]));
  fx128_t z = widefx(${wa}, ${wb}, ${wc});
  printf("%lld %llu", (long long)(z >> 64), (unsigned long long)z);
  return 0;
}`);
    execFileSync('cc', ['-std=c99', '-Wall', '-Werror', '-o', join(dir, 'run'), join(dir, 'main.c'), join(dir, 'ratiofx.c'), join(dir, 'scalefx.c'), join(dir, 'widefx.c'), '-lm'], { cwd: dir });
    const got = execFileSync(join(dir, 'run')).toString().trim().split(/\s+/);
    expect(got.slice(0, -2).map(Number)).toEqual(want);
    const hiW = BigInt(got[got.length - 2]), loW = BigInt(got[got.length - 1]);
    expect((hiW << BigInt(64)) + loW).toBe(wz);
  });
});

describe('M530: fimath, matrix division and 128-bit numbers on small chips', () => {
  const RMS = ['Nearest', 'Floor', 'Ceiling', 'Zero', 'Round', 'Convergent'], OMS = ['Saturate', 'Wrap'];
  const modes = RMS.flatMap((rm) => OMS.map((om) => [rm, om]));
  const MODES = modes.map(([rm, om]) => `function [p, q, r, s, t] = m_${rm}_${om}(x, a, b)
  F = fimath('RoundingMethod', '${rm}', 'OverflowAction', '${om}');
  p = fi(x, 1, 8, 2, F);
  q = fi(0, 1, 6, 1, F); q(:) = a;
  r = fi(0, 1, 8, 6, F); r(:) = a;
  s = divide(fi(0, 1, 8, 2, F), a, b);
  t = -setfimath(fi(-8, 1, 8, 4), F);
end`).join('\n');
  const SOLVE = `function x = solve2(A, b)
  x = A \\ b;
end
function x = solveT(A, b)
  x = mldivide(A, b, numerictype(1, 24, 16));
end
function x = rsolve(b, A)
  x = b / A;
end
function q = widediv(a, b)
  T = fi(0, 1, 100, 60, 'RoundingMethod', 'Convergent');
  q = divide(T, a, b);
end`;
  const st = (l: Lab, e: string) => { l.run(`zz = storedInteger(${e});`); return [...toMat(l.vars.get('zz')!).d]; };
  it('Hyperion: each rounding method, wrap, setfimath, A \\ b, b / A and mldivide with a type', () => {
    const l = new Lab({ out: () => {} });
    expect(st(l, "fi([-2.5 -1.5 -0.5 0.5 1.5 2.5], 1, 8, 0, 'RoundingMethod', 'Convergent')")).toEqual([-2, -2, 0, 0, 2, 2]);
    expect(st(l, "fi([-2.5 -1.5 0.5 1.5], 1, 8, 0, 'RoundingMethod', 'Round')")).toEqual([-3, -2, 1, 2]);
    expect(st(l, "fi([-2.5 -1.5 0.5 1.5], 1, 8, 0, 'RoundingMethod', 'Nearest')")).toEqual([-2, -1, 1, 2]);
    expect(st(l, "fi([-2.7 2.7], 1, 8, 0, 'RoundingMethod', 'Zero')")).toEqual([-2, 2]);
    expect(st(l, "fi([-2.2 2.2], 1, 8, 0, 'RoundingMethod', 'Ceiling')")).toEqual([-2, 3]);
    expect(st(l, "fi([130 -129 200], 1, 8, 0, fimath('OverflowAction', 'Wrap'))")).toEqual([-126, 127, -56]);
    expect(st(l, "-fi(-128, 1, 8, 0, 'OverflowAction', 'Wrap')")).toEqual([-128]);
    l.run("F = fimath('RoundingMethod', 'Floor'); a = setfimath(fi(1, 1, 16, 8), F); b = a ./ fi(3, 1, 16, 8); rm = b.RoundingMethod; c = removefimath(a); has = isfield(c, 'RoundingMethod');");
    expect((l.vars.get('rm') as { v: string }).v).toBe('Floor');
    expect(toMat(l.vars.get('has')!).d[0]).toBe(0);
    l.run("A = fi([4 1; 2 3], 1, 16, 8); y = fi([1; 2], 1, 16, 8); x = A \\ y; xt = mldivide(A, y, numerictype(1, 24, 16)); z = y' / A;");
    expect(st(l, 'x')).toEqual([0, 1]); // 0.1 and 0.6 in whole numbers (fraction 8 − 8)
    expect(st(l, 'xt')).toEqual([Math.floor(0.1 * 2 ** 16 + 0.5), Math.floor(0.6 * 2 ** 16 + 0.5)]);
    expect(st(l, 'mrdivide(y\', A, numerictype(1, 24, 16))')).toEqual([Math.floor(-0.1 * 2 ** 16 + 0.5), Math.floor(0.7 * 2 ** 16 + 0.5)]);
    // M531: a singular A gives the least-squares answer (here exact: y is A's first column), a free unknown 0
    expect(st(l, 'fi([1 2; 2 4], 1, 16, 8) \\ y')).toEqual([1, 0]);
    // M531: more equations than unknowns: the least-squares line through (0, 1), (1, 2.5), (2, 3.5) is 1.083 + 1.25 x
    l.run("P = fi([1 0; 1 1; 1 2], 1, 16, 8); q = fi([1; 2.5; 3.5], 1, 16, 8); c = mldivide(P, q, numerictype(1, 32, 16)); r = mrdivide(q', P', numerictype(1, 32, 16));");
    expect(st(l, 'c')).toEqual([Math.round((13 / 12) * 2 ** 16), Math.round(1.25 * 2 ** 16)]);
    expect(st(l, 'r')).toEqual(st(l, 'c'));
    // fewer equations than unknowns: a basic answer (the later unknown 0)
    expect(st(l, "mldivide(fi([2 4], 1, 16, 8), fi(3, 1, 16, 8), numerictype(1, 32, 16))")).toEqual([1.5 * 2 ** 16, 0]);
    expect(st(l, "fi(zeros(2), 1, 16, 8) \\ y")).toEqual([0, 0]);
  });
  it('the exact elimination solves any whole-number system: square, singular, tall and wide', async () => {
    const { solveAny } = await import('./codegen-lab');
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return BigInt((seed % 2001) - 1000); };
    const zero = BigInt(0);
    for (let t = 0; t < 300; t++) {
      const R = 1 + (t % 5), N = 1 + ((t >> 2) % 5), m = 2, A = Array.from({ length: R * N }, rnd), B = Array.from({ length: R * m }, rnd);
      if (t % 3 === 0 && N > 1) for (let i = 0; i < R; i++) A[i + (N - 1) * R] = A[i] * BigInt(2); // a repeated column
      const { M, det, piv } = solveAny(A, B, R, N, m), X = (c: number, j: number) => (piv[c] < 0 ? zero : M[piv[c] + (N + j) * N]);
      expect(det === zero).toBe(A.every((x) => x === zero));
      // AᵀA (det·x) = det · AᵀB: the least-squares equations hold exactly (a square solvable A: A (det·x) = det·B)
      for (let j = 0; j < m; j++) for (let i = 0; i < N; i++) {
        let lhs = zero, rhs = zero;
        for (let r = 0; r < R; r++) { let ax = zero; for (let c = 0; c < N; c++) ax += A[r + c * R] * X(c, j); lhs += A[r + i * R] * ax; rhs += A[r + i * R] * B[r + j * R]; }
        expect(lhs).toBe(det * rhs);
      }
    }
  });
  it('refuses a matrix division too big to work exactly, naming the fix', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files });
    l.run(SOLVE);
    expect(() => l.run("codegen('solve2', {fi(zeros(300), 1, 126, 63), fi(zeros(300, 1), 1, 126, 63)})")).toThrow(/needs \d+ bits of working .*shorter words/);
    // M531: a 2×2 of 16 bits fits 64-bit working; a 5×5 of 32 bits is worked in 32-bit pieces
    l.run("codegen('solve2', {fi(zeros(2), 1, 16, 8), fi(zeros(2, 1), 1, 16, 8)})");
    expect(files.text('solve2.c')).toContain('typedef int64_t fxw_t;');
    expect(files.text('solve2.c')).not.toContain('fx128_t'); // (a singular one falls back to least squares in 32-bit pieces)
    l.run("codegen('solve2', {fi(zeros(5), 1, 32, 16), fi(zeros(5, 1), 1, 32, 16)})");
    expect(files.text('solve2.c')).toMatch(/typedef struct \{ uint32_t d\[\d+\]; \} fxb_t;/);
  });
  it.skipIf(!hasCc)('the C gives exactly Hyperion’s stored integers: every method, wrap, matrix division; 64-bit, 128-bit and two-half working', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files });
    l.run(MODES + '\n' + SOLVE);
    const xs = [-2.375, -1.125, -0.625, 0.125, 0.375, 0.625, 1.125, 2.875, 40, -40, 31.9, -32.1, 0.5, -0.5];
    const as = [1.0625, -1.0625, 2.1875, -2.1875, 0.9375, 300.5, -300.5, 0.25];
    const bs = [0.375, -0.375, 3, -2.625, 0.125, 0.5, 0, 1];
    for (const [rm, om] of modes) l.run(`codegen('m_${rm}_${om}', {0, fi(0, 1, 16, 4), fi(0, 1, 12, 3)});`);
    const want: number[] = [], ins: number[][] = [];
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i], a = `fi(${as[i % as.length]}, 1, 16, 4)`, b = `fi(${bs[i % bs.length]}, 1, 12, 3)`;
      ins.push([x, st(l, a)[0], st(l, b)[0]]);
      for (const [rm, om] of modes) { l.run(`[p, q, r, s, t] = m_${rm}_${om}(${x}, ${a}, ${b});`); for (const v of 'pqrst') want.push(st(l, v)[0]); }
    }
    // matrix division: 2×2 of 8 bits (64-bit working), 3×3 of 16 bits (128-bit working), b / A, a singular A
    const A3 = [[3.5, -1.25, 0.75], [1, 2.25, -0.5], [-0.75, 0.5, 4]], B3 = [[1, -2], [0.5, 3.25], [-1.5, 0.25]];
    const m = (rows: number[][]) => `[${rows.map((r) => r.join(' ')).join('; ')}]`;
    l.run(`codegen('solve2', {fi(zeros(2), 1, 8, 4), fi(zeros(2, 1), 1, 8, 4)}); codegen('solveT', {fi(zeros(3), 1, 16, 10), fi(zeros(3, 2), 1, 16, 10)});
      codegen('rsolve', {fi(zeros(2, 3), 1, 16, 10), fi(zeros(3), 1, 16, 10)});
      codegen('widediv', {fi(0, 1, 60, 30), fi(0, 1, 60, 30)});`);
    expect(files.text('solve2.c')).toContain('typedef int64_t fxw_t;');
    expect(files.text('solveT.c')).toContain('typedef fx128_t fxw_t;');
    const sA2 = st(l, 'fi([1.5 -0.25; 0.75 2], 1, 8, 4)'), sb2 = st(l, 'fi([1; -0.5], 1, 8, 4)'), sS2 = st(l, 'fi([1 2; 2 4], 1, 8, 4)');
    const sA3 = st(l, `fi(${m(A3)}, 1, 16, 10)`), sB3 = st(l, `fi(${m(B3)}, 1, 16, 10)`), sR = st(l, `fi(${m(B3)}', 1, 16, 10)`);
    const solved = [...st(l, `solve2(fi([1.5 -0.25; 0.75 2], 1, 8, 4), fi([1; -0.5], 1, 8, 4))`), ...st(l, `solve2(fi([1 2; 2 4], 1, 8, 4), fi([1; -0.5], 1, 8, 4))`),
      ...st(l, `solveT(fi(${m(A3)}, 1, 16, 10), fi(${m(B3)}, 1, 16, 10))`), ...st(l, `rsolve(fi(${m(B3)}', 1, 16, 10), fi(${m(A3)}, 1, 16, 10))`)];
    expect(solved.slice(2, 4)).toEqual([0, 0]); // the singular A
    // A and B are whole steps, so the answer is the true solution rounded once to 2^-16
    [0.351030, -0.002433, -0.308883, -0.033637, 1.432104, -0.122820].forEach((x, i) => expect(Math.abs(solved[4 + i] / 2 ** 16 - x)).toBeLessThan(2 ** -16));
    // the wide division's stored answers, worked here in BigInt: 1/3, −7/0.25, 5/−0.75, 1/0
    const X = (v: number) => BigInt(Math.round(v * 2 ** 30)), pairs: [number, number][] = [[1, 3], [-7, 0.25], [5, -0.75], [1, 0]];
    const wideWant = pairs.map(([a, b]) => {
      const one = BigInt(1), lo = -(one << BigInt(99)), hi = (one << BigInt(99)) - one;
      let p = X(a), q = X(b);
      if (q === BigInt(0)) return p > 0 ? hi : lo;
      if (q < 0) { p = -p; q = -q; }
      return Fx.fitBig(Fx.rdivBig(p * (one << BigInt(60)), q, 'Convergent'), { signed: true, wl: 100, fl: 60 });
    });
    const dir = mkdtempSync(join(tmpdir(), 'hyp-fx530-'));
    const names = [...modes.map(([rm, om]) => `m_${rm}_${om}`), 'solve2', 'solveT', 'rsolve', 'widediv'];
    for (const f of names) { writeFileSync(join(dir, `${f}.c`), files.text(`${f}.c`)); writeFileSync(join(dir, `${f}.h`), files.text(`${f}.h`)); }
    writeFileSync(join(dir, 'main.c'), `#include <stdio.h>
${names.map((f) => `#include "${f}.h"`).join('\n')}
#ifdef HYPERION_FX128_NATIVE
#define HI(z) (long long)(z >> 64)
#define LO(z) (unsigned long long)z
#else
#define HI(z) (long long)(int64_t)z.hi
#define LO(z) (unsigned long long)z.lo
#endif
int main(void) {
  double xs[] = {${ins.map((r) => r[0]).join(', ')}};
  int16_t as[] = {${ins.map((r) => r[1]).join(', ')}}, bs[] = {${ins.map((r) => r[2]).join(', ')}};
  int8_t p, q, r, s, t;
  for (int i = 0; i < ${ins.length}; i++) {
${modes.map(([rm, om]) => `    m_${rm}_${om}(xs[i], as[i], bs[i], &p, &q, &r, &s, &t); printf("%d %d %d %d %d ", p, q, r, s, t);`).join('\n')}
  }
  int8_t A2[] = {${sA2.join(', ')}}, b2[] = {${sb2.join(', ')}}, S2[] = {${sS2.join(', ')}}, x2[2];
  int16_t A3[] = {${sA3.join(', ')}}, B3[] = {${sB3.join(', ')}}, R[] = {${sR.join(', ')}};
  int32_t x3[6];
  int16_t xr[6];
  solve2(A2, b2, x2); printf("%d %d ", x2[0], x2[1]);
  solve2(S2, b2, x2); printf("%d %d ", x2[0], x2[1]);
  solveT(A3, B3, x3); for (int i = 0; i < 6; i++) printf("%d ", (int)x3[i]);
  rsolve(R, A3, xr); for (int i = 0; i < 6; i++) printf("%d ", (int)xr[i]);
  int64_t wa[] = {${pairs.map(([a]) => X(a)).join(', ')}}, wb[] = {${pairs.map(([, b]) => X(b)).join(', ')}};
  for (int i = 0; i < ${pairs.length}; i++) { fx128_t z = widediv(wa[i], wb[i]); printf("%lld %llu ", HI(z), LO(z)); }
  return 0;
}`);
    const run = (portable: boolean) => {
      const exe = join(dir, portable ? 'run-p' : 'run-n');
      execFileSync('cc', ['-std=c99', '-Wall', '-Werror', ...(portable ? ['-DHYPERION_FX_PORTABLE'] : []), '-o', exe, join(dir, 'main.c'), ...names.map((f) => join(dir, `${f}.c`)), '-lm'], { cwd: dir });
      return execFileSync(exe).toString().trim().split(/\s+/);
    };
    for (const portable of [false, true]) {
      const got = run(portable), nFx = want.length, nSolve = solved.length;
      expect(got.slice(0, nFx).map(Number)).toEqual(want);
      expect(got.slice(nFx, nFx + nSolve).map(Number)).toEqual(solved);
      const wide = got.slice(nFx + nSolve);
      expect(pairs.map((_, i) => (BigInt(wide[2 * i]) << BigInt(64)) + BigInt(wide[2 * i + 1]))).toEqual(wideWant);
    }
  });
  it.skipIf(!hasCc)('M531: least squares, singular systems and working past 128 bits give Hyperion’s stored integers in C', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files });
    const T = (w: number, f: number) => `numerictype(1, ${w}, ${f})`;
    const fns: [string, string][] = [['sq16', T(32, 16)], ['tall16', T(32, 16)], ['sing3', T(32, 16)], ['big40', T(40, 20)], ['big70', T(70, 30)], ['right16', T(32, 16)]];
    l.run(fns.map(([f, t]) => (f === 'right16' ? `function x = ${f}(b, A)\n  x = mrdivide(b, A, ${t});\nend` : `function x = ${f}(A, b)\n  x = mldivide(A, b, ${t});\nend`)).join('\n'));
    const m = (rows: number[][]) => `[${rows.map((r) => r.join(' ')).join('; ')}]`;
    const cases: Record<string, [number[][], number[][], number, number]> = {
      sq16: [[[3.5, -1.25], [1, 2.25]], [[1], [-0.5]], 16, 8],
      tall16: [[[1, 0], [1, 1], [1, 2], [1, 3.5]], [[1, 2], [2.5, -1], [3.5, 0.25], [5, 7]], 16, 8],
      sing3: [[[1, 2, 3], [2, 4, 6], [0.5, -1, 2]], [[1], [3], [-2]], 16, 8],
      big40: [[[3.5, -1.25, 0.75], [1, 2.25, -0.5], [-0.75, 0.5, 4]], [[1, -2], [0.5, 3.25], [-1.5, 0.25]], 40, 20],
      big70: [[[3.5, -1.25, 0.75], [1, 2.25, -0.5], [-0.75, 0.5, 4]], [[1], [0.5], [-1.5]], 70, 30],
      right16: [[[1, 0, 2], [1, 1, -1]], [[1, 0, 1], [1, 1, 0]], 16, 8],
    };
    const want: Record<string, number[]> = {}, ins: Record<string, [number[], number[]]> = {};
    for (const [f] of fns) {
      const [A, B, w, fl] = cases[f], a = `fi(${m(A)}, 1, ${w}, ${fl})`, b = `fi(${m(B)}, 1, ${w}, ${fl})`;
      ins[f] = [st(l, a), st(l, b)];
      l.run(`codegen('${f}', {${a}, ${b}});`);
      want[f] = st(l, `${f}(${a}, ${b})`);
    }
    expect(files.text('sq16.c')).toContain('typedef int64_t fxw_t;');
    expect(files.text('big40.c')).toContain('typedef int64_t fxw_t;');
    expect(files.text('big40.c')).toMatch(/fxb_t/);
    expect(files.text('big70.c')).toContain('typedef fx128_t fxw_t;');
    expect(files.text('big70.c')).toMatch(/fxb_t/);
    // the least-squares line through four points, and the singular system's basic answer, against double arithmetic
    expect(Math.abs(want.tall16[0] / 2 ** 16 - 31.5 / 26.75)).toBeLessThan(0.001);
    [0.351030, -0.002433, -0.308883].forEach((x, i) => expect(Math.abs(want.big70[i] / 2 ** 30 - x)).toBeLessThan(1e-5));
    const dir = mkdtempSync(join(tmpdir(), 'hyp-fx531-'));
    for (const [f] of fns) { writeFileSync(join(dir, `${f}.c`), files.text(`${f}.c`)); writeFileSync(join(dir, `${f}.h`), files.text(`${f}.h`)); }
    const arr = (ty: string, name: string, v: number[]) => `${ty} ${name}[] = {${v.map((x) => (ty === 'fx128_t' ? `MK(${x})` : `${x}`)).join(', ')}};`;
    const ty = (f: string) => (cases[f][2] > 64 ? 'fx128_t' : cases[f][2] > 16 ? 'int64_t' : 'int16_t'), outTy = (f: string) => (f === 'big70' ? 'fx128_t' : f === 'big40' ? 'int64_t' : 'int32_t');
    writeFileSync(join(dir, 'main.c'), `#include <stdio.h>
${fns.map(([f]) => `#include "${f}.h"`).join('\n')}
#ifdef HYPERION_FX128_NATIVE
#define MK(v) ((fx128_t)(v))
#define LO(z) (long long)(z)
#else
#define MK(v) ((fx128_t){ (uint64_t)(int64_t)(v), (v) < 0 ? ~(uint64_t)0 : 0 })
#define LO(z) (long long)z.lo
#endif
int main(void) {
${fns.map(([f]) => `  { ${arr(ty(f), 'a', ins[f][0])} ${arr(ty(f), 'b', ins[f][1])} ${outTy(f)} x[${want[f].length}];
    ${f}(a, b, x); for (int i = 0; i < ${want[f].length}; i++) printf("%lld ", ${outTy(f) === 'fx128_t' ? 'LO(x[i])' : '(long long)x[i]'}); }`).join('\n')}
  return 0;
}`);
    const all = fns.flatMap(([f]) => want[f]);
    for (const portable of [false, true]) {
      const exe = join(dir, portable ? 'run-p' : 'run-n');
      execFileSync('cc', ['-std=c99', '-Wall', '-Werror', ...(portable ? ['-DHYPERION_FX_PORTABLE'] : []), '-o', exe, join(dir, 'main.c'), ...fns.map(([f]) => join(dir, `${f}.c`)), '-lm'], { cwd: dir });
      expect(execFileSync(exe).toString().trim().split(/\s+/).map(Number)).toEqual(all);
    }
  });
  const MODES2 = `function [p, q, r, s, t, u, v] = modes2(a, b, M, x)
  F1 = fimath('ProductMode', 'KeepMSB', 'ProductWordLength', 8);
  p = setfimath(a, F1) .* b;
  F2 = fimath('ProductMode', 'KeepLSB', 'ProductWordLength', 8, 'OverflowAction', 'Wrap');
  q = setfimath(a, F2) .* b;
  F3 = fimath('ProductMode', 'SpecifyPrecision', 'ProductWordLength', 12, 'ProductFractionLength', 6);
  r = setfimath(a, F3) * b;
  F4 = fimath('SumMode', 'SpecifyPrecision', 'SumWordLength', 8, 'SumFractionLength', 2, 'RoundingMethod', 'Floor');
  s = setfimath(a, F4) + b;
  F5 = fimath('SumMode', 'SpecifyPrecision', 'SumWordLength', 8, 'SumFractionLength', 2, 'RoundingMethod', 'Floor', 'CastBeforeSum', false);
  t = setfimath(a, F5) + b;
  F6 = fimath('ProductMode', 'KeepMSB', 'ProductWordLength', 10, 'SumMode', 'KeepMSB', 'SumWordLength', 12);
  u = setfimath(M, F6) * x;
  v = sum(setfimath(x, F5));
end`;
  it('M532: ProductMode and SumMode in Hyperion', () => {
    const l = new Lab({ out: () => {} });
    l.run(MODES2);
    l.run('[p, q, r, s, t] = modes2(fi(1.5, 1, 8, 4), fi(2.25, 1, 8, 4), fi(zeros(2, 3), 1, 8, 4), fi(zeros(3, 1), 1, 8, 4));');
    expect([st(l, 'p'), st(l, 'q'), st(l, 'r')]).toEqual([[3], [96], [216]]); // 3.375: KeepMSB to 8 bits, KeepLSB wrapped, 6 fraction bits
    l.run('[~, ~, ~, s, t] = modes2(fi(0.1875, 1, 8, 4), fi(0.125, 1, 8, 4), fi(zeros(2, 3), 1, 8, 4), fi(zeros(3, 1), 1, 8, 4)); w = s.WordLength; pm = s.SumMode;');
    expect([st(l, 's'), st(l, 't')]).toEqual([[0], [1]]); // cast first (Floor to 0.25): 0 + 0; else 0.3125 down to 0.25
    expect(toMat(l.vars.get('w')!).d[0]).toBe(8);
    expect((l.vars.get('pm') as { v: string }).v).toBe('SpecifyPrecision');
    expect(() => l.run("a = setfimath(fi(1, 1, 8, 4), fimath('MaxProductWordLength', 12)); b = a .* a;")).toThrow(/needs 16 bits, more than MaxProductWordLength \(12\)/);
  });
  it.skipIf(!hasCc)('M532: the C gives Hyperion’s stored integers with every product and sum mode', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files });
    l.run(MODES2);
    l.run('codegen(\'modes2\', {fi(0, 1, 8, 4), fi(0, 1, 8, 4), fi(zeros(2, 3), 1, 8, 4), fi(zeros(3, 1), 1, 8, 4)});');
    const rows: number[][] = [], want: number[] = [];
    let seed = 3;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return ((seed % 256) - 128) / 16; };
    for (let t = 0; t < 20; t++) {
      const v = Array.from({ length: 2 + 6 + 3 }, rnd), m = (xs: number[], r: number) => `fi(reshape([${xs.join(' ')}], ${r}, []), 1, 8, 4)`;
      l.run(`[p, q, r, s, t, u, v] = modes2(fi(${v[0]}, 1, 8, 4), fi(${v[1]}, 1, 8, 4), ${m(v.slice(2, 8), 2)}, ${m(v.slice(8), 3)});`);
      rows.push([...st(l, `fi(${v[0]}, 1, 8, 4)`), ...st(l, `fi(${v[1]}, 1, 8, 4)`), ...st(l, m(v.slice(2, 8), 2)), ...st(l, m(v.slice(8), 3))]);
      for (const k of 'pqrstuv') want.push(...st(l, k));
    }
    const dir = mkdtempSync(join(tmpdir(), 'hyp-fx532-'));
    writeFileSync(join(dir, 'modes2.c'), files.text('modes2.c'));
    writeFileSync(join(dir, 'modes2.h'), files.text('modes2.h'));
    const sig = files.text('modes2.h').match(/void modes2\(([^)]*)\)/)![1].split(',').map((x) => x.trim().split(/\s+/)[0]);
    writeFileSync(join(dir, 'main.c'), `#include <stdio.h>
#include "modes2.h"
int main(void) {
  int8_t in[][11] = {${rows.map((r) => `{${r.join(', ')}}`).join(', ')}};
  ${sig[4]} p; ${sig[5]} q; ${sig[6]} r; ${sig[7]} s; ${sig[8]} t; ${sig[9]} u[2]; ${sig[10]} v;
  for (int i = 0; i < ${rows.length}; i++) {
    modes2(in[i][0], in[i][1], &in[i][2], &in[i][8], &p, &q, &r, &s, &t, u, &v);
    printf("%d %d %d %d %d %d %d %d ", (int)p, (int)q, (int)r, (int)s, (int)t, (int)u[0], (int)u[1], (int)v);
  }
  return 0;
}`);
    for (const portable of [false, true]) {
      const exe = join(dir, portable ? 'run-p' : 'run-n');
      execFileSync('cc', ['-std=c99', '-Wall', '-Werror', ...(portable ? ['-DHYPERION_FX_PORTABLE'] : []), '-o', exe, join(dir, 'main.c'), join(dir, 'modes2.c'), '-lm'], { cwd: dir });
      expect(execFileSync(exe).toString().trim().split(/\s+/).map(Number)).toEqual(want);
    }
  });
  it.skipIf(!hasCc)('M534: outputs and variables named i, j, k, t1, int or abs don’t clash with the C’s own names', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files });
    l.run(`function [i, j, k] = clash(x, t1)
  k = 0;
  int = 2;
  abs = x .* t1;
  i = abs + int;
  j = zeros(2, 2);
  for s = 1:numel(x)
    k = k + x(s) * int;
  end
  j = [1 2; 3 4] * [x(1) 0; 0 x(2)];
end`);
    l.run("codegen('clash', {zeros(1, 2), 0}); [a, b, c] = clash([1.5 -2], 3);");
    const c = files.text('clash.c'), h = files.text('clash.h');
    expect(h).toContain('void clash(const double x[2], double t1_, double i_[2], double j_[4], double *k_);');
    expect(c).not.toMatch(/\(\*i\)|\bint = /);
    const dir = mkdtempSync(join(tmpdir(), 'hyp-cg534-'));
    writeFileSync(join(dir, 'clash.c'), c);
    writeFileSync(join(dir, 'clash.h'), h);
    writeFileSync(join(dir, 'main.c'), `#include <stdio.h>
#include "clash.h"
int main(void) {
  double x[2] = {1.5, -2}, i[2], j[4], k;
  clash(x, 3, i, j, &k);
  printf("%.12g %.12g %.12g %.12g %.12g %.12g %.12g", i[0], i[1], j[0], j[1], j[2], j[3], k);
  return 0;
}`);
    execFileSync('cc', ['-std=c99', '-Wall', '-Werror', '-o', join(dir, 'run'), join(dir, 'main.c'), join(dir, 'clash.c'), '-lm'], { cwd: dir });
    const want = ['a', 'b', 'c'].flatMap((v) => [...toMat(l.vars.get(v)!).d]);
    expect(execFileSync(join(dir, 'run')).toString().trim().split(/\s+/).map(Number)).toEqual(want);
  });
  it('M535: lsqminnorm gives the smallest answer, for fi exactly and for plain numbers through pinv', () => {
    const l = new Lab({ out: () => {}, files: new FileStore() });
    // x + y = 2: the basic answer is [2; 0], the smallest [1; 1]
    l.run('A = fi([1 1], 1, 16, 8); b = fi(2, 1, 16, 8); x0 = A \\ b; x = lsqminnorm(A, b);');
    expect(st(l, 'x')).toEqual([1, 1]); // the default answer type has 0 fraction bits (8 − 8)
    expect(st(l, 'x0')).toEqual([2, 0]);
    // a singular 3×3 against pinv(A) * b in double
    l.run('A = [1 2 3; 2 4 6; 0.5 -1 2]; b = [1; 3; -2]; xd = pinv(A) * b; xf = lsqminnorm(fi(A, 1, 16, 8), fi(b, 1, 16, 8), numerictype(1, 32, 20)); xl = lsqminnorm(A, b);');
    const xd = [...toMat(l.vars.get('xd')!).d], xl = [...toMat(l.vars.get('xl')!).d];
    st(l, 'xf').forEach((v, i) => { expect(Math.abs(v / 2 ** 20 - xd[i])).toBeLessThan(2 ** -19); expect(xl[i]).toBeCloseTo(xd[i], 10); });
    // pinv of a rank-1 matrix: A' / 25
    l.run('P = pinv([1 2; 2 4]);');
    [...toMat(l.vars.get('P')!).d].forEach((v, i) => expect(v).toBeCloseTo([1, 2, 2, 4][i] / 25, 12));
  });
  it.skipIf(!hasCc)('M535: lsqminnorm in C gives Hyperion’s stored integers (wide, singular, tall, all zero)', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files });
    l.run('function x = mn(A, b)\n  x = lsqminnorm(A, b, numerictype(1, 32, 16));\nend');
    const m = (rows: number[][]) => `[${rows.map((r) => r.join(' ')).join('; ')}]`;
    const cases: [number[][], number[][], number][] = [
      [[[1, 1, -0.5], [2, 0.25, 1]], [[1, 2], [-0.5, 3]], 8],
      [[[1, 2, 3], [2, 4, 6], [0.5, -1, 2]], [[1], [3], [-2]], 16],
      [[[1, 0], [1, 1], [1, 2], [1, 3.5]], [[1], [2.5], [3.5], [5]], 16],
      [[[0, 0], [0, 0]], [[1], [2]], 8],
    ];
    const dir = mkdtempSync(join(tmpdir(), 'hyp-fx535-'));
    const mains: string[] = [], want: number[] = [];
    cases.forEach(([A, B, w], c) => {
      const a = `fi(${m(A)}, 1, ${w}, 4)`, b = `fi(${m(B)}, 1, ${w}, 4)`, name = `mn${c}`;
      l.run(`codegen('mn', {${a}, ${b}});`);
      const code = files.text('mn.c').replace(/\bmn\(/g, `${name}(`).replace(/"mn\.h"/g, `"${name}.h"`), h = files.text('mn.h').replace(/\bmn\(/g, `${name}(`).replace(/MN_H/g, `${name.toUpperCase()}_H`);
      writeFileSync(join(dir, `${name}.c`), code);
      writeFileSync(join(dir, `${name}.h`), h);
      const got = st(l, `mn(${a}, ${b})`);
      want.push(...got);
      const ty = w > 8 ? 'int16_t' : 'int8_t';
      mains.push(`  { ${ty} a[] = {${st(l, a).join(', ')}}, b[] = {${st(l, b).join(', ')}}; int32_t x[${got.length}]; ${name}(a, b, x); for (int i = 0; i < ${got.length}; i++) printf("%ld ", (long)x[i]); }`);
    });
    // the smallest answer of the wide system against double pinv
    l.run(`xd = pinv(${m(cases[0][0])}) * ${m(cases[0][1])};`);
    [...toMat(l.vars.get('xd')!).d].forEach((v, i) => expect(Math.abs(want[i] / 2 ** 16 - v)).toBeLessThan(2 ** -15));
    expect(want.slice(-2)).toEqual([0, 0]);
    for (const portable of [false, true]) {
      const exe = join(dir, portable ? 'run-p' : 'run-n');
      // each file compiled alone (their helpers are static), then linked with one main
      const objs = cases.map((_, c) => {
        const o = join(dir, `mn${c}${portable ? 'p' : 'n'}.o`);
        execFileSync('cc', ['-std=c99', '-Wall', '-Werror', '-c', ...(portable ? ['-DHYPERION_FX_PORTABLE'] : []), '-o', o, join(dir, `mn${c}.c`)], { cwd: dir });
        return o;
      });
      writeFileSync(join(dir, 'main.c'), `#include <stdio.h>\n${cases.map((_, c) => `#include "mn${c}.h"`).join('\n')}\nint main(void) {\n${mains.join('\n')}\n  return 0;\n}`);
      execFileSync('cc', ['-std=c99', '-Wall', '-Werror', '-o', exe, join(dir, 'main.c'), ...objs, '-lm'], { cwd: dir });
      expect(execFileSync(exe).toString().trim().split(/\s+/).map(Number)).toEqual(want);
    }
  });
  it.skipIf(!hasCc)('M536: a matrix division past the old 4096 bits gives Hyperion’s stored integers in C; past the new limits it is refused', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files });
    l.run('function x = big(A, b)\n  x = mldivide(A, b, numerictype(1, 126, 48));\nend\nfunction x = huge(A, b)\n  x = A \\ b;\nend');
    let seed = 11;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return ((seed % 32) - 16) / 4; };
    const N = 20, A = Array.from({ length: N * N }, rnd), b = Array.from({ length: N }, rnd);
    const a = `fi(reshape([${A.join(' ')}], ${N}, ${N}), 1, 120, 56)`, bb = `fi([${b.join('; ')}], 1, 120, 56)`;
    l.run(`codegen('big', {${a}, ${bb}});`);
    const c = files.text('big.c'), k = Number(c.match(/uint32_t d\[(\d+)\]/)![1]);
    expect(32 * k).toBeGreaterThan(4096);
    expect(c).toMatch(/static fxb_t sv_m\[/);
    const want = st(l, `big(${a}, ${bb})`);
    const dir = mkdtempSync(join(tmpdir(), 'hyp-fx536-'));
    writeFileSync(join(dir, 'big.c'), c);
    writeFileSync(join(dir, 'big.h'), files.text('big.h'));
    const mk = (v: number[]) => v.map((x) => `MK(${BigInt(x * 4) * BigInt(2) ** BigInt(54)})`).join(', ');
    writeFileSync(join(dir, 'main.c'), `#include <stdio.h>
#include "big.h"
#ifdef HYPERION_FX128_NATIVE
#define MK(v) ((fx128_t)(v##LL))
#define LO(z) (long long)(z)
#else
#define MK(v) ((fx128_t){ (uint64_t)(int64_t)(v##LL), (v##LL) < 0 ? ~(uint64_t)0 : 0 })
#define LO(z) (long long)z.lo
#endif
int main(void) {
  fx128_t a[] = {${mk(A)}}, b[] = {${mk(b)}}, x[${N}];
  big(a, b, x);
  for (int i = 0; i < ${N}; i++) printf("%lld ", LO(x[i]));
  return 0;
}`);
    for (const portable of [false, true]) {
      const exe = join(dir, portable ? 'run-p' : 'run-n');
      execFileSync('cc', ['-std=c99', '-Wall', '-Werror', ...(portable ? ['-DHYPERION_FX_PORTABLE'] : []), '-o', exe, join(dir, 'main.c'), join(dir, 'big.c'), '-lm'], { cwd: dir });
      expect(execFileSync(exe).toString().trim().split(/\s+/).map(Number)).toEqual(want);
    }
    expect(() => l.run("codegen('huge', {fi(zeros(60), 1, 126, 0), fi(zeros(60, 1), 1, 126, 0)});")).toThrow(/MB of working \(at most 16 MB here\)/);
    expect(() => l.run("codegen('huge', {fi(zeros(300), 1, 126, 0), fi(zeros(300, 1), 1, 126, 0)});")).toThrow(/at most 65536 here/);
  }, 60000);
  it('M538: lsqminnorm of plain numbers takes a tolerance and warns when asked', () => {
    const out: string[] = [], l = new Lab({ out: (t: string) => out.push(t), files: new FileStore() });
    // singular values 10 and 1e-3: a tolerance of 0.01 drops the small one
    l.run('A = [10 0; 0 1e-3; 0 0]; b = [1; 1; 1]; x = lsqminnorm(A, b); xt = lsqminnorm(A, b, 0.01); xw = lsqminnorm(A, b, 0.01, \'warn\');');
    expect([...toMat(l.vars.get('x')!).d]).toEqual([0.1, 1000]);
    expect([...toMat(l.vars.get('xt')!).d]).toEqual([0.1, 0]);
    expect(out.join('')).toMatch(/rank is 1 \(tolerance 0\.01000\), below 2/);
    expect(() => l.run("lsqminnorm(A, b, 'loud')")).toThrow(/'warn' or 'nowarn'/);
    expect(() => l.run('lsqminnorm(fi(A, 1, 16, 8), fi(b, 1, 16, 8), 0.01)')).toThrow(/no tolerance/);
  });
  it.skipIf(!hasCc)('M538: lsqminnorm of plain numbers in C gives Hyperion’s answers (wide, singular, tall, zero, a tolerance, single)', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files });
    l.run("function x = mnd(A, b)\n  x = lsqminnorm(A, b, 'nowarn');\nend\nfunction x = mnt(A, b, tol)\n  x = lsqminnorm(A, b, tol);\nend");
    const m = (rows: number[][]) => `[${rows.map((r) => r.join(' ')).join('; ')}]`;
    const cases: [number[][], number[][]][] = [
      [[[1, 1, -0.5], [2, 0.25, 1]], [[1, 2], [-0.5, 3]]],
      [[[1, 2, 3], [2, 4, 6], [0.5, -1, 2]], [[1], [3], [-2]]],
      [[[1, 0], [1, 1], [1, 2], [1, 3.5]], [[1], [2.5], [3.5], [5]]],
      [[[0, 0], [0, 0]], [[1], [2]]],
    ];
    const dir = mkdtempSync(join(tmpdir(), 'hyp-mn538-'));
    const mains: string[] = [], want: number[] = [], units: string[] = [];
    const add = (fn: string, name: string, ex: string, args: string, cargs: string[], decl: string, len: number) => {
      l.run(`codegen('${fn}', {${ex}});`);
      const rx = new RegExp(`\\b${fn}\\(`, 'g');
      writeFileSync(join(dir, `${name}.c`), files.text(`${fn}.c`).replace(rx, `${name}(`).replace(`"${fn}.h"`, `"${name}.h"`));
      writeFileSync(join(dir, `${name}.h`), files.text(`${fn}.h`).replace(rx, `${name}(`).replace(new RegExp(`${fn.toUpperCase()}_H`, 'g'), `${name.toUpperCase()}_H`));
      l.run(`ans = ${fn}(${args});`);
      want.push(...toMat(l.vars.get('ans')!).d);
      mains.push(`  { ${decl} ${name}(${cargs.join(', ')}); for (int i = 0; i < ${len}; i++) printf("%.17g ", (double)x[i]); }`);
      units.push(name);
    };
    const flat = (rows: number[][]) => rows[0].flatMap((_, j) => rows.map((r) => r[j]));
    cases.forEach(([A, B], c) => {
      const len = A[0].length * B[0].length;
      add('mnd', `mnd${c}`, `zeros(${A.length}, ${A[0].length}), zeros(${B.length}, ${B[0].length})`, `${m(A)}, ${m(B)}`, ['a', 'b', 'x'], `double a[] = {${flat(A).join(', ')}}, b[] = {${flat(B).join(', ')}}, x[${len}];`, len);
    });
    // a tolerance given at run time, and the same in single
    const [A, B] = [[[10, 0], [0, 1e-3], [0, 0]], [[1], [1], [1]]];
    add('mnt', 'mnt0', 'zeros(3, 2), zeros(3, 1), 0', `${m(A)}, ${m(B)}, 0.01`, ['a', 'b', '0.01', 'x'], `double a[] = {${flat(A).join(', ')}}, b[] = {1, 1, 1}, x[2];`, 2);
    add('mnd', 'mnf0', `single(zeros(${cases[2][0].length}, 2)), single(zeros(${cases[2][1].length}, 1))`, `single(${m(cases[2][0])}), single(${m(cases[2][1])})`, ['a', 'b', 'x'], `float a[] = {${flat(cases[2][0]).join(', ')}}, b[] = {${flat(cases[2][1]).join(', ')}}, x[2];`, 2);
    expect(files.text('mnd.c')).toContain('static void lsq_minnorm_f(const float *A');
    writeFileSync(join(dir, 'main.c'), `#include <stdio.h>\n${units.map((u) => `#include "${u}.h"`).join('\n')}\nint main(void) {\n${mains.join('\n')}\n  return 0;\n}`);
    execFileSync('cc', ['-std=c99', '-Wall', '-Werror', '-o', join(dir, 'run'), join(dir, 'main.c'), ...units.map((u) => join(dir, `${u}.c`)), '-lm'], { cwd: dir });
    const got = execFileSync(join(dir, 'run')).toString().trim().split(/\s+/).map(Number);
    expect(got.length).toBe(want.length);
    got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThan(i >= got.length - 2 ? 1e-5 : 1e-10 * (1 + Math.abs(want[i]))));
    expect(want.slice(-6, -4)).toEqual([0, 0]); // all-zero A gives 0
    expect(want.slice(-4, -2)).toEqual([0.1, 0]); // the tolerance dropped the small singular value
    expect(() => l.run("codegen('mnd', {int16(zeros(2)), zeros(2, 1)})")).toThrow(/whole-number types/);
  }, 60000);
});
