import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { FileStore } from './files';
import { mat, num, str, toMat, type Cell, type Mat, type Struct, type Value } from './values';
import { bytes, modelC, roundTrip, type Prec, type Spec } from './embedded';

// Hyperion's embedded AI in the language (M481): quantizemodel, modelsize, embedreport and exportmodel, for the neural
// networks (fitcnet, fitrnet) and decision trees (fitctree, fitrtree) of the machine-learning toolbox. MATLAB does this
// with quantize / dlquantizer for deep networks and Coder for learners; these are our own names for plain models.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 1, lab);
const fld = (m: Struct, k: string) => { const v = m.f.get(k); if (!v) throw new LabError(`This model has no ${k}.`); return v; };
const NETS = new Set(['ClassificationNeuralNetwork', 'RegressionNeuralNetwork']), TREES = new Set(['ClassificationTree', 'RegressionTree']);
function modelOf(v: Value | undefined): Struct {
  if (v?.k !== 'struct' || v.f.get('Type')?.k !== 'str') throw new LabError('Give a trained model (from fitcnet, fitrnet, fitctree or fitrtree).');
  const t = textOf(v.f.get('Type')!);
  if (!NETS.has(t) && !TREES.has(t)) throw new LabError(`${t} isn’t made embedded here: neural networks (fitcnet, fitrnet) and decision trees (fitctree, fitrtree) are.`);
  return v;
}
const namesOf = (v: Value | undefined): string[] | null => (!v ? null : v.k === 'cell' ? v.d.map((x) => textOf(x)) : [...toMat(v).d].map(String));
const precOf = (v: Value | undefined): Prec => { const p = v ? textOf(v).toLowerCase() : 'int8'; if (p !== 'double' && p !== 'single' && p !== 'int8') throw new LabError("The precision is 'double', 'single' or 'int8'."); return p; };
function specOf(m: Struct): Spec {
  const t = textOf(fld(m, 'Type')), classes = namesOf(m.f.get('ClassNames'));
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
  const out: Struct = { k: 'struct', f: new Map(m.f) };
  if (NETS.has(textOf(fld(m, 'Type')))) {
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
  const spec = specOf(m), precs: Prec[] = spec.kind === 'net' ? ['double', 'single', 'int8'] : ['double', 'single'], classes = !!spec.classes;
  const rows = precs.map((p) => ({ p, size: bytes(spec, p), err: toMat(call(lab, 'loss', quantized(m, p), a[1], a[2])[0]).d[0] }));
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
def('exportmodel', (a, nout, lab) => {
  const m = modelOf(a[0]), name = a[1] ? textOf(a[1]).replace(/[^A-Za-z0-9_]/g, '_') : 'model';
  let p: Prec = NETS.has(textOf(fld(m, 'Type'))) ? 'int8' : 'single';
  for (let i = 2; i + 1 < a.length; i += 2) { if (textOf(a[i]).toLowerCase() !== 'precision') throw new LabError("exportmodel takes 'Precision' ('double', 'single' or 'int8')."); p = precOf(a[i + 1]); }
  const spec = specOf(m);
  if (spec.kind === 'tree' && p === 'int8') throw new LabError("A tree is written with 'single' or 'double' split points.");
  const out = modelC(spec, name, p), fs = (lab.host as { files?: unknown }).files;
  if (fs instanceof FileStore) { fs.putText(`${name}.c`, out.c); fs.putText(`${name}.h`, out.h); }
  if (nout > 0) return [{ k: 'struct', f: new Map<string, Value>([['C', str(out.c)], ['H', str(out.h)], ['Bytes', num(bytes(spec, p))]]) } satisfies Struct];
  lab.host.out(`Wrote ${name}.c and ${name}.h (${bytes(spec, p).toLocaleString()} bytes of ${p} numbers): call ${name}_predict(x${spec.kind === 'net' && spec.classes ? ', scores' : ''}).\n`);
  return [];
});
