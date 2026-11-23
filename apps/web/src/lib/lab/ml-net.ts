import type { Rand, Rows } from './ml';

// Hyperion's neural networks (M417, the owner's list: "Deep Learning"): fully connected networks with any number of
// hidden layers (relu, tanh, sigmoid or none), a softmax output for classes or a straight one for numbers, trained on
// the whole data set by L-BFGS (a quasi-Newton method: it builds a picture of the loss's curvature from its last
// steps) with a backtracking line search. Weights start Glorot-uniform from the seeded random numbers, biases at 0.
// Loss: mean cross-entropy (classes) or half the mean squared error (numbers), plus Lambda/2 times the squared weights.

export type Act = 'relu' | 'tanh' | 'sigmoid' | 'none';
export interface NetOpts { layers?: number[]; act?: Act; lambda?: number; iterLimit?: number; K?: number; gradTol?: number; lossTol?: number; stepTol?: number }
export interface Net { sizes: number[]; W: Float64Array[]; b: Float64Array[]; act: Act; K: number; history: number[]; iterations: number; reason: string }

const ACT: Record<Act, [(z: number) => number, (a: number, z: number) => number]> = {
  relu: [(z) => (z > 0 ? z : 0), (_a, z) => (z > 0 ? 1 : 0)],
  tanh: [Math.tanh, (a) => 1 - a * a],
  sigmoid: [(z) => 1 / (1 + Math.exp(-z)), (a) => a * (1 - a)],
  none: [(z) => z, () => 1],
};

/** Where each layer's weights and biases sit in the one long parameter vector. */
function layout(sizes: number[]) {
  const at: { w: number; b: number }[] = [];
  let n = 0;
  for (let l = 0; l < sizes.length - 1; l++) { at.push({ w: n, b: n + sizes[l] * sizes[l + 1] }); n += (sizes[l] + 1) * sizes[l + 1]; }
  return { at, n };
}

/** The outputs for one row: softmax probabilities (classes) or the value (numbers). Also each layer's activations. */
function forward(sizes: number[], th: Float64Array, at: { w: number; b: number }[], act: Act, x: ArrayLike<number>) {
  const f = ACT[act][0], L = sizes.length - 1, a: Float64Array[] = [Float64Array.from(x)];
  for (let l = 0; l < L; l++) {
    const nin = sizes[l], nout = sizes[l + 1], prev = a[l], z = new Float64Array(nout), { w, b } = at[l];
    for (let o = 0; o < nout; o++) { let s = th[b + o]; const row = w + o * nin; for (let i = 0; i < nin; i++) s += th[row + i] * prev[i]; z[o] = l < L - 1 ? f(s) : s; }
    a.push(z);
  }
  return a;
}
const softmaxInPlace = (z: Float64Array) => { let m = -Infinity; for (const v of z) m = Math.max(m, v); let s = 0; for (let i = 0; i < z.length; i++) { z[i] = Math.exp(z[i] - m); s += z[i]; } for (let i = 0; i < z.length; i++) z[i] /= s; return z; };

/** The loss and its gradient for parameters th (backpropagation through every row). */
export function lossGrad(sizes: number[], act: Act, K: number, lambda: number, X: Rows, y: number[], th: Float64Array): [number, Float64Array] {
  const { at, n: P } = layout(sizes), g = new Float64Array(P), L = sizes.length - 1, d = ACT[act][1], N = X.length;
  let loss = 0;
  for (let r = 0; r < N; r++) {
    const a = forward(sizes, th, at, act, X[r]), out = a[L];
    let delta: Float64Array;
    if (K) { softmaxInPlace(out); loss -= Math.log(Math.max(1e-300, out[y[r]])); delta = Float64Array.from(out); delta[y[r]] -= 1; }
    else { const e = out[0] - y[r]; loss += 0.5 * e * e; delta = Float64Array.of(e); }
    for (let l = L - 1; l >= 0; l--) {
      const nin = sizes[l], nout = sizes[l + 1], prev = a[l], { w, b } = at[l];
      for (let o = 0; o < nout; o++) { const dv = delta[o]; if (!dv) continue; g[b + o] += dv; const row = w + o * nin; for (let i = 0; i < nin; i++) g[row + i] += dv * prev[i]; }
      if (l === 0) break;
      const back = new Float64Array(nin);
      for (let o = 0; o < nout; o++) { const dv = delta[o]; if (!dv) continue; const row = w + o * nin; for (let i = 0; i < nin; i++) back[i] += th[row + i] * dv; }
      // Through the hidden layer's activation (prev holds its outputs; its inputs are only needed for relu's sign,
      // which the output's sign gives).
      for (let i = 0; i < nin; i++) back[i] *= d(prev[i], prev[i]);
      delta = back;
    }
  }
  loss /= N;
  for (let i = 0; i < P; i++) g[i] /= N;
  if (lambda) for (const { w, b } of at) for (let i = w; i < b; i++) { loss += 0.5 * lambda * th[i] ** 2; g[i] += lambda * th[i]; }
  return [loss, g];
}

