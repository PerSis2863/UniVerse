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
    expect(h).toContain('void smooth3(const double x[8], double k, double y[8], double *total);');
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
    expect(st(l, 'fi([1 2; 2 4], 1, 16, 8) \\ y')).toEqual([0, 0]); // singular: zeros
  });
  it('the exact elimination leaves det · x on the right for any whole-number system', async () => {
    const { solveStored } = await import('./codegen-lab');
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return BigInt((seed % 2001) - 1000); };
    for (let t = 0; t < 200; t++) {
      const n = 1 + (t % 5), A = Array.from({ length: n * n }, rnd), B = Array.from({ length: n * 2 }, rnd), r = solveStored(A, B, n, 2);
      if (r.det === BigInt(0)) continue;
      for (let j = 0; j < 2; j++) for (let i = 0; i < n; i++) {
        let s = BigInt(0);
        for (let p = 0; p < n; p++) s += A[i + p * n] * r.rhs[p + j * n];
        expect(s).toBe(B[i + j * n] * r.det);
      }
    }
  });
  it('refuses a matrix division too big to work exactly, naming the fix', () => {
    const l = new Lab({ out: () => {}, files: new FileStore() });
    l.run(SOLVE);
    expect(() => l.run("codegen('solve2', {fi(zeros(5), 1, 32, 16), fi(zeros(5, 1), 1, 32, 16)})")).toThrow(/needs \d+ bits of working .*shorter words/);
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
});
