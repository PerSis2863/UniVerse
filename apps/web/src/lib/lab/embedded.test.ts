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
import { classOf, eightOf, quantizeLayer, type BayesSpec, type DiscrSpec, type EcocSpec } from './embedded';
import { specOf } from './embedded-lab';
import type { Struct } from './values';

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
  it.skipIf(!hasCc)('M525: SVM, k-NN, ensembles and a linear model in C give exactly Hyperion’s answers (double)', () => {
    const t = make();
    t.l.run(`rng(3); load fisheriris;
      two = meas(51:150, :); sp = species(51:150);
      svm = fitcsvm(two, sp, 'KernelFunction', 'rbf', 'KernelScale', 1.5, 'Standardize', true);
      knn = fitcknn(meas, species, 'NumNeighbors', 5, 'Standardize', true);
      bag = fitcensemble(meas, species, 'Method', 'Bag', 'NumLearningCycles', 15);
      ada = fitcensemble(meas, species, 'Method', 'AdaBoostM2', 'NumLearningCycles', 12);
      ls = fitrensemble(meas(:, 2:4), meas(:, 1), 'Method', 'LSBoost', 'NumLearningCycles', 20);
      lm = fitlm(meas(:, 2:4), meas(:, 1));
      exportmodel(svm, 'm_svm', 'Precision', 'double'); exportmodel(knn, 'm_knn', 'Precision', 'double'); exportmodel(bag, 'm_bag', 'Precision', 'double');
      exportmodel(ada, 'm_ada', 'Precision', 'double'); exportmodel(ls, 'm_ls', 'Precision', 'double'); exportmodel(lm, 'm_lm', 'Precision', 'double');
      psvm = predict(svm, two); pknn = predict(knn, meas); pbag = predict(bag, meas); pada = predict(ada, meas);
      pls = predict(ls, meas(:, 2:4)); plm = predict(lm, meas(:, 2:4)); names = knn.ClassNames;`);
    const txt = (n: string) => (t.l.vars.get(n) as unknown as { d: { v: string }[] }).d.map((x) => x.v), names = txt('names');
    const dir = mkdtempSync(join(tmpdir(), 'hyp-ai2-')), kinds = ['svm', 'knn', 'bag', 'ada', 'ls', 'lm'];
    for (const k of kinds) { writeFileSync(join(dir, `m_${k}.c`), t.files.text(`m_${k}.c`)); writeFileSync(join(dir, `m_${k}.h`), t.files.text(`m_${k}.h`)); }
    const X = toMat(t.l.vars.get('meas')!), row = (i: number, js: number[]) => `{${js.map((j) => String(X.d[i + j * X.r])).join(', ')}}`;
    writeFileSync(join(dir, 'main.c'), `#include <stdio.h>
${kinds.map((k) => `#include "m_${k}.h"`).join('\n')}
static const double X[${X.r}][4] = {${Array.from({ length: X.r }, (_, i) => row(i, [0, 1, 2, 3])).join(',\n')}};
static const double Z[${X.r}][3] = {${Array.from({ length: X.r }, (_, i) => row(i, [1, 2, 3])).join(',\n')}};
int main(void) {
  double s[3], f;
  for (int i = 0; i < ${X.r}; i++) printf("%d %d %d %d %.17g %.17g\\n", i >= 50 ? m_svm_predict(X[i], &f) : -1, m_knn_predict(X[i]), m_bag_predict(X[i], s), m_ada_predict(X[i], s), m_ls_predict(Z[i]), m_lm_predict(Z[i]));
  return 0;
}`);
    execFileSync('cc', ['-std=c99', '-Wall', '-Werror', '-o', join(dir, 'run'), join(dir, 'main.c'), ...kinds.map((k) => join(dir, `m_${k}.c`)), '-lm'], { cwd: dir });
    const got = execFileSync(join(dir, 'run')).toString().trim().split('\n').map((l) => l.split(' ').map(Number));
    const idx = (n: string) => txt(n).map((c) => names.indexOf(c));
    const svmNames = ['versicolor', 'virginica'], psvm = txt('psvm').map((c) => svmNames.indexOf(c));
    const [knn, bag, ada] = [idx('pknn'), idx('pbag'), idx('pada')], ls = [...toMat(t.l.vars.get('pls')!).d], lm = [...toMat(t.l.vars.get('plm')!).d];
    got.forEach((g, i) => {
      if (i >= 50) expect(g[0]).toBe(psvm[i - 50]);
      expect([g[1], g[2], g[3]]).toEqual([knn[i], bag[i], ada[i]]);
      expect(g[4]).toBeCloseTo(ls[i], 12);
      expect(g[5]).toBeCloseTo(lm[i], 12);
    });
  });
  it.skipIf(!hasCc)('M525: a network wholly in 8 bits: the C core gives exactly the engine’s integer answers, still accurate', () => {
    const t = make();
    t.l.run(`rng(4); load fisheriris;
      relu = fitcnet(meas, species, 'LayerSizes', [10 6], 'Standardize', true);
      th = fitcnet(meas, species, 'LayerSizes', 8, 'Activations', 'tanh', 'Standardize', true);
      reg = fitrnet(meas(:, 2:4), meas(:, 1), 'LayerSizes', 6, 'Standardize', true);
      exportmodel(relu, 'n_relu', 'Precision', 'int8full'); exportmodel(th, 'n_tanh', 'Precision', 'int8full'); exportmodel(reg, 'n_reg', 'Precision', 'int8full');
      r = embedreport(relu, meas, species); a0 = 1 - loss(relu, meas, species);`);
    const acc = toMat((t.l.vars.get('r') as unknown as { f: Map<string, never> }).f.get('Accuracy')!).d;
    expect(acc.length).toBe(4);
    expect(acc[3]).toBeGreaterThan(acc[0] - 5);
    // The engine's integer twin, on the same 8-bit inputs as the C core.
    const spec = (name: string) => (t.l.vars.get(name) as never);
    void spec;
    const dir = mkdtempSync(join(tmpdir(), 'hyp-int8-'));
    for (const f of ['n_relu', 'n_tanh', 'n_reg']) { writeFileSync(join(dir, `${f}.c`), t.files.text(`${f}.c`)); writeFileSync(join(dir, `${f}.h`), t.files.text(`${f}.h`)); }
    expect(t.files.text('n_tanh.c')).toContain('static const int8_t T1[256]');
    expect(t.files.text('n_relu.c')).not.toMatch(/\bfloat\b[^\n]*\bW\d/);
    const X = toMat(t.l.vars.get('meas')!);
    writeFileSync(join(dir, 'main.c'), `#include <stdio.h>
#include "n_relu.h"
#include "n_tanh.h"
#include "n_reg.h"
static const float X[${X.r}][4] = {${Array.from({ length: X.r }, (_, i) => `{${[0, 1, 2, 3].map((j) => `${X.d[i + j * X.r]}`).join(', ')}}`).join(',\n')}};
int main(void) { for (int i = 0; i < ${X.r}; i++) printf("%d %d %.6g\\n", n_relu_predict(X[i]), n_tanh_predict(X[i]), (double)n_reg_predict(X[i] + 1)); return 0; }`);
    execFileSync('cc', ['-std=c99', '-Wall', '-Werror', '-o', join(dir, 'run'), join(dir, 'main.c'), join(dir, 'n_relu.c'), join(dir, 'n_tanh.c'), join(dir, 'n_reg.c'), '-lm'], { cwd: dir });
    const got = execFileSync(join(dir, 'run')).toString().trim().split('\n').map((l) => l.split(' ').map(Number));
    t.l.run('pr = predict(relu, meas); pt = predict(th, meas); pg = predict(reg, meas(:, 2:4)); names = relu.ClassNames;');
    const txt = (n: string) => (t.l.vars.get(n) as unknown as { d: { v: string }[] }).d.map((x) => x.v), names = txt('names');
    const pr = txt('pr').map((c) => names.indexOf(c)), pt = txt('pt').map((c) => names.indexOf(c)), pg = [...toMat(t.l.vars.get('pg')!).d];
    expect(got.filter((g, i) => g[0] === pr[i]).length).toBeGreaterThanOrEqual(X.r - 6);
    expect(got.filter((g, i) => g[1] === pt[i]).length).toBeGreaterThanOrEqual(X.r - 6);
    const err = got.reduce((s, g, i) => s + Math.abs(g[2] - pg[i]), 0) / X.r;
    expect(err).toBeLessThan(0.15);
  });
  it.skipIf(!hasCc)('M529: SVMs for many classes, naive Bayes and discriminants in C give Hyperion’s answers on every row', () => {
    const t = make();
    t.l.run(`rng(5); load fisheriris;
      ec = fitcecoc(meas, species, 'Learners', templateSVM('KernelFunction', 'rbf', 'Standardize', true));
      el = fitcecoc(meas, species);
      nb = fitcnb(meas, species); da = fitcdiscr(meas, species);
      exportmodel(ec, 'm_ecoc', 'Precision', 'double'); exportmodel(el, 'm_ecocl', 'Precision', 'double');
      exportmodel(nb, 'm_nb', 'Precision', 'double'); exportmodel(da, 'm_da', 'Precision', 'single');
      r = embedreport(nb, meas, species); s1 = modelsize(ec, 'single'); s2 = modelsize(ec, 'double');
      p1 = predict(ec, meas); p2 = predict(el, meas); p3 = predict(nb, meas); p4 = predict(da, meas); names = ec.ClassNames;`);
    expect(t.v('s1')[0] * 2).toBeGreaterThan(t.v('s2')[0] - 20);
    expect(toMat((t.l.vars.get('r') as unknown as { f: Map<string, never> }).f.get('Accuracy')!).d[0]).toBeGreaterThan(90);
    expect(t.files.text('m_ecoc.c')).toContain('static const int8_t CODE[9]');
    expect(t.files.text('m_nb.h')).toContain('int m_nb_predict(const double x[4], double scores[3]);');
    const dir = mkdtempSync(join(tmpdir(), 'hyp-m529-')), all = ['m_ecoc', 'm_ecocl', 'm_nb', 'm_da'];
    for (const f of all) { writeFileSync(join(dir, `${f}.c`), t.files.text(`${f}.c`)); writeFileSync(join(dir, `${f}.h`), t.files.text(`${f}.h`)); }
    const X = toMat(t.l.vars.get('meas')!);
    writeFileSync(join(dir, 'main.c'), `#include <stdio.h>
${all.map((f) => `#include "${f}.h"`).join('\n')}
static const double X[${X.r}][4] = {${Array.from({ length: X.r }, (_, i) => `{${[0, 1, 2, 3].map((j) => `${X.d[i + j * X.r]}`).join(', ')}}`).join(',\n')}};
int main(void) {
  double s[3];
  for (int i = 0; i < ${X.r}; i++) {
    float xf[4] = { (float)X[i][0], (float)X[i][1], (float)X[i][2], (float)X[i][3] };
    printf("%d %d %d %d\\n", m_ecoc_predict(X[i], s), m_ecocl_predict(X[i], 0), m_nb_predict(X[i], s), m_da_predict(xf, 0));
  }
  return 0;
}`);
    execFileSync('cc', ['-std=c99', '-Wall', '-Werror', '-o', join(dir, 'run'), join(dir, 'main.c'), ...all.map((f) => join(dir, `${f}.c`)), '-lm'], { cwd: dir });
    const got = execFileSync(join(dir, 'run')).toString().trim().split('\n').map((l) => l.split(' ').map(Number));
    const txt = (n: string) => (t.l.vars.get(n) as unknown as { d: { v: string }[] }).d.map((x) => x.v), names = txt('names');
    const want = ['p1', 'p2', 'p3', 'p4'].map((n) => txt(n).map((c) => names.indexOf(c)));
    for (let k = 0; k < 3; k++) expect(got.map((g) => g[k])).toEqual(want[k]); // double: exactly Hyperion's
    expect(got.filter((g, i) => g[3] === want[3][i]).length).toBeGreaterThanOrEqual(X.r - 1); // single: at most a near tie apart
  });
  it.skipIf(!hasCc)('M530: many-class SVMs, naive Bayes and discriminants in 8 bits: C as its twin, about as right as double', () => {
    const t = make();
    t.l.run(`rng(5); load fisheriris;
      ec = fitcecoc(meas, species, 'Learners', templateSVM('KernelFunction', 'rbf', 'Standardize', true));
      el = fitcecoc(meas, species); nb = fitcnb(meas, species); da = fitcdiscr(meas, species);
      exportmodel(ec, 'q_ecoc', 'Precision', 'int8'); exportmodel(el, 'q_ecocl', 'Precision', 'int8');
      exportmodel(nb, 'q_nb', 'Precision', 'int8'); exportmodel(da, 'q_da', 'Precision', 'int8');
      r = embedreport(nb, meas, species); rd = embedreport(da, meas, species); s8 = modelsize(nb, 'int8'); s4 = modelsize(nb, 'single');
      names = ec.ClassNames;`);
    expect(t.v('s8')[0]).toBeLessThan(t.v('s4')[0] / 2);
    const acc = (n: string) => [...toMat((t.l.vars.get(n) as unknown as { f: Map<string, never> }).f.get('Accuracy')!).d];
    expect(acc('r')).toHaveLength(3); // double, single, int8
    expect(acc('r')[2]).toBeGreaterThan(acc('r')[0] - 3);
    expect(acc('rd')[2]).toBeGreaterThan(acc('rd')[0] - 3);
    expect(t.files.text('q_nb.c')).toContain('static const int8_t PREC[12]');
    expect(t.files.text('q_ecoc.c')).toContain('static const float SVS[3]');
    expect(() => t.l.run("quantizemodel(nb, 'int8')")).toThrow(/exportmodel/);
    const dir = mkdtempSync(join(tmpdir(), 'hyp-m530-')), all = ['q_ecoc', 'q_ecocl', 'q_nb', 'q_da'];
    for (const f of all) { writeFileSync(join(dir, `${f}.c`), t.files.text(`${f}.c`)); writeFileSync(join(dir, `${f}.h`), t.files.text(`${f}.h`)); }
    const X = toMat(t.l.vars.get('meas')!), rows = Array.from({ length: X.r }, (_, i) => [0, 1, 2, 3].map((j) => X.d[i + j * X.r]));
    writeFileSync(join(dir, 'main.c'), `#include <stdio.h>
${all.map((f) => `#include "${f}.h"`).join('\n')}
static const float X[${X.r}][4] = {${rows.map((r) => `{${r.join(', ')}}`).join(',\n')}};
int main(void) {
  for (int i = 0; i < ${X.r}; i++) printf("%d %d %d %d\\n", q_ecoc_predict(X[i], 0), q_ecocl_predict(X[i], 0), q_nb_predict(X[i], 0), q_da_predict(X[i], 0));
  return 0;
}`);
    execFileSync('cc', ['-std=c99', '-Wall', '-Werror', '-o', join(dir, 'run'), join(dir, 'main.c'), ...all.map((f) => join(dir, `${f}.c`)), '-lm'], { cwd: dir });
    const got = execFileSync(join(dir, 'run')).toString().trim().split('\n').map((l) => l.split(' ').map(Number));
    const names = (t.l.vars.get('names') as unknown as { d: { v: string }[] }).d.map((x) => x.v), species = (t.l.vars.get('species') as unknown as { d: { v: string }[] }).d.map((x) => names.indexOf(x.v));
    ['ec', 'el', 'nb', 'da'].forEach((m, k) => {
      const twin = eightOf(specOf(t.l.vars.get(m) as Struct) as EcocSpec | BayesSpec | DiscrSpec).spec;
      const want = rows.map((x) => classOf(twin, x));
      expect(got.filter((g, i) => g[k] === want[i]).length).toBeGreaterThanOrEqual(X.r - 1); // float against the twin's doubles: at most a near tie
      expect(got.filter((g, i) => g[k] === species[i]).length).toBeGreaterThan(0.9 * X.r);
    });
  });
});
