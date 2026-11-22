import { LabError } from './parse';
import './files';
import { BUILTINS, random, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { col, mat, num, str, toMat, type Cell, type Mat, type Struct, type Value } from './values';
import { isTable, names as columnNames, table } from './table';
import { gfx } from './plot';
import { IRIS_SPECIES, irisRows } from './iris';
import * as ml from './ml';
import { netPredictor, trainNet, type Act, type Net } from './ml-net';

// Hyperion's machine learning toolbox in the language (M416): classifiers (fitcknn, fitctree, fitcnb, fitcdiscr,
// fitcsvm, fitcecoc), regression (fitrtree, fitlm, fitglm), predict / loss / resubLoss, cross-validation (crossval,
// kfoldLoss, kfoldPredict, cvpartition, training, test), confusionmat and confusionchart, gscatter, kmeans, dbscan, pca,
// perfcurve, and the iris flowers (load fisheriris). A model is a struct that keeps its data and what it learnt in plain
// fields (Type says which), so predict, crossval and the learner window read it back; nothing is hidden.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const cellCol = (d: Value[]): Cell => ({ k: 'cell', r: d.length, c: 1, d });
const cellRow = (d: string[]): Cell => ({ k: 'cell', r: 1, c: d.length, d: d.map(str) });
const rowsOf = (m: Mat): ml.Rows => Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c }, (_, j) => m.d[i + j * m.r]));
const matOf = (X: ml.Rows, c = X[0]?.length ?? 0): Mat => { const m = mat(X.length, c); X.forEach((r, i) => r.forEach((v, j) => { m.d[i + j * X.length] = v; })); return m; };
const field = (s: Struct, name: string) => { const v = s.f.get(name); if (!v) throw new LabError(`This model has no ${name}.`); return v; };
const fnum = (s: Struct, name: string) => toMat(field(s, name)).d[0];

// ——— Options ———
type Opts = Map<string, Value>;
function options(a: Value[], from: number): Opts {
  const o: Opts = new Map();
  for (let i = from; i < a.length; i += 2) {
    const k = a[i];
    if (k.k !== 'str') throw new LabError('Options come in pairs: a name in quotes, then its value.');
    if (i + 1 >= a.length) throw new LabError(`The option '${k.v}' needs a value.`);
    o.set(k.v.toLowerCase(), a[i + 1]);
  }
  return o;
}
const optNum = (o: Opts, name: string, d: number) => { const v = o.get(name); return v === undefined ? d : toMat(v, name).d[0]; };
const optStr = (o: Opts, name: string, d: string) => { const v = o.get(name); return v === undefined ? d : textOf(v).toLowerCase(); };
const optBool = (o: Opts, name: string, d: boolean) => { const v = o.get(name); return v === undefined ? d : v.k === 'str' ? /^(on|true|yes)$/i.test(v.v) : toMat(v).d[0] !== 0; };

// ——— Labels ———
interface Labels { y: number[]; K: number; names: string[]; classes: Value; back: (idx: number[]) => Value }
const missing = (v: Value, i: number) => (v.k === 'cell' ? v.d[i].k === 'str' && (v.d[i] as { v: string }).v === '' : Number.isNaN((v as Mat).d[i]));
const labelCount = (v: Value) => (v.k === 'cell' ? v.d.length : v.k === 'mat' ? v.d.length : 0);
/** Labels as class numbers 0…K-1 (classes sorted, as unique sorts them) and the way back to the labels' own kind. */
function labelsOf(v: Value, what = 'The labels'): Labels {
  if (v.k === 'cell') {
    const s = v.d.map((x) => { if (x.k !== 'str') throw new LabError(`${what} must all be text (or all numbers).`); return x.v; });
    const names = [...new Set(s)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), at = new Map(names.map((n, i) => [n, i]));
    return { y: s.map((x) => at.get(x)!), K: names.length, names, classes: cellCol(names.map(str)), back: (idx) => cellCol(idx.map((i) => str(names[i]))) };
  }
  if (v.k === 'mat') {
    const keys = [...new Set(v.d)].sort((a, b) => a - b), at = new Map(keys.map((k, i) => [k, i]));
    return { y: [...v.d].map((x) => at.get(x)!), K: keys.length, names: keys.map(String), classes: mat(keys.length, 1, keys, v.logical), back: (idx) => mat(idx.length, 1, idx.map((i) => keys[i]), v.logical) };
  }
  throw new LabError(`${what} should be numbers, true/false, or a cell of text like {'cat'; 'dog'}.`);
}
const subset = (v: Value, rows: number[]): Value => (v.k === 'cell' ? cellCol(rows.map((i) => v.d[i])) : mat(rows.length, 1, rows.map((i) => (v as Mat).d[i]), (v as Mat).logical));

// ——— Data in ———
interface Data { X: ml.Rows; y: Value | null; predictors: string[]; response: string; rest: number }
/** Predictors and response from (X, Y, …) or (table, 'Response' or 'y ~ a + b', …); rows with a gap are left out. */
function dataOf(a: Value[], name: string): Data {
  let X: ml.Rows, y: Value | null = null, predictors: string[], response = 'Y', rest: number;
  if (isTable(a[0])) {
    const t = a[0], cols = columnNames(t), second = a[1];
    let preds: string[] | null = null;
    if (second?.k === 'str' && (second.v.includes('~') || cols.includes(second.v))) {
      rest = 2;
      if (second.v.includes('~')) { const [l, r] = second.v.split('~'); response = l.trim(); preds = r.trim() === '.' ? null : r.split('+').map((s) => s.trim()).filter(Boolean); }
      else response = second.v;
    } else { rest = 1; response = cols[cols.length - 1]; }
    if (!cols.includes(response)) throw new LabError(`The table has no column “${response}” (its columns: ${cols.join(', ')}).`);
    preds ??= cols.filter((c) => c !== response && t.f.get(c)!.k === 'mat');
    const parts = preds.map((p) => { const v = t.f.get(p); if (!v) throw new LabError(`The table has no column “${p}”.`); if (v.k !== 'mat') throw new LabError(`The column “${p}” isn’t numbers; ${name} learns from number columns.`); return v; });
    const n = parts[0]?.r ?? 0;
    X = Array.from({ length: n }, (_, i) => parts.flatMap((m) => Array.from({ length: m.c }, (_, j) => m.d[i + j * m.r])));
    predictors = preds.flatMap((p, k) => (parts[k].c > 1 ? Array.from({ length: parts[k].c }, (_, j) => `${p}_${j + 1}`) : [p]));
    y = t.f.get(response)!;
  } else {
    if (!a[0]) throw new LabError(`${name} needs the data: ${name}(X, Y) with a row per example.`);
    let m = toMat(a[0], 'The predictors');
    if (!a[1]) throw new LabError(`${name} needs the answers too: ${name}(X, Y), Y with one entry per row of X.`);
    y = a[1];
    // A single row of values with as many answers is one predictor.
    if (m.r === 1 && m.c > 1 && labelCount(y) === m.c) m = mat(m.c, 1, m.d);
    X = rowsOf(m);
    predictors = Array.from({ length: m.c }, (_, j) => `x${j + 1}`);
    rest = 2;
  }
  if (y && labelCount(y) !== X.length) throw new LabError(`There are ${X.length} rows of predictors but ${labelCount(y)} answers: one answer per row.`);
  const keep = X.map((r, i) => r.every(Number.isFinite) && !(y && missing(y, i)));
  if (keep.some((k) => !k)) { const rows = keep.flatMap((k, i) => (k ? [i] : [])); X = rows.map((i) => X[i]); if (y) y = subset(y, rows); }
  if (!X.length) throw new LabError(`${name} has no complete rows to learn from.`);
  return { X, y, predictors, response, rest };
}
/** New rows to predict: a matrix, or a table with the model's predictor columns. */
function rowsFor(model: Struct, v: Value): ml.Rows {
  const preds = (field(model, 'PredictorNames') as Cell).d.map((x) => textOf(x));
  if (isTable(v)) return rowsOfTable(v, preds);
  const m = toMat(v, 'The new rows');
  const X = m.c === preds.length ? rowsOf(m) : m.r === preds.length && m.c !== preds.length ? rowsOf(mat(m.c, m.r, m.d)) : null;
  if (!X) throw new LabError(`This model learnt from ${preds.length} predictor${preds.length === 1 ? '' : 's'}: give rows with ${preds.length} column${preds.length === 1 ? '' : 's'}.`);
  return X;
}
function rowsOfTable(t: Struct, preds: string[]): ml.Rows {
  const cols = preds.map((p) => { const base = p.replace(/_\d+$/, ''), v = t.f.get(p) ?? t.f.get(base); if (!v || v.k !== 'mat') throw new LabError(`The table needs the column “${p}”.`); return { v, j: t.f.has(p) ? 0 : Number(p.match(/_(\d+)$/)?.[1] ?? 1) - 1 }; });
  const n = cols[0]?.v.r ?? 0;
  return Array.from({ length: n }, (_, i) => cols.map(({ v, j }) => v.d[i + j * v.r]));
}

