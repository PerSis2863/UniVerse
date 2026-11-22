import * as ml from './ml';
import { netPredictor, trainNet } from './ml-net';
import { IRIS_SPECIES, irisRows } from './iris';

// Hyperion Learn (M421): the learner window's engine. Data sets (Fisher's iris flowers, made-up shapes, a CSV),
// learners that each turn rows into a scorer (one score per class), cross-validation, the decision-region grid for two
// predictors, and the matching Hyperion script. The window runs all of it in a worker.

export interface DataSet { name: string; X: ml.Rows; y: number[]; classes: string[]; predictors: string[]; source: 'iris' | 'made' | 'csv'; made?: { kind: MadeKind; n: number; noise: number; seed: number } }
export type MadeKind = 'moons' | 'circles' | 'blobs' | 'spirals' | 'xor';
export const MADE: { id: MadeKind; name: string }[] = [{ id: 'moons', name: 'Two moons' }, { id: 'circles', name: 'Circles' }, { id: 'blobs', name: 'Three blobs' }, { id: 'spirals', name: 'Spirals' }, { id: 'xor', name: 'Four corners (XOR)' }];

export const seeded = (s: number): ml.Rand => () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32);
const gauss = (r: ml.Rand) => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };

export const irisData = (): DataSet => ({ name: 'Iris flowers', X: irisRows(), y: Array.from({ length: 150 }, (_, i) => Math.floor(i / 50)), classes: IRIS_SPECIES, predictors: ['Sepal length', 'Sepal width', 'Petal length', 'Petal width'], source: 'iris' });

/** Made-up shapes in two predictors, n rows, with Gaussian noise. */
export function madeData(kind: MadeKind, n = 200, noise = 0.15, seed = 1): DataSet {
  const r = seeded(seed), X: ml.Rows = [], y: number[] = [], jitter = () => noise * gauss(r);
  for (let i = 0; i < n; i++) {
    if (kind === 'moons') { const c = i % 2, t = Math.PI * r(); X.push(c ? [1 - Math.cos(t) + jitter(), 0.5 - Math.sin(t) + jitter()] : [Math.cos(t) + jitter(), Math.sin(t) + jitter()]); y.push(c); }
    else if (kind === 'circles') { const c = i % 2, t = 2 * Math.PI * r(), rad = c ? 0.5 : 1; X.push([rad * Math.cos(t) + jitter(), rad * Math.sin(t) + jitter()]); y.push(c); }
    else if (kind === 'blobs') { const c = i % 3, centre = [[-1.5, -1], [1.5, -1], [0, 1.5]][c]; X.push([centre[0] + (0.4 + noise * 2) * gauss(r), centre[1] + (0.4 + noise * 2) * gauss(r)]); y.push(c); }
    else if (kind === 'spirals') { const c = i % 2, t = 0.5 + 3.2 * Math.PI * (Math.floor(i / 2) / (n / 2)), s = c ? -1 : 1; X.push([s * t * Math.cos(t) / 6 + jitter(), s * t * Math.sin(t) / 6 + jitter()]); y.push(c); }
    else { const a = r() * 2 - 1, b = r() * 2 - 1; X.push([a + jitter() / 2, b + jitter() / 2]); y.push(a * b > 0 ? 0 : 1); }
  }
  const classes = kind === 'blobs' ? ['A', 'B', 'C'] : kind === 'xor' ? ['same sign', 'opposite'] : ['A', 'B'];
  return { name: MADE.find((m) => m.id === kind)!.name, X, y, classes, predictors: ['x1', 'x2'], source: 'made', made: { kind, n, noise, seed } };
}

