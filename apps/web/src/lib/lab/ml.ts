// Hyperion's machine learning (M416, the owner's MATLAB list: "AI, Data Science, and Statistics"): the methods on plain
// arrays, kept apart from the language so the learner window can use them too. Rows are observations, columns
// predictors; classes are 0-based indices. Our own code from the textbook methods: k-nearest neighbours, CART decision
// trees (Gini / squared error), Gaussian naive Bayes, linear discriminant analysis, support vector machines (SMO with
// the maximal violating pair), least squares and logistic regression (IRLS) with their standard errors, k-means++,
// DBSCAN, principal components (Jacobi), stratified folds, confusion matrices and ROC curves.

export type Rows = number[][];
export type Rand = () => number;

const sq = (a: number[], b: number[]) => { let s = 0; for (let j = 0; j < a.length; j++) s += (a[j] - b[j]) ** 2; return s; };
const dot = (a: number[], b: number[]) => { let s = 0; for (let j = 0; j < a.length; j++) s += a[j] * b[j]; return s; };

/** Each column's mean and (sample) standard deviation; a constant column gets 1, so standardising leaves it at 0. */
export function colStats(X: Rows) {
  const n = X.length, p = X[0]?.length ?? 0, mu = new Array(p).fill(0), sd = new Array(p).fill(0);
  for (const r of X) for (let j = 0; j < p; j++) mu[j] += r[j] / n;
  for (const r of X) for (let j = 0; j < p; j++) sd[j] += (r[j] - mu[j]) ** 2;
  return { mu, sd: sd.map((s) => Math.sqrt(s / Math.max(1, n - 1)) || 1) };
}
export const standardise = (X: Rows, mu: number[], sd: number[]) => X.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));