// ——— Models ———
type Kind = 'ClassificationKNN' | 'ClassificationTree' | 'ClassificationNaiveBayes' | 'ClassificationDiscriminant' | 'ClassificationSVM' | 'ClassificationECOC' | 'ClassificationNeuralNetwork' | 'ClassificationEnsemble' | 'RegressionTree' | 'RegressionNeuralNetwork' | 'RegressionEnsemble' | 'TreeBagger' | 'LinearModel' | 'GeneralizedLinearModel';
const REGRESSION = new Set<Kind>(['RegressionTree', 'RegressionNeuralNetwork', 'RegressionEnsemble', 'LinearModel', 'GeneralizedLinearModel']);
const typeOf = (v: Value): Kind => {
  if (v.k !== 'struct' || !v.f.has('Type')) throw new LabError('That isn’t a model: make one with fitcknn, fitctree, fitcsvm, fitlm…');
  return textOf(v.f.get('Type')!) as Kind;
};
const isModel = (v: Value | undefined): v is Struct => !!v && v.k === 'struct' && v.f.has('Type') && v.f.has('PredictorNames');
function model(kind: Kind, d: Data, extra: [string, Value][], lab: Labels | null): Struct {
  return { k: 'struct', f: new Map<string, Value>([['Type', str(kind)], ['PredictorNames', cellRow(d.predictors)], ['ResponseName', str(d.response)], ...(lab ? [['ClassNames', lab.classes] as [string, Value]] : []), ['NumObservations', num(d.X.length)], ...extra, ['X', matOf(d.X, d.predictors.length)], ['Y', d.y!]]) };
}
const stdOf = (X: ml.Rows, on: boolean) => (on ? ml.colStats(X) : null);
const scaled = (m: Struct, X: ml.Rows) => {
  const mu = m.f.get('Mu'), sd = m.f.get('Sigma');
  return mu && sd && toMat(mu).d.length && m.f.get('Standardize') && toMat(m.f.get('Standardize')!).d[0] ? ml.standardise(X, [...toMat(mu).d], [...toMat(sd).d]) : X;
};

type Fit = (d: Data, o: Opts) => Struct;
const FIT: Partial<Record<Kind, Fit>> = {};
/** Each kind's settings, read back from a model so cross-validation can learn the same way again. */
const SETTINGS: Partial<Record<Kind, string[]>> = {
  ClassificationKNN: ['NumNeighbors', 'Standardize'],
  ClassificationTree: ['MaxNumSplits', 'MinLeafSize', 'MinParentSize'],
  RegressionTree: ['MaxNumSplits', 'MinLeafSize', 'MinParentSize'],
  ClassificationSVM: ['KernelFunction', 'KernelScale', 'BoxConstraint', 'PolynomialOrder', 'Standardize'],
  ClassificationECOC: ['KernelFunction', 'KernelScale', 'BoxConstraint', 'PolynomialOrder', 'Standardize'],
  GeneralizedLinearModel: ['Distribution'],
  ClassificationNeuralNetwork: ['LayerSizes', 'Activations', 'Lambda', 'IterationLimit', 'Standardize'],
  RegressionNeuralNetwork: ['LayerSizes', 'Activations', 'Lambda', 'IterationLimit', 'Standardize'],
  ClassificationEnsemble: ['Method', 'NumLearningCycles', 'LearnRate', 'MaxNumSplits', 'MinLeafSize', 'NumVariablesToSample'],
  RegressionEnsemble: ['Method', 'NumLearningCycles', 'LearnRate', 'MaxNumSplits', 'MinLeafSize', 'NumVariablesToSample'],
  TreeBagger: ['NumTrees', 'Method', 'MinLeafSize', 'NumVariablesToSample'],
};
const settingsOf = (m: Struct): Opts => new Map((SETTINGS[typeOf(m)] ?? []).filter((k) => m.f.has(k)).map((k) => [k.toLowerCase(), m.f.get(k)!]));