/** A CSV with a header row: numeric columns become predictors, the answer column (by default the last) the classes. */
export function csvColumns(text: string) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim()), sep = (lines[0]?.match(/;/g)?.length ?? 0) > (lines[0]?.match(/,/g)?.length ?? 0) ? ';' : lines[0]?.includes('\t') ? '\t' : ',';
  const split = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
  if (lines.length < 3) throw new Error('The file needs a header row and at least two rows of data.');
  const head = split(lines[0]), rows = lines.slice(1, 5001).map(split);
  const numeric = head.map((_, j) => rows.every((r) => r[j] === undefined || r[j] === '' || Number.isFinite(Number(r[j]))));
  return { head, rows, numeric };
}
export function csvData(text: string, answer: number, use: number[], name = 'Your file'): DataSet {
  const { head, rows } = csvColumns(text);
  const keep = rows.filter((r) => r[answer] !== undefined && r[answer] !== '' && use.every((j) => r[j] !== '' && Number.isFinite(Number(r[j]))));
  const labels = keep.map((r) => r[answer]), classes = [...new Set(labels)].sort((a, b) => (Number.isFinite(Number(a)) && Number.isFinite(Number(b)) ? Number(a) - Number(b) : a < b ? -1 : a > b ? 1 : 0));
  if (classes.length < 2) throw new Error('The answer column needs at least two different values.');
  if (classes.length > 20) throw new Error(`The answer column has ${classes.length} different values: a classifier needs a few classes (at most 20).`);
  if (!use.length) throw new Error('Choose at least one predictor.');
  return { name, X: keep.map((r) => use.map((j) => Number(r[j]))), y: labels.map((l) => classes.indexOf(l)), classes, predictors: use.map((j) => head[j] || `x${j + 1}`), source: 'csv' };
}

// ——— Learners ———
export type LearnerId = 'knn' | 'tree' | 'nb' | 'lda' | 'svm' | 'net' | 'forest' | 'boost' | 'logistic';
type Scorer = (x: number[]) => number[];
const standardised = (X: ml.Rows) => { const s = ml.colStats(X); return { Z: ml.standardise(X, s.mu, s.sd), at: (x: number[]) => x.map((v, j) => (v - s.mu[j]) / s.sd[j]) }; };
/** One-vs-one SVMs (radial kernel on standardised rows); a class's score is its share of the pairwise votes. */
function svmScorer(X: ml.Rows, y: number[], K: number): Scorer {
  const { Z, at } = standardised(X), scale = ml.autoScale(Z), models: { a: number; b: number; m: ml.Svm }[] = [];
  for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) {
    const rows = y.flatMap((c, i) => (c === a || c === b ? [i] : []));
    models.push({ a, b, m: ml.fitSVM(rows.map((i) => Z[i]), rows.map((i) => (y[i] === b ? 1 : -1)), { kernel: 'rbf', scale, C: 1 }) });
  }
  return (x) => { const z = at(x), v = new Array(K).fill(0); for (const { a, b, m } of models) v[ml.svmScore(m, z) > 0 ? b : a] += 1 + 1e-3 * Math.tanh(Math.abs(ml.svmScore(m, z))); const s = v.reduce((p, q) => p + q, 0); return v.map((q) => q / s); };
}
export const LEARNERS: Record<LearnerId, { name: string; detail: string; fit: (X: ml.Rows, y: number[], K: number, rand: ml.Rand) => Scorer; code: (K: number) => string; twoOnly?: boolean }> = {
  knn: { name: 'Nearest neighbours', detail: '5 neighbours, standardised', fit: (X, y, K) => { const { Z, at } = standardised(X); return (x) => ml.knn(Z, y, K, 5, at(x)).scores; }, code: () => "fitcknn(X, Y, 'NumNeighbors', 5, 'Standardize', true)" },
  tree: { name: 'Decision tree', detail: 'Gini splits', fit: (X, y, K) => { const t = ml.growTree(X, y, { K }); return (x) => t.probs[ml.treeLeaf(t, x)]; }, code: () => 'fitctree(X, Y)' },
  nb: { name: 'Naive Bayes', detail: 'bell curves per class', fit: (X, y, K) => { const m = ml.fitNB(X, y, K); return (x) => ml.nbPosterior(m, x); }, code: () => 'fitcnb(X, Y)' },
  lda: { name: 'Discriminant', detail: 'linear, shared spread', fit: (X, y, K) => { const m = ml.fitLDA(X, y, K); return (x) => ml.ldaPosterior(m, x); }, code: () => 'fitcdiscr(X, Y)' },
  svm: { name: 'Support vector machine', detail: 'radial kernel', fit: svmScorer, code: (K) => (K === 2 ? "fitcsvm(X, Y, 'KernelFunction', 'rbf', 'KernelScale', 'auto', 'Standardize', true)" : "fitcecoc(X, Y, 'Learners', templateSVM('KernelFunction', 'rbf', 'KernelScale', 'auto', 'Standardize', true))") },
  net: { name: 'Neural network', detail: '1 hidden layer of 10, standardised', fit: (X, y, K, rand) => { const { Z, at } = standardised(X), f = netPredictor(trainNet(Z, y, rand, { layers: [10], K, iterLimit: 300 })); return (x) => [...f(at(x))]; }, code: () => "fitcnet(X, Y, 'LayerSizes', 10, 'Standardize', true, 'IterationLimit', 300)" },
  forest: { name: 'Random forest', detail: '60 trees', fit: (X, y, K, rand) => { const e = ml.fitEnsemble(X, y, rand, { method: 'bag', cycles: 60, K, vars: Math.max(1, Math.round(Math.sqrt(X[0].length))) }); return (x) => ml.ensembleOut(e, x); }, code: () => 'TreeBagger(60, X, Y)' },
  boost: { name: 'Boosted trees', detail: '50 rounds of AdaBoost', fit: (X, y, K, rand) => { const e = ml.fitEnsemble(X, y, rand, { method: K === 2 ? 'adaboostm1' : 'adaboostm2', cycles: 50, K, maxSplits: 10 }); return (x) => ml.ensembleOut(e, x); }, code: () => "fitcensemble(X, Y, 'NumLearningCycles', 50)" },
  logistic: { name: 'Logistic regression', detail: 'two classes', twoOnly: true, fit: (X, y) => { const f = ml.logisticFit(X, y); return (x) => { const p = ml.logisticProb(f.b, x); return [1 - p, p]; }; }, code: () => "fitglm(X, double(strcmp(Y, Y{end})), 'Distribution', 'binomial')" },
};
export const LEARNER_IDS = Object.keys(LEARNERS) as LearnerId[];
const argmax = (s: number[]) => s.reduce((b, v, i) => (v > s[b] ? i : b), 0);