// ——— k-nearest neighbours ———
/** The class of x by a vote of its k nearest rows (a tie goes to the lowest class), with each class's share. */
export function knn(X: Rows, y: number[], K: number, k: number, x: number[]) {
  const d = X.map((r, i) => [sq(r, x), i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const votes = new Array(K).fill(0), m = Math.min(k, d.length);
  for (let q = 0; q < m; q++) votes[y[d[q][1]]]++;
  let best = 0;
  for (let c = 1; c < K; c++) if (votes[c] > votes[best]) best = c;
  return { cls: best, scores: votes.map((v) => v / m) };
}

// ——— Decision trees (CART) ———
export interface Tree { pred: number[]; cut: number[]; left: number[]; right: number[]; value: number[]; probs: number[][]; size: number[] }
export interface TreeOpts { K?: number; maxSplits?: number; minLeaf?: number; minParent?: number }

/** Grows a tree level by level: each node takes the split (between two neighbouring values) that lowers its Gini
 * impurity (classes) or squared error (numbers) most, until the splits allowed are used up. */
export function growTree(X: Rows, y: number[], o: TreeOpts = {}): Tree {
  const K = o.K, p = X[0]?.length ?? 0, maxSplits = o.maxSplits ?? X.length - 1, minLeaf = Math.max(1, o.minLeaf ?? 1), minParent = Math.max(2 * minLeaf, o.minParent ?? 10);
  const t: Tree = { pred: [], cut: [], left: [], right: [], value: [], probs: [], size: [] };
  const summary = (idx: number[]) => {
    if (K) {
      const c = new Array(K).fill(0);
      for (const i of idx) c[y[i]]++;
      let best = 0;
      for (let k = 1; k < K; k++) if (c[k] > c[best]) best = k;
      return { value: best, probs: c.map((v) => v / idx.length), impurity: idx.length * (1 - c.reduce((s, v) => s + (v / idx.length) ** 2, 0)) };
    }
    const m = idx.reduce((s, i) => s + y[i], 0) / idx.length;
    return { value: m, probs: [], impurity: idx.reduce((s, i) => s + (y[i] - m) ** 2, 0) };
  };
  const node = (idx: number[]) => {
    const s = summary(idx), id = t.pred.length;
    t.pred.push(-1); t.cut.push(NaN); t.left.push(-1); t.right.push(-1); t.value.push(s.value); t.probs.push(s.probs); t.size.push(idx.length);
    return { id, idx, impurity: s.impurity };
  };
  const queue = [node(Array.from({ length: X.length }, (_, i) => i))];
  let splits = 0;
  while (queue.length && splits < maxSplits) {
    const { id, idx, impurity } = queue.shift()!;
    if (idx.length < minParent || impurity <= 1e-12) continue;
    let best = { gain: 1e-12, j: -1, cut: 0 };
    for (let j = 0; j < p; j++) {
      const order = [...idx].sort((a, b) => X[a][j] - X[b][j]), n = order.length;
      // Running sums on the left; the right is the rest.
      const cl = K ? new Array(K).fill(0) : [], ct = K ? new Array(K).fill(0) : [];
      let sl = 0, ql = 0, st = 0, qt = 0;
      for (const i of order) { if (K) ct[y[i]]++; else { st += y[i]; qt += y[i] ** 2; } }
      for (let q = 0; q < n - 1; q++) {
        const i = order[q];
        if (K) cl[y[i]]++; else { sl += y[i]; ql += y[i] ** 2; }
        const nl = q + 1, nr = n - nl;
        if (nl < minLeaf || nr < minLeaf || X[order[q + 1]][j] === X[i][j]) continue;
        let child: number;
        if (K) {
          let gl = 0, gr = 0;
          for (let k = 0; k < K; k++) { gl += cl[k] ** 2; gr += (ct[k] - cl[k]) ** 2; }
          child = nl - gl / nl + nr - gr / nr;
        } else child = ql - sl ** 2 / nl + (qt - ql) - (st - sl) ** 2 / nr;
        const gain = impurity - child;
        if (gain > best.gain) best = { gain, j, cut: (X[i][j] + X[order[q + 1]][j]) / 2 };
      }
    }
    if (best.j < 0) continue;
    const L = idx.filter((i) => X[i][best.j] < best.cut), R = idx.filter((i) => X[i][best.j] >= best.cut);
    const a = node(L), b = node(R);
    t.pred[id] = best.j; t.cut[id] = best.cut; t.left[id] = a.id; t.right[id] = b.id;
    queue.push(a, b);
    splits++;
  }
  return t;
}
/** The leaf a row lands in. */
export function treeLeaf(t: Tree, x: number[]) {
  let n = 0;
  while (t.pred[n] >= 0) n = x[t.pred[n]] < t.cut[n] ? t.left[n] : t.right[n];
  return n;
}

// ——— Gaussian naive Bayes ———
export interface NB { mu: number[][]; sd: number[][]; prior: number[] }
export function fitNB(X: Rows, y: number[], K: number): NB {
  const mu: number[][] = [], sd: number[][] = [], prior: number[] = [];
  for (let k = 0; k < K; k++) {
    const rows = X.filter((_, i) => y[i] === k);
    if (rows.length < 2) throw new Error(`Each class needs at least two rows for naive Bayes (class ${k + 1} has ${rows.length}).`);
    const s = colStats(rows), scale = Math.max(1e-12, ...X.map((r) => Math.max(...r.map(Math.abs))));
    mu.push(s.mu);
    // A feature that never varies within a class would make its density infinite: give it a hair of spread.
    sd.push(s.sd.map((v, j) => (rows.every((r) => r[j] === rows[0][j]) ? 1e-6 * scale : v)));
    prior.push(rows.length / X.length);
  }
  return { mu, sd, prior };
}
const softmax = (z: number[]) => { const m = Math.max(...z), e = z.map((v) => Math.exp(v - m)), s = e.reduce((a, b) => a + b, 0); return e.map((v) => v / s); };
export const nbPosterior = (m: NB, x: number[]) => softmax(m.prior.map((pk, k) => Math.log(pk) + x.reduce((s, v, j) => s - Math.log(m.sd[k][j]) - 0.5 * ((v - m.mu[k][j]) / m.sd[k][j]) ** 2, 0)));

// ——— Small dense linear algebra ———
/** The inverse of a small square matrix (Gauss–Jordan with partial pivoting); null when it is singular. */
export function inverse(A: number[][]): number[][] | null {
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  const big = Math.max(1e-300, ...A.flat().map(Math.abs));
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) <= 1e-13 * big) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c && M[r][c] !== 0) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r) => r.slice(n));
}
const matVec = (A: number[][], x: number[]) => A.map((r) => dot(r, x));