FIT.ClassificationKNN = (d, o) => {
  const L = labelsOf(d.y!), k = Math.max(1, Math.round(optNum(o, 'numneighbors', 1))), on = optBool(o, 'standardize', false), s = stdOf(d.X, on);
  const dist = optStr(o, 'distance', 'euclidean');
  if (dist !== 'euclidean') throw new LabError('fitcknn measures straight-line (euclidean) distance here.');
  return model('ClassificationKNN', d, [['NumNeighbors', num(k)], ['Distance', str('euclidean')], ['Standardize', mat(1, 1, [on ? 1 : 0], true)], ['Mu', s ? mat(1, s.mu.length, s.mu) : mat(0, 0)], ['Sigma', s ? mat(1, s.sd.length, s.sd) : mat(0, 0)]], L);
};
function treeFields(t: ml.Tree, d: Data, L: Labels | null): [string, Value][] {
  const n = t.pred.length;
  return [
    ['CutPredictor', cellCol(t.pred.map((p) => str(p >= 0 ? d.predictors[p] : '')))],
    ['CutPredictorIndex', mat(n, 1, t.pred.map((p) => p + 1))],
    ['CutPoint', mat(n, 1, t.cut)],
    ['Children', matOf(t.pred.map((_, i) => (t.left[i] >= 0 ? [t.left[i] + 1, t.right[i] + 1] : [0, 0])), 2)],
    ...(L ? [['NodeClass', L.back(t.value)] as [string, Value], ['ClassProbability', matOf(t.probs, L.K)] as [string, Value]] : [['NodeMean', mat(n, 1, t.value)] as [string, Value]]),
    ['NodeSize', mat(n, 1, t.size)],
    ['PredictorImportance', mat(1, d.predictors.length, ml.importance(t, d.predictors.length).map((v) => v / Math.max(1, t.pred.filter((q) => q >= 0).length)))],
  ];
}
const treeOpts = (o: Opts, n: number) => ({ maxSplits: Math.max(0, Math.round(optNum(o, 'maxnumsplits', n - 1))), minLeaf: Math.max(1, Math.round(optNum(o, 'minleafsize', 1))), minParent: Math.max(2, Math.round(optNum(o, 'minparentsize', 10))) });
const treeSettings = (t: ReturnType<typeof treeOpts>): [string, Value][] => [['MaxNumSplits', num(t.maxSplits)], ['MinLeafSize', num(t.minLeaf)], ['MinParentSize', num(t.minParent)]];
FIT.ClassificationTree = (d, o) => {
  const L = labelsOf(d.y!), to = treeOpts(o, d.X.length), t = ml.growTree(d.X, L.y, { K: L.K, ...to });
  return model('ClassificationTree', d, [...treeFields(t, d, L), ...treeSettings(to)], L);
};
FIT.RegressionTree = (d, o) => {
  const y = [...toMat(d.y!, 'The response').d], to = treeOpts(o, d.X.length), t = ml.growTree(d.X, y, to);
  return model('RegressionTree', d, [...treeFields(t, d, null), ...treeSettings(to)], null);
};
FIT.ClassificationNaiveBayes = (d) => {
  const L = labelsOf(d.y!);
  let nb: ml.NB;
  try { nb = ml.fitNB(d.X, L.y, L.K); } catch (e) { throw new LabError((e as Error).message); }
  return model('ClassificationNaiveBayes', d, [['DistributionNames', str('normal')], ['Mu', matOf(nb.mu)], ['Sigma', matOf(nb.sd)], ['Prior', mat(1, L.K, nb.prior)]], L);
};
FIT.ClassificationDiscriminant = (d) => {
  const L = labelsOf(d.y!);
  let m: ml.LDA;
  try { m = ml.fitLDA(d.X, L.y, L.K); } catch (e) { throw new LabError((e as Error).message); }
  return model('ClassificationDiscriminant', d, [['DiscrimType', str('linear')], ['Mu', matOf(m.mu)], ['Sigma', matOf(m.sigma)], ['Prior', mat(1, L.K, m.prior)]], L);
};
const KERNELS: Record<string, ml.Kernel> = { linear: 'linear', rbf: 'rbf', gaussian: 'rbf', polynomial: 'polynomial' };
function svmOpts(o: Opts, X: ml.Rows) {
  const kernel = KERNELS[optStr(o, 'kernelfunction', 'linear')];
  if (!kernel) throw new LabError("KernelFunction is 'linear', 'rbf' (or 'gaussian') or 'polynomial'.");
  const ks = o.get('kernelscale'), scale = ks && ks.k === 'str' ? ml.autoScale(X) : ks ? toMat(ks).d[0] : 1;
  return { kernel, scale, C: optNum(o, 'boxconstraint', 1), order: Math.round(optNum(o, 'polynomialorder', 3)) };
}
/** A binary SVM's fields, learnt on (standardised) rows with labels ±1. */
function svmFields(X: ml.Rows, t: number[], o: Opts): [string, Value][] {
  const on = optBool(o, 'standardize', false), s = stdOf(X, on), Z = s ? ml.standardise(X, s.mu, s.sd) : X, so = svmOpts(o, Z);
  let m: ml.Svm;
  try { m = ml.fitSVM(Z, t, so); } catch (e) { throw new LabError((e as Error).message); }
  const p = X[0].length, beta = so.kernel === 'linear' ? Array.from({ length: p }, (_, j) => m.alpha.reduce((acc, a, q) => acc + (a * m.svY[q] * m.sv[q][j]) / so.scale ** 2, 0)) : null;
  return [
    ['KernelFunction', str(so.kernel)], ['KernelScale', num(so.scale)], ['BoxConstraint', num(so.C)], ['PolynomialOrder', num(so.order)], ['Standardize', mat(1, 1, [on ? 1 : 0], true)],
    ['Mu', s ? mat(1, p, s.mu) : mat(0, 0)], ['Sigma', s ? mat(1, p, s.sd) : mat(0, 0)],
    ['Alpha', mat(m.alpha.length, 1, m.alpha)], ['SupportVectors', matOf(m.sv, p)], ['SupportVectorLabels', mat(m.svY.length, 1, m.svY)], ['Bias', num(m.bias)],
    ['Beta', beta ? mat(p, 1, beta) : mat(0, 0)], ['Converged', mat(1, 1, [m.converged ? 1 : 0], true)],
  ];
}
FIT.ClassificationSVM = (d, o) => {
  const L = labelsOf(d.y!);
  if (L.K !== 2) throw new LabError(`fitcsvm separates two classes (these labels have ${L.K}); for more, use fitcecoc, which joins one SVM per pair of classes.`);
  return model('ClassificationSVM', d, svmFields(d.X, L.y.map((c) => (c === 1 ? 1 : -1)), o), L);
};
FIT.ClassificationECOC = (d, o) => {
  const L = labelsOf(d.y!);
  if (L.K < 2) throw new LabError('fitcecoc needs at least two classes.');
  // A template's settings count as options.
  const tpl = o.get('learners');
  if (tpl && tpl.k === 'struct') { for (const [k, v] of tpl.f) if (k !== 'Type') o.set(k.toLowerCase(), v); }
  else if (tpl && !(tpl.k === 'str' && /^svm$/i.test(tpl.v))) throw new LabError("fitcecoc's learners here are support vector machines: 'Learners', 'svm' or templateSVM(…).");
  const pairs: [number, number][] = [], learners: Value[] = [];
  for (let a = 0; a < L.K; a++) for (let b = a + 1; b < L.K; b++) pairs.push([a, b]);
  for (const [a, b] of pairs) {
    const rows = L.y.flatMap((c, i) => (c === a || c === b ? [i] : []));
    learners.push({ k: 'struct', f: new Map(svmFields(rows.map((i) => d.X[i]), rows.map((i) => (L.y[i] === b ? 1 : -1)), o)) } satisfies Struct);
  }
  const coding = mat(L.K, pairs.length);
  pairs.forEach(([a, b], l) => { coding.d[a + l * L.K] = -1; coding.d[b + l * L.K] = 1; });
  const first = (learners[0] as Struct).f;
  return model('ClassificationECOC', d, [['CodingMatrix', coding], ['BinaryLearners', cellCol(learners)], ...['KernelFunction', 'KernelScale', 'BoxConstraint', 'PolynomialOrder', 'Standardize'].map((k) => [k, first.get(k)!] as [string, Value])], L);
};
/** A network learnt on (standardised) rows: classes 0…K-1, or numbers when K is 0. */
function netFields(d: Data, y: number[], K: number, o: Opts): [string, Value][] {
  const layers = o.has('layersizes') ? [...toMat(o.get('layersizes')!, 'LayerSizes').d].map(Math.round) : [10];
  if (!layers.length || layers.length > 10 || layers.some((v) => !(v >= 1 && v <= 2000))) throw new LabError('LayerSizes is a row of hidden layer sizes, like [10 10] (1 to 2,000 each, at most 10 layers).');
  const act = optStr(o, 'activations', 'relu') as Act;
  if (!['relu', 'tanh', 'sigmoid', 'none'].includes(act)) throw new LabError("Activations is 'relu', 'tanh', 'sigmoid' or 'none'.");
  const lambda = optNum(o, 'lambda', 0), iters = Math.max(0, Math.round(optNum(o, 'iterationlimit', 1000))), on = optBool(o, 'standardize', false), s = stdOf(d.X, on);
  const net = trainNet(s ? ml.standardise(d.X, s.mu, s.sd) : d.X, y, random, { layers, act, lambda, iterLimit: iters, K });
  const p = d.X[0].length, cellOf = (list: Value[]): Cell => ({ k: 'cell', r: 1, c: list.length, d: list });
  const W = net.W.map((w, l) => { const nin = net.sizes[l], nout = net.sizes[l + 1], m = mat(nout, nin); for (let q = 0; q < nout; q++) for (let i = 0; i < nin; i++) m.d[q + i * nout] = w[q * nin + i]; return m; });
  return [
    ['LayerSizes', mat(1, layers.length, layers)], ['Activations', str(act)], ['Lambda', num(lambda)], ['IterationLimit', num(iters)], ['Standardize', mat(1, 1, [on ? 1 : 0], true)],
    ['Mu', s ? mat(1, p, s.mu) : mat(0, 0)], ['Sigma', s ? mat(1, p, s.sd) : mat(0, 0)],
    ['LayerWeights', cellOf(W)], ['LayerBiases', cellOf(net.b.map((b) => col([...b])))],
    ['TrainingHistory', table([['Iteration', col(net.history.map((_, i) => i))], ['TrainingLoss', col(net.history)]])],
    ['ConvergenceInfo', { k: 'struct', f: new Map<string, Value>([['Iterations', num(net.iterations)], ['ConvergenceCriterion', str(net.reason)], ['TrainingLoss', num(net.history[net.history.length - 1])]]) }],
  ];
}
function netOf(m: Struct): Net {
  const W = (field(m, 'LayerWeights') as Cell).d.map((v) => toMat(v)), b = (field(m, 'LayerBiases') as Cell).d.map((v) => Float64Array.from(toMat(v).d));
  const sizes = [W[0].c, ...W.map((w) => w.r)];
  return { sizes, W: W.map((w) => { const o = new Float64Array(w.r * w.c); for (let q = 0; q < w.r; q++) for (let i = 0; i < w.c; i++) o[q * w.c + i] = w.d[q + i * w.r]; return o; }), b, act: textOf(field(m, 'Activations')) as Act, K: m.f.has('ClassNames') ? W[W.length - 1].r : 0, history: [], iterations: 0, reason: '' };
}
FIT.ClassificationNeuralNetwork = (d, o) => { const L = labelsOf(d.y!); if (L.K < 2) throw new LabError('fitcnet needs at least two classes.'); return model('ClassificationNeuralNetwork', d, netFields(d, L.y, L.K, o), L); };
FIT.RegressionNeuralNetwork = (d, o) => model('RegressionNeuralNetwork', d, netFields(d, [...toMat(d.y!, 'The response').d], 0, o), null);
// ——— Ensembles ———
const TREE_OPTS: Record<string, string> = { maxnumsplits: 'MaxNumSplits', minleafsize: 'MinLeafSize', numvariablestosample: 'NumVariablesToSample' };
def('templateTree', (a) => { const o = options(a, 0), f = new Map<string, Value>([['Type', str('templateTree')]]); for (const [k, v] of o) f.set(TREE_OPTS[k] ?? k, v); return [{ k: 'struct', f } satisfies Struct]; });
const METHODS: Record<string, ml.EnsembleMethod> = { bag: 'bag', adaboostm1: 'adaboostm1', adaboostm2: 'adaboostm2', lsboost: 'lsboost' };
const METHOD_NAMES: Record<ml.EnsembleMethod, string> = { bag: 'Bag', adaboostm1: 'AdaBoostM1', adaboostm2: 'AdaBoostM2', lsboost: 'LSBoost' };
const treeCell = (t: ml.Tree, K: number): Struct => ({ k: 'struct', f: new Map<string, Value>([
  ['CutPredictorIndex', mat(t.pred.length, 1, t.pred.map((q) => q + 1))], ['CutPoint', mat(t.cut.length, 1, t.cut)],
  ['Children', matOf(t.pred.map((_, i) => (t.left[i] >= 0 ? [t.left[i] + 1, t.right[i] + 1] : [0, 0])), 2)],
  K ? ['ClassProbability', matOf(t.probs, K)] : ['NodeMean', mat(t.value.length, 1, t.value)],
]) });
/** An ensemble's fields, its settings first (crossval learns the same way from them). */
function fitEnsembleFields(d: Data, y: number[], K: number, o: Opts, dflt: ml.EnsembleMethod, tb = false): [string, Value][] {
  const tpl = o.get('learners');
  if (tpl && tpl.k === 'struct') { for (const [k, v] of tpl.f) if (k !== 'Type') o.set(k.toLowerCase(), v); }
  else if (tpl && !(tpl.k === 'str' && /^tree$/i.test(tpl.v))) throw new LabError("The learners here are decision trees: 'Learners', 'tree' or templateTree(…).");
  const p = d.X[0].length, method = METHODS[optStr(o, 'method', dflt)];
  if (!method || (K && method === 'lsboost') || (!K && method.startsWith('ada'))) throw new LabError(K ? "Method is 'Bag', 'AdaBoostM1' (two classes) or 'AdaBoostM2' (any number)." : "Method is 'LSBoost' or 'Bag'.");
  const cycles = Math.max(1, Math.round(optNum(o, tb ? 'numtrees' : 'numlearningcycles', 100)));
  if (cycles > 2000) throw new LabError('At most 2,000 trees here.');
  const nv = o.get('numvariablestosample') ?? o.get('numpredictorstosample'), vars = nv ? (nv.k === 'str' ? p : Math.round(toMat(nv).d[0])) : tb ? (K ? Math.max(1, Math.round(Math.sqrt(p))) : Math.max(1, Math.ceil(p / 3))) : p;
  const maxSplits = o.has('maxnumsplits') ? Math.round(optNum(o, 'maxnumsplits', 10)) : method === 'bag' ? d.X.length - 1 : 10;
  const minLeaf = Math.round(optNum(o, 'minleafsize', method === 'bag' && !K ? 5 : 1)), learnRate = optNum(o, 'learnrate', 1);
  let e: ml.Ensemble;
  try { e = ml.fitEnsemble(d.X, y, random, { method, cycles, K, maxSplits, minLeaf, vars, learnRate }); } catch (err) { throw new LabError((err as Error).message); }
  const imp = new Array(p).fill(0);
  for (const t of e.trees) ml.importance(t, p).forEach((v, j) => { imp[j] += v / Math.max(1, t.pred.filter((q) => q >= 0).length) / e.trees.length; });
  let oobLoss = NaN;
  if (e.oobCurve) oobLoss = e.oobCurve[e.oobCurve.length - 1];
  return [
    ...(tb ? [['NumTrees', num(cycles)] as [string, Value], ['Method', str(K ? 'classification' : 'regression')] as [string, Value]] : [['Method', str(METHOD_NAMES[method])] as [string, Value], ['NumLearningCycles', num(cycles)] as [string, Value], ['LearnRate', num(learnRate)] as [string, Value], ['MaxNumSplits', num(maxSplits)] as [string, Value]]),
    ['MinLeafSize', num(minLeaf)], ['NumVariablesToSample', num(vars)], ['NumTrained', num(e.trees.length)],
    ['Trained', cellCol(e.trees.map((t) => treeCell(t, K)))], ['LearnerWeights', mat(1, e.alpha.length, e.alpha)], ['Init', num(e.init)],
    ['PredictorImportance', mat(1, p, imp)],
    ...(e.oobCurve ? [['OOBLoss', num(oobLoss)] as [string, Value], ['OOBErrorCurve', col(e.oobCurve)] as [string, Value]] : []),
  ];
}
FIT.ClassificationEnsemble = (d, o) => { const L = labelsOf(d.y!); return model('ClassificationEnsemble', d, fitEnsembleFields(d, L.y, L.K, o, L.K === 2 ? 'adaboostm1' : 'adaboostm2'), L); };
FIT.RegressionEnsemble = (d, o) => model('RegressionEnsemble', d, fitEnsembleFields(d, [...toMat(d.y!, 'The response').d], 0, o, 'lsboost'), null);
FIT.TreeBagger = (d, o) => {
  const cls = optStr(o, 'method', 'classification') !== 'regression';
  o.set('method', str('bag'));
  if (cls) { const L = labelsOf(d.y!); return model('TreeBagger', d, fitEnsembleFields(d, L.y, L.K, o, 'bag', true), L); }
  return model('TreeBagger', d, fitEnsembleFields(d, [...toMat(d.y!, 'The response').d], 0, o, 'bag', true), null);
};
/** The ensemble as ml.ts reads it, from its fields. */
function ensembleOf(m: Struct) {
  const K = m.f.has('ClassNames') ? labelsOf(field(m, 'Y')).K : 0;
  const trees = (field(m, 'Trained') as Cell).d.map((v) => {
    const t = treeOf(v as Struct), s = v as Struct;
    if (K) { const P = rowsOf(toMat(field(s, 'ClassProbability'))); return { ...t, probs: P, value: P.map((r) => r.indexOf(Math.max(...r))) }; }
    return { ...t, probs: [], value: [...toMat(field(s, 'NodeMean')).d] };
  });
  const kind = typeOf(m), method: ml.EnsembleMethod = kind === 'TreeBagger' ? 'bag' : METHODS[textOf(field(m, 'Method')).toLowerCase()];
  return { trees, alpha: [...toMat(field(m, 'LearnerWeights')).d], method, K, init: fnum(m, 'Init') };
}
def('TreeBagger', (a) => {
  if (a.length < 3) throw new LabError("TreeBagger needs the number of trees, the data and the answers: TreeBagger(100, X, Y, 'Method', 'classification').");
  const d = dataOf(a.slice(1), 'TreeBagger'), o = options(a, d.rest + 1);
  o.set('numtrees', a[0]);
  return [FIT.TreeBagger!(d, o)];
});
def('oobError', (a) => { const m = a[0]; if (!isModel(m) || !m.f.has('OOBErrorCurve')) throw new LabError('oobError needs a TreeBagger (or a bagged ensemble).'); return [field(m, 'OOBErrorCurve')]; });
def('oobLoss', (a) => { const m = a[0]; if (!isModel(m) || !m.f.has('OOBLoss')) throw new LabError("oobLoss needs a bagged ensemble: fitcensemble(X, Y, 'Method', 'Bag')."); return [field(m, 'OOBLoss')]; });
def('predictorImportance', (a) => { const m = a[0]; if (!isModel(m) || !m.f.has('PredictorImportance')) throw new LabError('predictorImportance needs a tree or an ensemble of trees.'); return [field(m, 'PredictorImportance')]; });

