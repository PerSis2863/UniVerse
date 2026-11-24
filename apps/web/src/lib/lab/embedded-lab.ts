import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { FileStore } from './files';
import { mat, num, str, toMat, type Cell, type Mat, type Struct, type Value } from './values';
import { bytes, fullIntC, modelC, planFullInt, quantizeInput, roundTrip, runFullInt, type NetSpec, type Prec, type Spec } from './embedded';

// Hyperion's embedded AI in the language (M481): quantizemodel, modelsize, embedreport and exportmodel, for the neural
// networks (fitcnet, fitrnet) and decision trees (fitctree, fitrtree) of the machine-learning toolbox. MATLAB does this
// with quantize / dlquantizer for deep networks and Coder for learners; these are our own names for plain models.
// M525: also SVMs (fitcsvm), k-nearest neighbours (fitcknn), tree ensembles (fitcensemble, fitrensemble, TreeBagger)
// and linear models (fitlm), in single or double; and networks wholly in 8 bits ('int8full', embedded.ts).

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 1, lab);
const fld = (m: Struct, k: string) => { const v = m.f.get(k); if (!v) throw new LabError(`This model has no ${k}.`); return v; };
const NETS = new Set(['ClassificationNeuralNetwork', 'RegressionNeuralNetwork']), TREES = new Set(['ClassificationTree', 'RegressionTree']);
const OTHERS = new Set(['ClassificationSVM', 'ClassificationKNN', 'ClassificationEnsemble', 'RegressionEnsemble', 'TreeBagger', 'LinearModel', 'GeneralizedLinearModel']);
function modelOf(v: Value | undefined): Struct {
  if (v?.k !== 'struct' || v.f.get('Type')?.k !== 'str') throw new LabError('Give a trained model (from fitcnet, fitrnet, fitctree, fitrtree, fitcsvm, fitcknn, fitcensemble, fitrensemble, TreeBagger or fitlm).');
  const t = textOf(v.f.get('Type')!);
  if (!NETS.has(t) && !TREES.has(t) && !OTHERS.has(t)) throw new LabError(`${t} isn’t made embedded here: neural networks, decision trees, SVMs, k-nearest neighbours, tree ensembles and linear models are.`);
  if (t === 'GeneralizedLinearModel' && v.f.has('ClassNames')) throw new LabError('A logistic model isn’t made embedded here (a linear one is).');
  return v;
}
const namesOf = (v: Value | undefined): string[] | null => (!v ? null : v.k === 'cell' ? v.d.map((x) => textOf(x)) : [...toMat(v).d].map(String));
const precOf = (v: Value | undefined): Prec => { const p = v ? textOf(v).toLowerCase() : 'int8'; if (p !== 'double' && p !== 'single' && p !== 'int8' && p !== 'int8full') throw new LabError("The precision is 'double', 'single', 'int8' (8-bit weights) or 'int8full' (a network wholly in 8 bits)."); return p; };
const rowsOf = (m: Mat): number[][] => Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c }, (_, j) => m.d[i + j * m.r]));
const treeAt = (t: Struct) => { const pred = [...toMat(fld(t, 'CutPredictorIndex')).d].map((p) => p - 1), ch = toMat(fld(t, 'Children')), n = pred.length; return { pred, cut: [...toMat(fld(t, 'CutPoint')).d], left: pred.map((_, i) => ch.d[i] - 1), right: pred.map((_, i) => ch.d[i + n] - 1) }; };
const stdOf = (m: Struct) => { const on = m.f.get('Standardize') && toMat(m.f.get('Standardize')!).d[0] && toMat(fld(m, 'Mu')).d.length; return on ? { mu: [...toMat(fld(m, 'Mu')).d], sigma: [...toMat(fld(m, 'Sigma')).d] } : { mu: null, sigma: null }; };
const METHOD: Record<string, 'bag' | 'adaboostm1' | 'adaboostm2' | 'lsboost'> = { bag: 'bag', adaboostm1: 'adaboostm1', adaboostm2: 'adaboostm2', lsboost: 'lsboost' };
function specOf(m: Struct): Spec {
  const t = textOf(fld(m, 'Type')), classes = namesOf(m.f.get('ClassNames'));
  const inputs = toMat(fld(m, 'X')).c;
  if (t === 'LinearModel' || t === 'GeneralizedLinearModel') return { kind: 'linear', beta: [...toMat(fld(m, 'Beta')).d], intercept: !!toMat(fld(m, 'Intercept')).d[0], inputs };
  if (t === 'ClassificationSVM') {
    const { mu, sigma } = stdOf(m), a = toMat(fld(m, 'Alpha')).d, y = toMat(fld(m, 'SupportVectorLabels')).d;
    return { kind: 'svm', sv: rowsOf(toMat(fld(m, 'SupportVectors'))), coef: [...a].map((v, i) => v * y[i]), bias: toMat(fld(m, 'Bias')).d[0], kernel: textOf(fld(m, 'KernelFunction')) as 'rbf', scale: toMat(fld(m, 'KernelScale')).d[0], order: toMat(fld(m, 'PolynomialOrder')).d[0], mu, sigma, classes: classes! };
  }
  if (t === 'ClassificationKNN') {
    const { mu, sigma } = stdOf(m), X = rowsOf(toMat(fld(m, 'X'))), names = classes!, y = fld(m, 'Y');
    const label = y.k === 'cell' ? y.d.map((v) => names.indexOf(textOf(v))) : [...toMat(y).d].map((v) => names.indexOf(String(v)));
    return { kind: 'knn', train: mu && sigma ? X.map((r) => r.map((v, j) => (v - mu[j]) / sigma[j])) : X, label, k: toMat(fld(m, 'NumNeighbors')).d[0], K: names.length, mu, sigma, classes: names };
  }
  if (t === 'ClassificationEnsemble' || t === 'RegressionEnsemble' || t === 'TreeBagger') {
    const K = classes ? classes.length : 0, method = t === 'TreeBagger' ? 'bag' : METHOD[textOf(fld(m, 'Method')).toLowerCase()];
    const trees = (fld(m, 'Trained') as Cell).d.map((v) => {
      const s = v as Struct, tr = treeAt(s);
      if (K) { const P = rowsOf(toMat(fld(s, 'ClassProbability'))); return { ...tr, probs: P, value: P.map((r) => r.indexOf(Math.max(...r))) }; }
      return { ...tr, probs: [], value: [...toMat(fld(s, 'NodeMean')).d] };
    });
    return { kind: 'ensemble', trees, alpha: [...toMat(fld(m, 'LearnerWeights')).d], method, K, init: toMat(fld(m, 'Init')).d[0], classes, inputs };
  }
  if (NETS.has(t)) {
    const W = (fld(m, 'LayerWeights') as Cell).d.map((v) => toMat(v)), b = (fld(m, 'LayerBiases') as Cell).d.map((v) => toMat(v).d);
    const on = m.f.get('Standardize') && toMat(m.f.get('Standardize')!).d[0], mu = on ? [...toMat(fld(m, 'Mu')).d] : null, sd = on ? [...toMat(fld(m, 'Sigma')).d] : null;
    return { kind: 'net', W, b, act: textOf(fld(m, 'Activations')) as 'relu', classes, mu, sigma: sd };
  }
  const pred = [...toMat(fld(m, 'CutPredictorIndex')).d].map((p) => p - 1), ch = toMat(fld(m, 'Children')), n = pred.length;
  let leaf: number[];
  if (classes) { const nc = namesOf(fld(m, 'NodeClass'))!; leaf = nc.map((c) => Math.max(0, classes.indexOf(c))); } else leaf = [...toMat(fld(m, 'NodeMean')).d];
  return { kind: 'tree', pred, cut: [...toMat(fld(m, 'CutPoint')).d], left: pred.map((_, i) => ch.d[i] - 1), right: pred.map((_, i) => ch.d[i + n] - 1), leaf, classes, inputs: toMat(fld(m, 'X')).c };
}
/** The model with its numbers as the chip would hold them (predict, loss and the rest work on it unchanged). */
function quantized(m: Struct, p: Prec): Struct {
  const out: Struct = { k: 'struct', f: new Map(m.f) }, t = textOf(fld(m, 'Type'));
  if (p === 'int8full') throw new LabError("A network wholly in 8 bits runs in C (exportmodel); embedreport measures it. quantizemodel takes 'int8', 'single' or 'double'.");
  if (OTHERS.has(t)) {
    if (p === 'int8') throw new LabError(`A ${t} keeps its numbers as 'single' or 'double'.`);
    const round = (k: string) => { const x = m.f.get(k); if (x?.k === 'mat') out.f.set(k, { ...x, d: roundTrip(x.d, p) }); };
    for (const k of ['SupportVectors', 'Alpha', 'Bias', 'KernelScale', 'Mu', 'Sigma', 'Beta', 'X']) round(k);
    if (t !== 'LinearModel' && t !== 'GeneralizedLinearModel' && m.f.has('Trained')) {
      const cell = fld(m, 'Trained') as Cell;
      out.f.set('Trained', { ...cell, d: cell.d.map((v) => { const s = v as Struct, c = toMat(fld(s, 'CutPoint')); return { ...s, f: new Map([...s.f, ['CutPoint', mat(c.r, c.c, roundTrip(c.d, p))]]) } as Struct; }) });
    }
    out.f.set('EmbeddedPrecision', str(p));
    return out;
  }
  if (NETS.has(t)) {
    const cell = fld(m, 'LayerWeights') as Cell;
    out.f.set('LayerWeights', { ...cell, d: cell.d.map((w) => { const x = toMat(w); return mat(x.r, x.c, roundTrip(x.d, p)); }) });
    if (p !== 'double') { const bc = fld(m, 'LayerBiases') as Cell; out.f.set('LayerBiases', { ...bc, d: bc.d.map((v) => { const x = toMat(v); return mat(x.r, x.c, roundTrip(x.d, 'single')); }) }); }
  } else {
    if (p === 'int8') throw new LabError("A tree's split points are kept as 'single' or 'double' (8 bits would move them).");
    const c = toMat(fld(m, 'CutPoint'));
    out.f.set('CutPoint', mat(c.r, c.c, roundTrip(c.d, p)));
  }
  out.f.set('EmbeddedPrecision', str(p));
  return out;
}
def('quantizemodel', (a) => [quantized(modelOf(a[0]), precOf(a[1]))]);
def('modelsize', (a) => [num(bytes(specOf(modelOf(a[0])), precOf(a[1] ?? str('double'))))]);
def('embedreport', (a, nout, lab) => {
  const m = modelOf(a[0]);
  if (!a[1] || !a[2]) throw new LabError('embedreport(model, X, Y): rows to test on and their answers.');
  const spec = specOf(m), precs: Prec[] = spec.kind === 'net' ? ['double', 'single', 'int8'] : ['double', 'single'], classes = spec.kind === 'svm' || spec.kind === 'knn' || ((spec.kind === 'net' || spec.kind === 'tree' || spec.kind === 'ensemble') && !!spec.classes);
  const rows = precs.map((p) => ({ p: p as string, size: bytes(spec, p), err: toMat(call(lab, 'loss', quantized(m, p), a[1], a[2])[0]).d[0] }));
  // M525: the network wholly in 8 bits, run exactly as its C would.
  if (spec.kind === 'net') rows.push({ p: 'int8full', size: bytes(spec, 'int8full'), err: fullLoss(spec, toMat(fld(m, 'X')), toMat(a[1]), a[2]) });
  const score = (e: number) => (classes ? 100 * (1 - e) : Math.sqrt(e));
  const col = (xs: number[]): Mat => mat(xs.length, 1, xs);
  const T: Struct = { k: 'struct', table: true, f: new Map<string, Value>([['Precision', { k: 'cell', r: rows.length, c: 1, d: rows.map((r) => str(r.p)) }], ['Bytes', col(rows.map((r) => r.size))], [classes ? 'Accuracy' : 'RMSE', col(rows.map((r) => score(r.err)))]]) };
  if (nout > 0) return [T];
  lab.host.out(`${rows.map((r) => `  ${r.p.padEnd(7)} ${String(r.size).padStart(8)} bytes   ${classes ? `${score(r.err).toFixed(1)}% right` : `RMSE ${score(r.err).toPrecision(4)}`}`).join('\n')}\n`);
  BUILTINS.subplot([num(1), num(2), num(1)], 0, lab); BUILTINS.bar([col(rows.map((r) => r.size / 1024))], 0, lab);
  BUILTINS.title([str('Size (KB)')], 0, lab); BUILTINS.xticklabels?.([{ k: 'cell', r: 1, c: rows.length, d: rows.map((r) => str(r.p)) }], 0, lab);
  BUILTINS.subplot([num(1), num(2), num(2)], 0, lab); BUILTINS.bar([col(rows.map((r) => score(r.err)))], 0, lab);
  BUILTINS.title([str(classes ? 'Accuracy (%)' : 'RMSE')], 0, lab); BUILTINS.xticklabels?.([{ k: 'cell', r: 1, c: rows.length, d: rows.map((r) => str(r.p)) }], 0, lab);
  return [];
});
/** Error rate (classes) or mean squared error of the wholly 8-bit network, on rows and answers. */
function fullLoss(spec: NetSpec, train: Mat, X: Mat, Y: Value): number {
  const plan = planFullInt(spec, rowsOf(train)), rows = rowsOf(X);
  if (spec.classes) {
    const truth = Y.k === 'cell' ? Y.d.map((v) => spec.classes!.indexOf(textOf(v))) : [...toMat(Y).d].map((v) => spec.classes!.indexOf(String(v)));
    return rows.reduce((s, x, i) => s + (runFullInt(plan, quantizeInput(plan, x)).cls === truth[i] ? 0 : 1), 0) / rows.length;
  }
  const t = toMat(Y).d;
  return rows.reduce((s, x, i) => s + (runFullInt(plan, quantizeInput(plan, x)).out[0] - t[i]) ** 2, 0) / rows.length;
}
def('exportmodel', (a, nout, lab) => {
  const m = modelOf(a[0]), name = a[1] ? textOf(a[1]).replace(/[^A-Za-z0-9_]/g, '_') : 'model';
  let p: Prec = NETS.has(textOf(fld(m, 'Type'))) ? 'int8' : 'single';
  // (M525: SVMs, k-NN, ensembles and linear models default to single.)
  for (let i = 2; i + 1 < a.length; i += 2) { if (textOf(a[i]).toLowerCase() !== 'precision') throw new LabError("exportmodel takes 'Precision' ('double', 'single' or 'int8')."); p = precOf(a[i + 1]); }
  const spec = specOf(m);
  if (spec.kind !== 'net') { if (p === 'int8' || p === 'int8full') { if (a.length > 2) throw new LabError(`This model is written with 'single' or 'double' numbers.`); p = 'single'; } }
  let out: { c: string; h: string };
  try { out = spec.kind === 'net' && p === 'int8full' ? fullIntC(planFullInt(spec, rowsOf(toMat(fld(m, 'X')))), name) : modelC(spec, name, p); } catch (e) { throw new LabError((e as Error).message); }
  const fs = (lab.host as { files?: unknown }).files;
  if (fs instanceof FileStore) { fs.putText(`${name}.c`, out.c); fs.putText(`${name}.h`, out.h); }
  if (nout > 0) return [{ k: 'struct', f: new Map<string, Value>([['C', str(out.c)], ['H', str(out.h)], ['Bytes', num(bytes(spec, p))]]) } satisfies Struct];
  lab.host.out(`Wrote ${name}.c and ${name}.h (${bytes(spec, p).toLocaleString()} bytes of ${p} numbers): call ${name}_predict(x${(spec.kind === 'net' && spec.classes && p !== 'int8full') || (spec.kind === 'ensemble' && spec.classes) ? ', scores' : spec.kind === 'svm' ? ', &score' : ''}).\n`);
  return [];
});