// ——— Linear discriminant analysis ———
export interface LDA { mu: number[][]; sigma: number[][]; inv: number[][]; prior: number[] }
export function fitLDA(X: Rows, y: number[], K: number): LDA {
  const p = X[0].length, n = X.length, mu: number[][] = [], prior: number[] = [], S = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let k = 0; k < K; k++) {
    const rows = X.filter((_, i) => y[i] === k);
    if (!rows.length) throw new Error(`Class ${k + 1} has no rows.`);
    const m = colStats(rows).mu;
    mu.push(m); prior.push(rows.length / n);
    for (const r of rows) for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) S[a][b] += ((r[a] - m[a]) * (r[b] - m[b])) / Math.max(1, n - K);
  }
  let inv = inverse(S);
  if (!inv) { const tr = S.reduce((s, r, i) => s + r[i], 0) / p || 1; inv = inverse(S.map((r, i) => r.map((v, j) => v + (i === j ? 1e-6 * tr : 0))))!; }
  return { mu, sigma: S, inv, prior };
}
export const ldaPosterior = (m: LDA, x: number[]) => softmax(m.mu.map((mk, k) => { const w = matVec(m.inv, mk); return dot(w, x) - 0.5 * dot(w, mk) + Math.log(m.prior[k]); }));

// ——— Support vector machines ———
export type Kernel = 'linear' | 'rbf' | 'polynomial';
export interface SvmOpts { C?: number; kernel?: Kernel; scale?: number; order?: number; tol?: number; maxIter?: number }
export interface Svm { alpha: number[]; sv: Rows; svY: number[]; bias: number; kernel: Kernel; scale: number; order: number; iterations: number; converged: boolean }
export const kernelOf = (kind: Kernel, scale: number, order: number) => (a: number[], b: number[]) => {
  if (kind === 'rbf') return Math.exp(-sq(a, b) / scale ** 2);
  const v = dot(a, b) / scale ** 2;
  return kind === 'polynomial' ? (1 + v) ** order : v;
};
/** A binary SVM on labels ±1 by sequential minimal optimisation: at each step the pair that most breaks the optimality
 * conditions moves together, analytically, inside the box [0, C]. */
export function fitSVM(X: Rows, t: number[], o: SvmOpts = {}): Svm {
  const n = X.length, C = o.C ?? 1, kind = o.kernel ?? 'linear', scale = o.scale ?? 1, order = o.order ?? 3, eps = o.tol ?? 1e-3;
  if (n > 2500) throw new Error('A support vector machine here learns from at most 2,500 rows.');
  const k = kernelOf(kind, scale, order), Kx = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { const v = k(X[i], X[j]); Kx[i][j] = v; Kx[j][i] = v; }
  const a = new Float64Array(n), G = new Float64Array(n).fill(-1), maxIter = o.maxIter ?? 50_000;
  let it = 0, converged = false;
  for (; it < maxIter; it++) {
    let Gmax = -Infinity, Gmax2 = -Infinity, i = -1, j = -1;
    for (let s = 0; s < n; s++) {
      if (t[s] === 1) { if (a[s] < C && -G[s] >= Gmax) { Gmax = -G[s]; i = s; } if (a[s] > 0 && G[s] >= Gmax2) { Gmax2 = G[s]; j = s; } }
      else { if (a[s] > 0 && G[s] >= Gmax) { Gmax = G[s]; i = s; } if (a[s] < C && -G[s] >= Gmax2) { Gmax2 = -G[s]; j = s; } }
    }
    if (Gmax + Gmax2 < eps || i < 0 || j < 0) { converged = true; break; }
    const Qij = t[i] * t[j] * Kx[i][j], ai = a[i], aj = a[j];
    if (t[i] !== t[j]) {
      const quad = Math.max(1e-12, Kx[i][i] + Kx[j][j] + 2 * Qij), delta = (-G[i] - G[j]) / quad, diff = a[i] - a[j];
      a[i] += delta; a[j] += delta;
      if (diff > 0) { if (a[j] < 0) { a[j] = 0; a[i] = diff; } } else if (a[i] < 0) { a[i] = 0; a[j] = -diff; }
      if (diff > 0) { if (a[i] > C) { a[i] = C; a[j] = C - diff; } } else if (a[j] > C) { a[j] = C; a[i] = C + diff; }
    } else {
      const quad = Math.max(1e-12, Kx[i][i] + Kx[j][j] - 2 * Qij), delta = (G[i] - G[j]) / quad, sum = a[i] + a[j];
      a[i] -= delta; a[j] += delta;
      if (sum > C) { if (a[i] > C) { a[i] = C; a[j] = sum - C; } } else if (a[j] < 0) { a[j] = 0; a[i] = sum; }
      if (sum > C) { if (a[j] > C) { a[j] = C; a[i] = sum - C; } } else if (a[i] < 0) { a[i] = 0; a[j] = sum; }
    }
    const di = a[i] - ai, dj = a[j] - aj;
    for (let s = 0; s < n; s++) G[s] += t[s] * (t[i] * Kx[i][s] * di + t[j] * Kx[j][s] * dj);
  }
  // The offset from the free support vectors (or the middle of its allowed range when there are none).
  let sum = 0, free = 0, ub = Infinity, lb = -Infinity;
  for (let s = 0; s < n; s++) {
    const yG = t[s] * G[s];
    if (a[s] > 1e-12 && a[s] < C - 1e-12) { sum += yG; free++; }
    else if ((a[s] <= 1e-12 && t[s] === 1) || (a[s] >= C - 1e-12 && t[s] === -1)) ub = Math.min(ub, yG);
    else lb = Math.max(lb, yG);
  }
  const rho = free ? sum / free : (ub + lb) / 2;
  const keep = [...a.keys()].filter((s) => a[s] > 1e-10);
  return { alpha: keep.map((s) => a[s]), sv: keep.map((s) => X[s]), svY: keep.map((s) => t[s]), bias: -rho, kernel: kind, scale, order, iterations: it, converged };
}
export function svmScore(m: Svm, x: number[]) {
  const k = kernelOf(m.kernel, m.scale, m.order);
  let f = m.bias;
  for (let s = 0; s < m.alpha.length; s++) f += m.alpha[s] * m.svY[s] * k(m.sv[s], x);
  return f;
}
/** A kernel scale from the data (the median distance between rows, from up to 200 of them). */
export function autoScale(X: Rows) {
  const m = Math.min(X.length, 200), d: number[] = [];
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) d.push(Math.sqrt(sq(X[i], X[j])));
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)] || 1;
}