function coefTable(names: string[], est: number[], se: number[], stat: number[], p: number[]): Struct {
  return table([['Name', cellCol(names.map(str))], ['Estimate', col(est)], ['SE', col(se)], ['tStat', col(stat)], ['pValue', col(p)]]);
}
FIT.LinearModel = (d, o) => {
  const y = [...toMat(d.y!, 'The response').d], intercept = optBool(o, 'intercept', true);
  let f: ml.LinFit;
  try { f = ml.linearFit(d.X, y, intercept); } catch (e) { throw new LabError((e as Error).message); }
  const names = [...(intercept ? ['(Intercept)'] : []), ...d.predictors];
  return model('LinearModel', d, [
    ['Formula', str(`${d.response} ~ ${intercept ? '1 + ' : ''}${d.predictors.join(' + ')}`)], ['Coefficients', coefTable(names, f.b, f.se, f.t, f.p)], ['Beta', col(f.b)], ['Intercept', mat(1, 1, [intercept ? 1 : 0], true)],
    ['Rsquared', { k: 'struct', f: new Map([['Ordinary', num(f.r2)], ['Adjusted', num(f.adjR2)]]) }], ['RMSE', num(f.rmse)], ['DFE', num(f.dfe)], ['SSE', num(f.sse)], ['Fitted', col(f.fitted)], ['Residuals', col(y.map((v, i) => v - f.fitted[i]))],
  ], null);
};
FIT.GeneralizedLinearModel = (d, o) => {
  const dist = optStr(o, 'distribution', 'normal');
  if (dist === 'normal') { const m = FIT.LinearModel!(d, o); m.f.set('Type', str('GeneralizedLinearModel')); m.f.set('Distribution', str('normal')); return m; }
  if (dist !== 'binomial') throw new LabError("fitglm's Distribution here is 'normal' or 'binomial' (logistic regression).");
  const L = labelsOf(d.y!, 'The response');
  if (L.K !== 2) throw new LabError(`Logistic regression needs two outcomes (0 and 1, or two labels); this response has ${L.K}.`);
  const f = ml.logisticFit(d.X, L.y);
  const names = ['(Intercept)', ...d.predictors];
  const m = model('GeneralizedLinearModel', d, [
    ['Distribution', str('binomial')], ['Formula', str(`logit(P(${d.response} = ${L.names[1]})) ~ 1 + ${d.predictors.join(' + ')}`)], ['Coefficients', coefTable(names, f.b, f.se, f.z, f.p)], ['Beta', col(f.b)],
    ['Deviance', num(f.deviance)], ['Converged', mat(1, 1, [f.converged ? 1 : 0], true)],
  ], L);
  return m;
};