/** Each row's class from a model learnt without it (k folds, stratified); the share right. */
export function crossValidate(id: LearnerId, d: Pick<DataSet, 'X' | 'y' | 'classes'>, k: number, seed = 1) {
  const K = d.classes.length, rand = seeded(seed), fold = ml.folds(d.y, k, rand), pred = new Array(d.X.length).fill(0);
  for (let f = 0; f < k; f++) {
    const tr = d.y.flatMap((_, i) => (fold[i] !== f ? [i] : [])), te = d.y.flatMap((_, i) => (fold[i] === f ? [i] : []));
    if (!te.length) continue;
    const score = LEARNERS[id].fit(tr.map((i) => d.X[i]), tr.map((i) => d.y[i]), K, rand);
    for (const i of te) pred[i] = argmax(score(d.X[i]));
  }
  const right = pred.filter((p, i) => p === d.y[i]).length;
  return { pred, accuracy: right / d.y.length, confusion: ml.confusion(d.y, pred, K) };
}

/** The class a model learnt on two predictors gives every cell of a w × h grid over their range (row by row from the
 * top), and the ranges drawn. */
export function regionGrid(id: LearnerId, d: Pick<DataSet, 'X' | 'y' | 'classes'>, xi: number, yi: number, w = 200, h = 150, seed = 1) {
  const X2 = d.X.map((r) => [r[xi], r[yi]]), pad = (lo: number, hi: number) => { const p = (hi - lo) * 0.08 || 1; return [lo - p, hi + p] as [number, number]; };
  const xr = pad(Math.min(...X2.map((r) => r[0])), Math.max(...X2.map((r) => r[0]))), yr = pad(Math.min(...X2.map((r) => r[1])), Math.max(...X2.map((r) => r[1])));
  const score = LEARNERS[id].fit(X2, d.y, d.classes.length, seeded(seed)), cls = new Uint8Array(w * h), sure = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const s = score([xr[0] + ((c + 0.5) / w) * (xr[1] - xr[0]), yr[1] - ((r + 0.5) / h) * (yr[1] - yr[0])]), k = argmax(s);
    cls[r * w + c] = k; sure[r * w + c] = Math.round(255 * Math.max(0, Math.min(1, s[k])));
  }
  return { cls, sure, w, h, xr, yr };
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** The Hyperion script that does the same: the data, the model, 5-fold cross-validation, the confusion chart. */
export function scriptFor(id: LearnerId, d: DataSet, k: number): string {
  const K = d.classes.length, lines = [`% ${LEARNERS[id].name} on ${d.name}, made in Hyperion Learn`];
  if (d.source === 'iris') lines.push('load fisheriris', 'X = meas; Y = species;');
  else if (d.source === 'made' && d.made) {
    lines.push(`% ${d.name}: ${d.made.n} rows, noise ${d.made.noise}`, 'rng(1)');
    const { kind, n, noise } = d.made;
    if (kind === 'moons') lines.push(`t = pi*rand(${n}, 1); c = mod((1:${n})', 2);`, `X = [cos(t) sin(t)]; X(c == 1, :) = [1 - cos(t(c == 1)), 0.5 - sin(t(c == 1))];`, `X = X + ${noise}*randn(${n}, 2);`, "labels = {'A', 'B', 'C'}; Y = labels(c + 1); Y = Y(:);");
    else if (kind === 'circles') lines.push(`t = 2*pi*rand(${n}, 1); c = mod((1:${n})', 2); r = 1 - 0.5*c;`, `X = [r.*cos(t) r.*sin(t)] + ${noise}*randn(${n}, 2);`, "labels = {'A', 'B', 'C'}; Y = labels(c + 1); Y = Y(:);");
    else if (kind === 'blobs') lines.push(`c = mod((0:${n - 1})', 3); centres = [-1.5 -1; 1.5 -1; 0 1.5];`, `X = centres(c + 1, :) + ${0.4 + noise * 2}*randn(${n}, 2);`, "labels = {'A', 'B', 'C'}; Y = labels(c + 1); Y = Y(:);");
    else if (kind === 'spirals') lines.push(`i = (0:${n - 1})'; c = mod(i, 2); t = 0.5 + 3.2*pi*floor(i/2)/(${n}/2); s = 1 - 2*c;`, `X = [s.*t.*cos(t)/6 s.*t.*sin(t)/6] + ${noise}*randn(${n}, 2);`, "labels = {'A', 'B', 'C'}; Y = labels(c + 1); Y = Y(:);");
    else lines.push(`X = 2*rand(${n}, 2) - 1; c = double(prod(X, 2) < 0);`, `X = X + ${noise / 2}*randn(${n}, 2);`, "labels = {'A', 'B', 'C'}; Y = labels(c + 1); Y = Y(:);");
  } else lines.push(`% Upload your file in Code's Files first, then:`, `T = readtable(${q(d.name)});`, `X = [${d.predictors.map((p) => `T.(${q(p)})`).join(' ')}];`, `Y = T{:, end};  % the answer column`);
  if (id === 'logistic') lines.push(`mdl = ${LEARNERS[id].code(K)};`, `p = predict(mdl, X);`, `fprintf('Right on the training rows: %.1f%%\\n', 100*mean((p > 0.5) == strcmp(Y, Y{end})))`);
  else lines.push(`mdl = ${LEARNERS[id].code(K)};`, `cv = crossval(mdl, 'KFold', ${k});`, `fprintf('Cross-validated accuracy: %.1f%%\\n', 100*(1 - kfoldLoss(cv)))`, 'confusionchart(Y, kfoldPredict(cv))');
  return `${lines.join('\n')}\n`;
}
