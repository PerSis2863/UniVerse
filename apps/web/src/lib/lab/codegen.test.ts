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