/** Trains a network on rows X with classes y (0…K-1) or numbers y (K = 0). */
export function trainNet(X: Rows, y: number[], rand: Rand, o: NetOpts = {}): Net {
  const K = o.K ?? 0, act = o.act ?? 'relu', lambda = o.lambda ?? 0, hidden = (o.layers ?? [10]).filter((v) => v > 0);
  const sizes = [X[0].length, ...hidden, K || 1], { at, n: P } = layout(sizes);
  let th = new Float64Array(P);
  for (let l = 0; l < at.length; l++) { const lim = Math.sqrt(6 / (sizes[l] + sizes[l + 1])); for (let i = at[l].w; i < at[l].b; i++) th[i] = (2 * rand() - 1) * lim; }
  const fg = (t: Float64Array) => lossGrad(sizes, act, K, lambda, X, y, t);
  let [f, g] = fg(th);
  const history = [f], S: Float64Array[] = [], Y: Float64Array[] = [], m = 15, limit = o.iterLimit ?? 1000;
  const dot = (a: Float64Array, b: Float64Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  let it = 0, reason = 'Iteration limit reached';
  for (; it < limit; it++) {
    let gmax = 0;
    for (const v of g) gmax = Math.max(gmax, Math.abs(v));
    if (gmax < (o.gradTol ?? 1e-6)) { reason = 'Gradient tolerance reached'; break; }
    // The two-loop recursion: d = −H g from the last m steps.
    const q = Float64Array.from(g), alpha: number[] = [];
    for (let k = S.length - 1; k >= 0; k--) { const a = dot(S[k], q) / dot(Y[k], S[k]); alpha[k] = a; for (let i = 0; i < P; i++) q[i] -= a * Y[k][i]; }
    const gamma = S.length ? dot(S[S.length - 1], Y[Y.length - 1]) / dot(Y[Y.length - 1], Y[Y.length - 1]) : 1 / Math.max(1, Math.sqrt(dot(g, g)));
    for (let i = 0; i < P; i++) q[i] *= gamma;
    for (let k = 0; k < S.length; k++) { const bta = dot(Y[k], q) / dot(Y[k], S[k]); for (let i = 0; i < P; i++) q[i] += S[k][i] * (alpha[k] - bta); }
    let dir = q.map((v) => -v), slope = dot(g, dir);
    if (!(slope < 0)) { S.length = 0; Y.length = 0; dir = g.map((v) => -v / Math.max(1, Math.sqrt(dot(g, g)))); slope = dot(g, dir); }
    // Backtracking until the loss drops enough (Armijo).
    let t = 1, next = th, fn = f, gn = g, ok = false;
    for (let tries = 0; tries < 40; tries++) {
      next = th.map((v, i) => v + t * dir[i]);
      [fn, gn] = fg(next);
      if (Number.isFinite(fn) && fn <= f + 1e-4 * t * slope) { ok = true; break; }
      t *= 0.5;
    }
    if (!ok) { reason = 'No further progress'; break; }
    const s = next.map((v, i) => v - th[i]), yy = gn.map((v, i) => v - g[i]), sy = dot(s, yy);
    if (sy > 1e-10) { S.push(s); Y.push(yy); if (S.length > m) { S.shift(); Y.shift(); } }
    const drop = f - fn, step = Math.sqrt(dot(s, s));
    th = next; f = fn; g = gn;
    history.push(f);
    if (drop < (o.lossTol ?? 1e-6) * Math.max(1, Math.abs(f)) && drop >= 0 && it > 0) { reason = 'Loss tolerance reached'; it++; break; }
    if (step < (o.stepTol ?? 1e-6)) { reason = 'Step tolerance reached'; it++; break; }
  }
  const W: Float64Array[] = [], b: Float64Array[] = [];
  at.forEach(({ w, b: bb }, l) => { W.push(th.slice(w, bb)); b.push(th.slice(bb, bb + sizes[l + 1])); });
  return { sizes, W, b, act, K, history, iterations: it, reason };
}

/** A function giving a row's class probabilities (or its value), the weights packed once. */
export function netPredictor(n: Net): (x: ArrayLike<number>) => Float64Array {
  const { at, n: P } = layout(n.sizes), th = new Float64Array(P);
  at.forEach(({ w, b }, l) => { th.set(n.W[l], w); th.set(n.b[l], b); });
  return (x) => { const out = forward(n.sizes, th, at, n.act, x)[n.sizes.length - 1]; return n.K ? softmaxInPlace(out) : out; };
}