for (const [name, kind] of [['fitcknn', 'ClassificationKNN'], ['fitctree', 'ClassificationTree'], ['fitcnb', 'ClassificationNaiveBayes'], ['fitcdiscr', 'ClassificationDiscriminant'], ['fitcsvm', 'ClassificationSVM'], ['fitcecoc', 'ClassificationECOC'], ['fitcnet', 'ClassificationNeuralNetwork'], ['fitcensemble', 'ClassificationEnsemble'], ['fitrtree', 'RegressionTree'], ['fitrnet', 'RegressionNeuralNetwork'], ['fitrensemble', 'RegressionEnsemble'], ['fitlm', 'LinearModel'], ['fitglm', 'GeneralizedLinearModel']] as const) {
  def(name, (a, _n, lab) => {
    const d = dataOf(a, name), o = options(a, d.rest), m = FIT[kind]!(d, o);
    if (o.has('kfold') || o.has('holdout') || o.has('leaveout') || o.has('cvpartition') || (o.has('crossval') && optBool(o, 'crossval', false))) return [crossval(m, o)];
    if (kind === 'GeneralizedLinearModel' && optStr(o, 'distribution', 'normal') === 'binomial' && !(field(m, 'Converged') as Mat).d[0]) lab.host.out('Warning: the logistic fit didn’t settle: the classes may be perfectly separated, so the coefficients grow without end.\n');
    return [m];
  });
}
def('templateSVM', (a) => { const o = options(a, 0), f = new Map<string, Value>([['Type', str('templateSVM')]]); for (const [k, v] of o) f.set(({ kernelfunction: 'KernelFunction', kernelscale: 'KernelScale', boxconstraint: 'BoxConstraint', polynomialorder: 'PolynomialOrder', standardize: 'Standardize' } as Record<string, string>)[k] ?? k, v); return [{ k: 'struct', f } satisfies Struct]; });