// ——— Regression with standard errors ———
/** ln Γ(x) (Lanczos). */
export function gammaln(x: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, s = 1.000000000190015;
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  for (const c of g) s += c / ++y;
  return -t + Math.log((2.5066282746310005 * s) / x);
}
/** The regularised incomplete beta function I_x(a, b) (its continued fraction, Lentz's method). */
export function betainc(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x > (a + 1) / (a + b + 2)) return 1 - betainc(1 - x, b, a);
  let f = 1, c = 1, d = 1 - ((a + b) * x) / (a + 1);
  d = Math.abs(d) < 1e-300 ? 1e-300 : d; d = 1 / d; f = d;
  for (let m = 1; m <= 300; m++) {
    for (const num of [(m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m)), (-(a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1))]) {
      d = 1 + num * d; d = Math.abs(d) < 1e-300 ? 1e-300 : d; d = 1 / d;
      c = 1 + num / c; c = Math.abs(c) < 1e-300 ? 1e-300 : c;
      f *= c * d;
    }
    if (Math.abs(c * d - 1) < 1e-15) break;
  }
  return (front * f) / a;
}
/** Two-sided p-value of a t statistic with ν degrees of freedom. */
export const tPValue = (t: number, nu: number) => (Number.isFinite(t) ? betainc(nu / (nu + t * t), nu / 2, 0.5) : 0);
/** The standard normal's upper tail, 2·(1 − Φ(|z|)) (two-sided). */
export function zPValue(z: number) {
  const x = Math.abs(z) / Math.SQRT2, tt = 1 / (1 + 0.5 * x);
  // erfc by its Chebyshev fit (relative error below 1.2e-7).
  const erfc = tt * Math.exp(-x * x - 1.26551223 + tt * (1.00002368 + tt * (0.37409196 + tt * (0.09678418 + tt * (-0.18628806 + tt * (0.27886807 + tt * (-1.13520398 + tt * (1.48851587 + tt * (-0.82215223 + tt * 0.17087277)))))))));
  return erfc;
}

