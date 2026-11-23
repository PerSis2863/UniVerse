import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { FileStore } from './files';
import { Graphics } from './plot';
import { toMat } from './values';
import './ml-lab';
import './embedded-lab';
import { quantizeLayer } from './embedded';

let hasCc = true;
try { execFileSync('cc', ['--version'], { stdio: 'ignore' }); } catch { hasCc = false; }
const make = () => { let out = ''; const files = new FileStore(); const l = new Lab({ out: (t) => { out += t; }, files, graphics: new Graphics() }); return { l, files, out: () => out, v: (n: string) => [...toMat(l.vars.get(n)!).d] }; };

describe('Hyperion embedded AI (M481)', () => {
  it('8-bit weights: one scale per layer, within half a step', () => {
    const w = [0.5, -1.27, 0.003, 1];
    const { q, scale } = quantizeLayer(w);
    expect(scale).toBeCloseTo(1.27 / 127, 12);
    w.forEach((x, i) => expect(Math.abs(q[i] * scale - x)).toBeLessThanOrEqual(scale / 2 + 1e-12));
  });
  it('a network shrinks 8 times in 8 bits and stays about as accurate', () => {
    const t = make();
    t.l.run(`rng(1); load fisheriris; net = fitcnet(meas, species, 'LayerSizes', 10, 'Standardize', true);
      r = embedreport(net, meas, species); q = quantizemodel(net, 'int8'); a8 = 1 - loss(q, meas, species);
      b64 = modelsize(net, 'double'); b8 = modelsize(net, 'int8'); embedreport(net, meas, species);`);
    expect(t.v('b8')[0]).toBeLessThan(t.v('b64')[0] / 3);
    const acc = toMat((t.l.vars.get('r') as unknown as { f: Map<string, never> }).f.get('Accuracy')!).d;
    expect(acc[0]).toBeGreaterThan(95); expect(acc[2]).toBeGreaterThan(acc[0] - 3);
    expect(t.v('a8')[0] * 100).toBeCloseTo(acc[2], 6);
    expect(t.out()).toContain('int8');
  });
  it.skipIf(!hasCc)('the exported C predicts what Hyperion predicts (network in 8 bits, tree)', () => {
    const t = make();
    t.l.run(`rng(2); load fisheriris; net = fitcnet(meas, species, 'LayerSizes', [8 6], 'Activations', 'tanh', 'Standardize', true); tree = fitctree(meas, species);
      exportmodel(net, 'irisnet', 'Precision', 'int8'); exportmodel(tree, 'iristree', 'Precision', 'single');
      pn = predict(quantizemodel(net, 'int8'), meas); pt = predict(quantizemodel(tree, 'single'), meas); names = net.ClassNames;`);
    const txt = (n: string) => (t.l.vars.get(n) as unknown as { d: { v: string }[] }).d.map((x) => x.v), names = txt('names');
    const dir = mkdtempSync(join(tmpdir(), 'hyp-ai-'));
    for (const f of ['irisnet', 'iristree']) { writeFileSync(join(dir, `${f}.c`), t.files.text(`${f}.c`)); writeFileSync(join(dir, `${f}.h`), t.files.text(`${f}.h`)); }
    const X = toMat(t.l.vars.get('meas')!);
    const rows = Array.from({ length: X.r }, (_, i) => `{${[0, 1, 2, 3].map((j) => `${Number.isInteger(X.d[i + j * X.r]) ? `${X.d[i + j * X.r]}.0` : X.d[i + j * X.r]}f`).join(', ')}}`);
    writeFileSync(join(dir, 'main.c'), `#include <stdio.h>
#include "irisnet.h"
#include "iristree.h"
static const float X[${X.r}][4] = {${rows.join(',\n')}};
int main(void) { float s[3]; for (int i = 0; i < ${X.r}; i++) printf("%d %d\\n", irisnet_predict(X[i], s), iristree_predict(X[i])); return 0; }`);
    execFileSync('cc', ['-std=c99', '-Wall', '-Werror', '-o', join(dir, 'run'), join(dir, 'main.c'), join(dir, 'irisnet.c'), join(dir, 'iristree.c'), '-lm'], { cwd: dir });
    const got = execFileSync(join(dir, 'run')).toString().trim().split('\n').map((l) => l.split(' ').map(Number));
    const kn = txt('pn').map((c) => names.indexOf(c) + 1), kt = txt('pt').map((c) => names.indexOf(c) + 1);
    const sameNet = got.filter((g, i) => g[0] === kn[i] - 1).length, sameTree = got.filter((g, i) => g[1] === kt[i] - 1).length;
    expect(sameTree).toBe(X.r);
    expect(sameNet).toBeGreaterThanOrEqual(X.r - 1); // float rounding may flip one near-tie
  });
});