// ——— Predicting ———
function svmScores(m: Struct, X: ml.Rows): number[] {
  const Z = scaled(m, X), sv = rowsOf(toMat(field(m, 'SupportVectors'))), svm: ml.Svm = {
    alpha: [...toMat(field(m, 'Alpha')).d], sv, svY: [...toMat(field(m, 'SupportVectorLabels')).d], bias: fnum(m, 'Bias'),
    kernel: KERNELS[textOf(field(m, 'KernelFunction'))], scale: fnum(m, 'KernelScale'), order: fnum(m, 'PolynomialOrder'), iterations: 0, converged: true,
  };
  return Z.map((x) => ml.svmScore(svm, x));
}
/** Class numbers and scores (a row per new row, a column per class) from a classifier. */
function classify(m: Struct, X: ml.Rows): { idx: number[]; scores: ml.Rows } {
  const kind = typeOf(m), L = labelsOf(field(m, 'Y'));
  const argmax = (s: number[]) => s.reduce((b, v, i) => (v > s[b] ? i : b), 0);
  if (kind === 'ClassificationKNN') {
    const train = scaled(m, rowsOf(toMat(field(m, 'X')))), k = fnum(m, 'NumNeighbors'), out = scaled(m, X).map((x) => ml.knn(train, L.y, L.K, k, x));
    return { idx: out.map((r) => r.cls), scores: out.map((r) => r.scores) };
  }
  if (kind === 'ClassificationTree') {
    const t = treeOf(m), probs = rowsOf(toMat(field(m, 'ClassProbability'))), leaves = X.map((x) => ml.treeLeaf(t, x));
    return { idx: leaves.map((l) => argmax(probs[l])), scores: leaves.map((l) => probs[l]) };
  }
  if (kind === 'ClassificationNaiveBayes' || kind === 'ClassificationDiscriminant') {
    const mu = rowsOf(toMat(field(m, 'Mu'))), S = rowsOf(toMat(field(m, 'Sigma'))), prior = [...toMat(field(m, 'Prior')).d];
    const post = kind === 'ClassificationNaiveBayes' ? X.map((x) => ml.nbPosterior({ mu, sd: S, prior }, x)) : (() => { const lda: ml.LDA = { mu, sigma: S, inv: ml.inverse(S) ?? S, prior }; return X.map((x) => ml.ldaPosterior(lda, x)); })();
    return { idx: post.map(argmax), scores: post };
  }
  if (kind === 'ClassificationEnsemble' || kind === 'TreeBagger') { const e = ensembleOf(m), post = X.map((x) => ml.ensembleOut(e, x)); return { idx: post.map(argmax), scores: post }; }
  if (kind === 'ClassificationNeuralNetwork') { const f = netPredictor(netOf(m)), post = scaled(m, X).map((x) => [...f(x)]); return { idx: post.map(argmax), scores: post }; }
  if (kind === 'ClassificationSVM') { const f = svmScores(m, X); return { idx: f.map((v) => (v > 0 ? 1 : 0)), scores: f.map((v) => [-v, v]) }; }
  if (kind === 'ClassificationECOC') {
    const M = toMat(field(m, 'CodingMatrix')), learners = (field(m, 'BinaryLearners') as Cell).d as Struct[], f = learners.map((l) => svmScores(l, X));
    // Hinge-loss decoding: each class's average loss over the learners that know it; the smallest wins.
    const scores = X.map((_, i) => Array.from({ length: L.K }, (_, k) => { let s = 0, w = 0; learners.forEach((_, l) => { const c = M.d[k + l * L.K]; if (c) { s += Math.max(0, 1 - c * f[l][i]) / 2; w++; } }); return -s / Math.max(1, w); }));
    return { idx: scores.map(argmax), scores };
  }
  if (kind === 'GeneralizedLinearModel' && m.f.has('ClassNames')) { const b = [...toMat(field(m, 'Beta')).d], p = X.map((x) => ml.logisticProb(b, x)); return { idx: p.map((v) => (v >= 0.5 ? 1 : 0)), scores: p.map((v) => [1 - v, v]) }; }
  throw new LabError('That model predicts numbers, not classes.');
}
function treeOf(m: Struct): Pick<ml.Tree, 'pred' | 'cut' | 'left' | 'right'> {
  const pred = [...toMat(field(m, 'CutPredictorIndex')).d].map((p) => p - 1), ch = toMat(field(m, 'Children')), n = pred.length;
  return { pred, cut: [...toMat(field(m, 'CutPoint')).d], left: pred.map((_, i) => ch.d[i] - 1), right: pred.map((_, i) => ch.d[i + n] - 1) };
}
function regress(m: Struct, X: ml.Rows): number[] {
  const kind = typeOf(m);
  if (kind === 'RegressionEnsemble' || kind === 'TreeBagger') { const e = ensembleOf(m); return X.map((x) => ml.ensembleOut(e, x)[0]); }
  if (kind === 'RegressionNeuralNetwork') { const f = netPredictor(netOf(m)); return scaled(m, X).map((x) => f(x)[0]); }
  if (kind === 'RegressionTree') { const t = treeOf(m), mean = toMat(field(m, 'NodeMean')).d; return X.map((x) => mean[ml.treeLeaf(t, x)]); }
  if (kind === 'GeneralizedLinearModel' && m.f.has('ClassNames')) { const b = [...toMat(field(m, 'Beta')).d]; return X.map((x) => ml.logisticProb(b, x)); }
  if (kind === 'LinearModel' || kind === 'GeneralizedLinearModel') {
    const b = [...toMat(field(m, 'Beta')).d], icpt = toMat(field(m, 'Intercept')).d[0];
    return X.map((x) => (icpt ? b[0] : 0) + x.reduce((s, v, j) => s + v * b[j + (icpt ? 1 : 0)], 0));
  }
  throw new LabError('That model predicts classes: predict gives its labels.');
}
/** Predicts numbers (a logistic model's are probabilities). */
const isRegression = (m: Struct) => REGRESSION.has(typeOf(m)) || (typeOf(m) === 'TreeBagger' && !m.f.has('ClassNames'));
def('predict', (a, nout) => {
  const m = a[0];
  if (!isModel(m)) throw new LabError('predict needs a model and new rows: predict(model, X).');
  if (!a[1]) throw new LabError('predict needs the rows to predict: predict(model, X).');
  const X = rowsFor(m, a[1]);
  if (isRegression(m)) return [col(regress(m, X))];
  const { idx, scores } = classify(m, X), L = labelsOf(field(m, 'Y'));
  return nout > 1 ? [L.back(idx), matOf(scores, L.K)] : [L.back(idx)];
});
/** Error rate (classes) or mean squared error (numbers) of a model on rows and their answers. */
function lossOn(m: Struct, X: ml.Rows, y: Value): number {
  if (isRegression(m) && !m.f.has('ClassNames')) { const p = regress(m, X), t = toMat(y).d; return p.reduce((s, v, i) => s + (v - t[i]) ** 2, 0) / p.length; }
  const { idx } = classify(m, X), L = labelsOf(field(m, 'Y')), truth = sameLabels(L, y);
  return idx.reduce((s, c, i) => s + (c !== truth[i] ? 1 : 0), 0) / idx.length;
}
/** Answers given as the model's class numbers (an answer it never saw counts as wrong: -1). */
function sameLabels(L: Labels, y: Value): number[] {
  if (y.k === 'cell') { const at = new Map(L.names.map((n, i) => [n, i])); return y.d.map((v) => at.get(textOf(v)) ?? -1); }
  const keys = [...toMat(L.classes).d], at = new Map(keys.map((k, i) => [k, i]));
  return [...toMat(y).d].map((v) => at.get(v) ?? -1);
}
def('loss', (a) => {
  const m = a[0];
  if (!isModel(m) || !a[1]) throw new LabError('loss needs a model, rows and their answers: loss(model, X, Y).');
  if (isTable(a[1])) { const resp = textOf(field(m, 'ResponseName')); return [num(lossOn(m, rowsFor(m, a[1]), a[1].f.get(resp) ?? (() => { throw new LabError(`The table needs the column “${resp}”.`); })()))]; }
  if (!a[2]) throw new LabError('loss needs the true answers too: loss(model, X, Y).');
  return [num(lossOn(m, rowsFor(m, a[1]), a[2]))];
});
def('resubLoss', (a) => { const m = a[0]; if (!isModel(m)) throw new LabError('resubLoss needs a model.'); return [num(lossOn(m, rowsOf(toMat(field(m, 'X'))), field(m, 'Y')))]; });
def('resubPredict', (a, nout, lab) => { const m = a[0]; if (!isModel(m)) throw new LabError('resubPredict needs a model.'); return BUILTINS.predict([m, field(m, 'X')], nout, lab); });