export interface LinFit { b: number[]; se: number[]; t: number[]; p: number[]; r2: number; adjR2: number; rmse: number; dfe: number; sse: number; fitted: number[] }
/** Ordinary least squares on [1 X] (or X alone without an intercept). */
export function linearFit(X: Rows, y: number[], intercept = true): LinFit {
  const A = X.map((r) => (intercept ? [1, ...r] : [...r])), n = A.length, p = A[0].length;
  if (n <= p) throw new Error(`A linear model with ${p} coefficients needs more than ${p} rows (it has ${n}).`);
  const AtA = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => A.reduce((s, r) => s + r[a] * r[b], 0)));
  const inv = inverse(AtA);
  if (!inv) throw new Error('The predictors depend on each other exactly (one is a combination of others), so the coefficients aren’t unique.');
  const Aty = Array.from({ length: p }, (_, a) => A.reduce((s, r, i) => s + r[a] * y[i], 0)), b = matVec(inv, Aty);
  const fitted = A.map((r) => dot(r, b)), sse = y.reduce((s, v, i) => s + (v - fitted[i]) ** 2, 0), dfe = n - p, s2 = sse / dfe;
  const ybar = y.reduce((s, v) => s + v, 0) / n, sst = intercept ? y.reduce((s, v) => s + (v - ybar) ** 2, 0) : y.reduce((s, v) => s + v * v, 0);
  const se = inv.map((r, i) => Math.sqrt(Math.max(0, s2 * r[i]))), t = b.map((v, i) => v / se[i]);
  const r2 = 1 - sse / sst;
  return { b, se, t, p: t.map((v) => tPValue(v, dfe)), r2, adjR2: 1 - ((1 - r2) * (n - (intercept ? 1 : 0))) / dfe, rmse: Math.sqrt(s2), dfe, sse, fitted };
}
export interface LogitFit { b: number[]; se: number[]; z: number[]; p: number[]; deviance: number; converged: boolean }
const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));
/** Logistic regression on [1 X] by iteratively reweighted least squares; y in {0, 1}. */
export function logisticFit(X: Rows, y: number[]): LogitFit {
  const A = X.map((r) => [1, ...r]), p = A[0].length;
  let b = new Array(p).fill(0), converged = false, inv: number[][] | null = null;
  for (let it = 0; it < 100; it++) {
    const mu = A.map((r) => Math.min(1 - 1e-12, Math.max(1e-12, sigmoid(dot(r, b))))), w = mu.map((m) => m * (1 - m));
    const H = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, c) => A.reduce((s, r, i) => s + w[i] * r[a] * r[c], 0)));
    const g = Array.from({ length: p }, (_, a) => A.reduce((s, r, i) => s + r[a] * (y[i] - mu[i]), 0));
    inv = inverse(H);
    if (!inv) break;
    const step = matVec(inv, g);
    b = b.map((v, i) => v + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-10 * (1 + Math.max(...b.map(Math.abs)))) { converged = true; break; }
  }
  const mu = A.map((r) => Math.min(1 - 1e-15, Math.max(1e-15, sigmoid(dot(r, b)))));
  const deviance = -2 * y.reduce((s, v, i) => s + (v ? Math.log(mu[i]) : Math.log(1 - mu[i])), 0);
  const se = inv ? inv.map((r, i) => Math.sqrt(Math.max(0, r[i]))) : b.map(() => NaN), z = b.map((v, i) => v / se[i]);
  return { b, se, z, p: z.map(zPValue), deviance, converged };
}
export const logisticProb = (b: number[], x: number[]) => sigmoid(b[0] + dot(b.slice(1), x));

// ——— Clustering ———
/** k-means++ starts, then Lloyd's steps; the best of several tries. An emptied cluster takes the farthest row. */
export function kmeans(X: Rows, k: number, rand: Rand, o: { replicates?: number; maxIter?: number } = {}) {
  const n = X.length;
  if (k < 1 || k > n) throw new Error(`kmeans needs between 1 and ${n} clusters.`);
  let best: { idx: number[]; C: Rows; sumd: number[]; total: number; iter: number } | null = null;
  for (let rep = 0; rep < Math.max(1, o.replicates ?? 1); rep++) {
    const C: Rows = [X[Math.floor(rand() * n)].slice()];
    while (C.length < k) {
      const d = X.map((r) => Math.min(...C.map((c) => sq(r, c)))), tot = d.reduce((s, v) => s + v, 0);
      let u = rand() * tot, i = 0;
      while (i < n - 1 && (u -= d[i]) > 0) i++;
      C.push(X[tot > 0 ? i : Math.floor(rand() * n)].slice());
    }
    let idx = new Array(n).fill(-1), iter = 0;
    for (; iter < (o.maxIter ?? 100); iter++) {
      const next = X.map((r) => { let b = 0, bd = Infinity; C.forEach((c, j) => { const d = sq(r, c); if (d < bd) { bd = d; b = j; } }); return b; });
      for (let j = 0; j < k; j++) if (!next.includes(j)) { let far = 0, fd = -1; X.forEach((r, i) => { const d = sq(r, C[next[i]]); if (d > fd) { fd = d; far = i; } }); next[far] = j; }
      const same = next.every((v, i) => v === idx[i]);
      idx = next;
      for (let j = 0; j < k; j++) { const rows = X.filter((_, i) => idx[i] === j); C[j] = colStats(rows).mu; }
      if (same) break;
    }
    const sumd = new Array(k).fill(0);
    X.forEach((r, i) => { sumd[idx[i]] += sq(r, C[idx[i]]); });
    const total = sumd.reduce((s, v) => s + v, 0);
    if (!best || total < best.total) best = { idx, C, sumd, total, iter: iter + 1 };
  }
  return best!;
}
/** Density-based clusters: a core row has at least minPts rows within eps (itself included); clusters grow through
 * core rows; the rest is noise (-1). */
