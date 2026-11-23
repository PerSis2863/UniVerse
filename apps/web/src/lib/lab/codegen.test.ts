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
});