// ——— Cross-validation ———
function partition(n: number, y: number[] | null, kind: 'kfold' | 'holdout' | 'leaveout' | 'resubstitution', k: number): Struct {
  let fold: number[], tests: number;
  if (kind === 'leaveout') { fold = Array.from({ length: n }, (_, i) => i + 1); tests = n; }
  else if (kind === 'resubstitution') { fold = new Array(n).fill(0); tests = 1; }
  else if (kind === 'kfold') {
    if (!(k >= 2 && k <= n)) throw new LabError(`KFold must be between 2 and ${n}.`);
    fold = ml.folds(y ?? new Array(n).fill(0), Math.round(k), random).map((f) => f + 1); tests = Math.round(k);
  } else {
    // Holdout: p is a share (below 1) or a number of rows; per class when labels were given.
    const groups = new Map<number, number[]>();
    (y ?? new Array(n).fill(0)).forEach((c, i) => { if (!groups.has(c)) groups.set(c, []); groups.get(c)!.push(i); });
    fold = new Array(n).fill(0);
    for (const rows of groups.values()) {
      for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
      const take = k < 1 ? Math.round(k * rows.length) : Math.round((k * rows.length) / n);
      rows.slice(0, take).forEach((r) => { fold[r] = 1; });
    }
    tests = 1;
  }
  const sizes = Array.from({ length: tests }, (_, t) => (kind === 'resubstitution' ? n : fold.filter((f) => f === t + 1).length));
  return { k: 'struct', f: new Map<string, Value>([['Type', str(kind === 'kfold' ? 'kfold' : kind)], ['NumObservations', num(n)], ['NumTestSets', num(tests)], ['TrainSize', mat(1, tests, sizes.map((s) => (kind === 'resubstitution' ? n : n - s)))], ['TestSize', mat(1, tests, sizes)], ['Fold', mat(n, 1, fold)]]) };
}
const isPartition = (v: Value | undefined): v is Struct => !!v && v.k === 'struct' && v.f.has('Fold') && v.f.has('NumTestSets');
def('cvpartition', (a) => {
  if (!a[0]) throw new LabError("cvpartition needs the number of rows or the labels: cvpartition(150, 'KFold', 10).");
  const grouped = a[0].k === 'cell' || (a[0].k === 'mat' && a[0].d.length > 1), n = grouped ? labelCount(a[0]) : Math.round(toMat(a[0]).d[0]);
  const y = grouped ? labelsOf(a[0]).y : null, how = a[1] ? textOf(a[1]).toLowerCase() : 'kfold';
  if (!['kfold', 'holdout', 'leaveout', 'resubstitution'].includes(how)) throw new LabError("cvpartition splits by 'KFold', 'HoldOut', 'Leaveout' or 'Resubstitution'.");
  const k = a[2] ? toMat(a[2]).d[0] : how === 'kfold' ? 10 : 0.1;
  return [partition(n, y, how as 'kfold', k)];
});
for (const [name, testSide] of [['training', false], ['test', true]] as const) {
  def(name, (a) => {
    const c = a[0];
    if (!isPartition(c)) throw new LabError(`${name} needs a partition from cvpartition: ${name}(c, i).`);
    const i = a[1] ? Math.round(toMat(a[1]).d[0]) : 1, fold = toMat(field(c, 'Fold')).d, kind = textOf(field(c, 'Type'));
    const inTest = (f: number) => (kind === 'holdout' ? f === 1 : kind === 'resubstitution' ? true : f === i);
    return [mat(fold.length, 1, [...fold].map((f) => (kind === 'resubstitution' ? 1 : (testSide ? inTest(f) : !inTest(f)) ? 1 : 0)), true)];
  });
}
/** Learns again on each training part and predicts the part held out; every row gets an answer from a model that
 * never saw it. */
function crossval(m: Struct, o: Opts): Struct {
  const kind = typeOf(m), X = rowsOf(toMat(field(m, 'X'))), Y = field(m, 'Y'), n = X.length, regression = isRegression(m) && !m.f.has('ClassNames');
  const y = regression ? null : labelsOf(Y).y;
  let c: Struct;
  const given = o.get('cvpartition');
  if (isPartition(given)) c = given;
  else if (o.has('holdout')) c = partition(n, y, 'holdout', optNum(o, 'holdout', 0.1));
  else if (o.has('leaveout') && optBool(o, 'leaveout', false)) c = partition(n, y, 'leaveout', n);
  else c = partition(n, y, 'kfold', optNum(o, 'kfold', 10));
  const fold = toMat(field(c, 'Fold')).d, tests = fnum(c, 'NumTestSets'), holdout = textOf(field(c, 'Type')) === 'holdout';
  const settings = settingsOf(m), preds = (field(m, 'PredictorNames') as Cell).d.map((v) => textOf(v)), response = textOf(field(m, 'ResponseName'));
  const predNum = new Array(n).fill(NaN), predIdx = new Array(n).fill(-1), tested = new Array(n).fill(false);
  for (let t = 1; t <= tests; t++) {
    const isTest = (f: number) => (holdout ? f === 1 : f === t);
    const tr = [...fold.keys()].filter((i) => !isTest(fold[i])), te = [...fold.keys()].filter((i) => isTest(fold[i]));
    if (!te.length) continue;
    const sub = FIT[kind]!({ X: tr.map((i) => X[i]), y: subset(Y, tr), predictors: preds, response, rest: 0 }, new Map(settings));
    const rows = te.map((i) => X[i]);
    if (regression) regress(sub, rows).forEach((v, q) => { predNum[te[q]] = v; });
    else { const L = labelsOf(Y), subL = labelsOf(field(sub, 'Y')), map = subL.names.map((nm) => L.names.indexOf(nm)); classify(sub, rows).idx.forEach((v, q) => { predIdx[te[q]] = map[v]; }); }
    te.forEach((i) => { tested[i] = true; });
  }
  const L = regression ? null : labelsOf(Y);
  const prediction: Value = regression ? col(predNum) : L!.back(predIdx.map((v) => Math.max(0, v)));
  return { k: 'struct', f: new Map<string, Value>([['Type', str(regression ? 'RegressionPartitionedModel' : 'ClassificationPartitionedModel')], ['ModelType', str(kind)], ['KFold', num(tests)], ['Partition', c], ['Y', Y], ['Prediction', prediction], ['Tested', mat(n, 1, tested.map(Number), true)], ...(L ? [['ClassNames', L.classes] as [string, Value]] : [])]) };
}
const isPartitioned = (v: Value | undefined): v is Struct => !!v && v.k === 'struct' && v.f.has('Prediction') && v.f.has('Partition');
def('crossval', (a) => {
  const m = a[0];
  if (!isModel(m)) throw new LabError("crossval needs a model: crossval(model) or crossval(model, 'KFold', 5).");
  return [crossval(m, options(a, 1))];
});
def('kfoldLoss', (a) => {
  const c = a[0];
  if (!isPartitioned(c)) throw new LabError('kfoldLoss needs a cross-validated model: kfoldLoss(crossval(model)).');
  const tested = toMat(field(c, 'Tested')).d, rows = [...tested.keys()].filter((i) => tested[i]);
  if (textOf(field(c, 'Type')) === 'RegressionPartitionedModel') { const p = toMat(field(c, 'Prediction')).d, y = toMat(field(c, 'Y')).d; return [num(rows.reduce((s, i) => s + (p[i] - y[i]) ** 2, 0) / rows.length)]; }
  const L = labelsOf(field(c, 'Y')), p = sameLabels(L, field(c, 'Prediction'));
  return [num(rows.reduce((s, i) => s + (p[i] !== L.y[i] ? 1 : 0), 0) / rows.length)];
});
def('kfoldPredict', (a) => { if (!isPartitioned(a[0])) throw new LabError('kfoldPredict needs a cross-validated model.'); return [field(a[0], 'Prediction')]; });