export function dbscan(X: Rows, eps: number, minPts: number) {
  const n = X.length, e2 = eps * eps, near = X.map((r) => X.flatMap((s, j) => (sq(r, s) <= e2 ? [j] : [])));
  const core = near.map((l) => l.length >= minPts), idx = new Array(n).fill(0);
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (idx[i] || !core[i]) continue;
    c++;
    const stack = [i];
    idx[i] = c;
    while (stack.length) {
      const q = stack.pop()!;
      if (!core[q]) continue;
      for (const j of near[q]) if (!idx[j]) { idx[j] = c; stack.push(j); }
    }
  }
  return { idx: idx.map((v) => v || -1), core };
}

// ——— Principal components ———
/** Eigenvalues and eigenvectors (columns) of a symmetric matrix by cyclic Jacobi rotations, largest first. */
export function symEigen(S: number[][]) {
  const n = S.length, A = S.map((r) => [...r]), V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => A[b][b] - A[a][a]);
  return { values: order.map((i) => A[i][i]), vectors: V.map((r) => order.map((i) => r[i])) };
}
export function pca(X: Rows) {
  const { mu } = colStats(X), n = X.length, p = mu.length, Xc = X.map((r) => r.map((v, j) => v - mu[j]));
  const S = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => Xc.reduce((s, r) => s + r[a] * r[b], 0) / Math.max(1, n - 1)));
  const { values, vectors } = symEigen(S);
  // Each component's largest coefficient made positive, so the signs don't wander between runs.
  for (let c = 0; c < p; c++) {
    let big = 0;
    for (let r = 0; r < p; r++) if (Math.abs(vectors[r][c]) > Math.abs(vectors[big][c])) big = r;
    if (vectors[big][c] < 0) for (let r = 0; r < p; r++) vectors[r][c] = -vectors[r][c];
  }
  const latent = values.map((v) => Math.max(0, v)), total = latent.reduce((s, v) => s + v, 0) || 1;
  return { coeff: vectors, score: Xc.map((r) => vectors[0].map((_, c) => r.reduce((s, v, j) => s + v * vectors[j][c], 0))), latent, explained: latent.map((v) => (100 * v) / total), mu };
}

// ——— Testing models ———
/** Fold numbers 0…k-1, the rows of each class dealt out in a shuffled order so every fold has its share. */
export function folds(y: number[], k: number, rand: Rand) {
  const out = new Array(y.length).fill(0), groups = new Map<number, number[]>();
  y.forEach((c, i) => { if (!groups.has(c)) groups.set(c, []); groups.get(c)!.push(i); });
  let next = 0;
  for (const rows of groups.values()) {
    for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
    for (const r of rows) out[r] = next++ % k;
  }
  return out;
}
/** Counts of each true class (rows) against each predicted class (columns). */
export function confusion(truth: number[], pred: number[], K: number) {
  const C = Array.from({ length: K }, () => new Array(K).fill(0));
  truth.forEach((t, i) => { C[t][pred[i]]++; });
  return C;
}
/** The ROC curve of scores for the positive rows: false positive rate, true positive rate, the thresholds, the area. */
export function roc(positive: boolean[], score: number[]) {
  const order = score.map((s, i) => i).sort((a, b) => score[b] - score[a]), P = positive.filter(Boolean).length, N = positive.length - P;
  const fpr = [0], tpr = [0], thr = [Infinity];
  let tp = 0, fp = 0;
  for (let q = 0; q < order.length; q++) {
    if (positive[order[q]]) tp++; else fp++;
    if (q === order.length - 1 || score[order[q + 1]] !== score[order[q]]) { fpr.push(N ? fp / N : 0); tpr.push(P ? tp / P : 0); thr.push(score[order[q]]); }
  }
  let auc = 0;
  for (let i = 1; i < fpr.length; i++) auc += ((fpr[i] - fpr[i - 1]) * (tpr[i] + tpr[i - 1])) / 2;
  return { fpr, tpr, thr, auc };
}