// ——— Confusion matrices ———
function bothLabels(g: Value, h: Value) {
  if (labelCount(g) !== labelCount(h)) throw new LabError('The true and predicted labels must be the same length.');
  const all: Value = g.k === 'cell' && h.k === 'cell' ? cellCol([...g.d, ...h.d]) : g.k === 'mat' && h.k === 'mat' ? mat(g.d.length + h.d.length, 1, [...g.d, ...h.d], g.logical) : (() => { throw new LabError('Give both label lists the same kind: both numbers or both text.'); })();
  const L = labelsOf(all), n = labelCount(g);
  return { L, truth: L.y.slice(0, n), pred: L.y.slice(n) };
}
def('confusionmat', (a) => {
  if (a.length < 2) throw new LabError('confusionmat needs the true labels and the predicted ones.');
  const { L, truth, pred } = bothLabels(a[0], a[1]);
  return [matOf(ml.confusion(truth, pred, L.K), L.K), L.classes];
});
def('confusionchart', (a, _n, lab) => {
  if (a.length < 1) throw new LabError('confusionchart needs the true and predicted labels, or a matrix of counts.');
  let C: number[][], names: string[];
  if (a[0].k === 'mat' && a[0].r === a[0].c && a[0].r > 1 && (!a[1] || a[1].k === 'cell')) {
    C = rowsOf(a[0]); names = a[1]?.k === 'cell' ? a[1].d.map((v) => textOf(v)) : C.map((_, i) => String(i + 1));
  } else {
    if (!a[1]) throw new LabError('confusionchart needs the predicted labels too: confusionchart(Ytrue, Ypred).');
    const { L, truth, pred } = bothLabels(a[0], a[1]);
    C = ml.confusion(truth, pred, L.K); names = L.names;
  }
  const K = C.length, top = Math.max(1, ...C.flat()), total = C.flat().reduce((s, v) => s + v, 0), right = C.reduce((s, r, i) => s + r[i], 0);
  call(lab, 'imagesc', matOf(C, K));
  // White to the accent's blue.
  call(lab, 'colormap', matOf(Array.from({ length: 64 }, (_, i) => { const t = i / 63; return [1 - t * (1 - 0.15), 1 - t * (1 - 0.39), 1 - t * (1 - 0.92)]; }), 3));
  C.forEach((r, i) => r.forEach((v, j) => call(lab, 'text', num(j + 1), num(i + 1), str(String(v)), str('HorizontalAlignment'), str('center'), str('Color'), str(v > top * 0.55 ? 'white' : 'black'))));
  call(lab, 'xticks', mat(1, K, names.map((_, i) => i + 1))); call(lab, 'xticklabels', cellRow(names));
  call(lab, 'yticks', mat(1, K, names.map((_, i) => i + 1))); call(lab, 'yticklabels', cellRow(names));
  call(lab, 'xlabel', str('Predicted class')); call(lab, 'ylabel', str('True class'));
  call(lab, 'title', str(`Confusion matrix: ${total ? +((100 * right) / total).toFixed(1) : 0}% right`));
  return [];
});

// ——— Plots by group ———
def('gscatter', (a, _n, lab) => {
  if (a.length < 3) throw new LabError('gscatter needs x, y and the groups: gscatter(x, y, g).');
  const x = toMat(a[0]).d, y = toMat(a[1]).d, L = labelsOf(a[2], 'The groups');
  if (x.length !== y.length || x.length !== L.y.length) throw new LabError('gscatter needs x, y and the groups of the same length.');
  const was = gfx(lab).axes().hold, sym = a[4] ? textOf(a[4]) : 'o';
  for (let k = 0; k < L.K; k++) {
    const rows = L.y.flatMap((c, i) => (c === k ? [i] : []));
    call(lab, 'plot', mat(1, rows.length, rows.map((i) => x[i])), mat(1, rows.length, rows.map((i) => y[i])), str(sym[k % sym.length] ?? 'o'));
    if (k === 0) call(lab, 'hold', str('on'));
  }
  if (!was) call(lab, 'hold', str('off'));
  call(lab, 'legend', ...L.names.map(str));
  return [];
});

// ——— Clustering and components ———
def('kmeans', (a, nout) => {
  if (a.length < 2) throw new LabError('kmeans needs the rows and how many clusters: kmeans(X, k).');
  const X = rowsOf(toMat(a[0], 'The data')), k = Math.round(toMat(a[1]).d[0]), o = options(a, 2);
  let r: ReturnType<typeof ml.kmeans>;
  try { r = ml.kmeans(X, k, random, { replicates: Math.round(optNum(o, 'replicates', 1)), maxIter: Math.round(optNum(o, 'maxiter', 100)) }); } catch (e) { throw new LabError((e as Error).message); }
  const D = X.map((x) => r.C.map((c) => x.reduce((s, v, j) => s + (v - c[j]) ** 2, 0)));
  return [col(r.idx.map((v) => v + 1)), matOf(r.C, X[0].length), col(r.sumd), matOf(D, k)].slice(0, Math.max(1, nout));
});
def('dbscan', (a) => {
  if (a.length < 3) throw new LabError('dbscan needs the rows, a distance and the fewest neighbours: dbscan(X, epsilon, minpts).');
  const r = ml.dbscan(rowsOf(toMat(a[0])), toMat(a[1]).d[0], Math.round(toMat(a[2]).d[0]));
  return [col(r.idx), mat(r.core.length, 1, r.core.map(Number), true)];
});
def('pca', (a) => {
  const X = rowsOf(toMat(a[0], 'The data'));
  if (X.length < 2) throw new LabError('pca needs at least two rows.');
  const r = ml.pca(X), p = r.mu.length, t2 = r.score.map((s) => s.reduce((acc, v, j) => acc + (r.latent[j] > 1e-12 ? (v * v) / r.latent[j] : 0), 0));
  return [matOf(r.coeff, p), matOf(r.score, p), col(r.latent), col(t2), col(r.explained), mat(1, p, r.mu)];
});
def('perfcurve', (a) => {
  if (a.length < 3) throw new LabError('perfcurve needs the labels, the scores and the positive class: perfcurve(labels, scores, posclass).');
  const L = labelsOf(a[0]), s = [...toMat(a[1], 'The scores').d], pos = a[2].k === 'str' ? L.names.indexOf(a[2].v) : L.names.indexOf(String(toMat(a[2]).d[0]));
  if (pos < 0) throw new LabError('The positive class isn’t one of the labels.');
  if (s.length !== L.y.length) throw new LabError('perfcurve needs a score for every label.');
  const r = ml.roc(L.y.map((c) => c === pos), s);
  return [col(r.fpr), col(r.tpr), col(r.thr), num(r.auc)];
});

// ——— Sample data ———
const fileLoad = BUILTINS.load;
const SAMPLES: Record<string, () => [string, Value][]> = {
  fisheriris: () => [['meas', matOf(irisRows(), 4)], ['species', cellCol(Array.from({ length: 150 }, (_, i) => str(IRIS_SPECIES[Math.floor(i / 50)])))]],
};
def('load', (a, nout, lab, frame) => {
  const first = a.find((v) => v.k === 'str' && !v.v.startsWith('-')), sample = first ? SAMPLES[textOf(first)] : undefined;
  if (!sample) return fileLoad(a, nout, lab, frame);
  // A file of the same name wins; the built-in data otherwise.
  try { return fileLoad(a, nout, lab, frame); } catch { /* no such file: the sample */ }
  const got = sample();
  if (nout > 0) return [{ k: 'struct', f: new Map(got) }];
  const vars = (frame as { vars?: Map<string, Value> } | undefined)?.vars ?? lab.vars;
  for (const [n, v] of got) vars.set(n, v);
  return [];
});
