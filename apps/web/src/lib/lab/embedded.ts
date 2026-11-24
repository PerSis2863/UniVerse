// Hyperion's embedded AI (M481): a trained model made small enough for a microcontroller. Neural networks: weights in
// double, single or 8-bit whole numbers (one scale per layer, symmetric: w ≈ scale·q with q from −127 to 127; the
// activations stay in floating point, so the chip needs no floating-point weights in memory, only the arithmetic).
// Decision trees: their split points in double or single. Each kind written out as plain C with its weights as
// constant arrays and one predict function. Our own code.
// M525: and SVMs (their support vectors and kernel), k-nearest neighbours (the training rows), ensembles of trees
// (bagged, AdaBoost, LSBoost, TreeBagger) and linear models, in double or single; and neural networks wholly in 8-bit
// whole numbers ('int8full': the activations too, as TensorFlow Lite's integer models do): each layer's inputs are
// 8-bit with a scale found from the training rows, sums are 32-bit, a fixed-point multiplier (15 bits and a shift)
// brings them to the next layer's scale, ReLU is a clamp and tanh / sigmoid a 256-entry table. Only the input's
// standardising and quantising (and a regression's last multiply) use floating point; the integer core takes int8.

export type Prec = 'double' | 'single' | 'int8' | 'int8full';
export interface NetSpec { kind: 'net'; W: { r: number; c: number; d: ArrayLike<number> }[]; b: ArrayLike<number>[]; act: 'relu' | 'tanh' | 'sigmoid' | 'none'; classes: string[] | null; mu: number[] | null; sigma: number[] | null }
export interface TreeSpec { kind: 'tree'; pred: number[]; cut: number[]; left: number[]; right: number[]; leaf: number[]; classes: string[] | null; inputs: number }
export interface SvmSpec { kind: 'svm'; sv: number[][]; coef: number[]; bias: number; kernel: 'linear' | 'rbf' | 'polynomial'; scale: number; order: number; mu: number[] | null; sigma: number[] | null; classes: string[] }
export interface KnnSpec { kind: 'knn'; train: number[][]; label: number[]; k: number; K: number; mu: number[] | null; sigma: number[] | null; classes: string[] }
export interface EnsSpec { kind: 'ensemble'; trees: { pred: number[]; cut: number[]; left: number[]; right: number[]; value: number[]; probs: number[][] }[]; alpha: number[]; method: 'bag' | 'adaboostm1' | 'adaboostm2' | 'lsboost'; K: number; init: number; classes: string[] | null; inputs: number }
export interface LinSpec { kind: 'linear'; beta: number[]; intercept: boolean; inputs: number }
/** M529: fitcecoc's SVMs, one per pair of classes (each its own support vectors and standardising), CODE[class][learner] = −1, 0 or 1. */
export interface EcocSpec { kind: 'ecoc'; learners: { sv: number[][]; coef: number[]; bias: number; mu: number[] | null; sigma: number[] | null }[]; code: number[][]; kernel: 'linear' | 'rbf' | 'polynomial'; scale: number; order: number; inputs: number; classes: string[] }
/** M529: naive Bayes (a bell curve per class and input): its means, spreads and priors. */
export interface BayesSpec { kind: 'bayes'; mu: number[][]; sd: number[][]; prior: number[]; classes: string[] }
/** M529: a linear discriminant: a score per class w_k · x + c_k, worked out in Hyperion from the means, the shared spread's inverse and the priors. */
export interface DiscrSpec { kind: 'discr'; w: number[][]; c: number[]; classes: string[] }
export type Spec = NetSpec | TreeSpec | SvmSpec | KnnSpec | EnsSpec | LinSpec | EcocSpec | BayesSpec | DiscrSpec;

/** One layer's weights as 8-bit whole numbers and their scale. */
export function quantizeLayer(w: ArrayLike<number>): { q: Int8Array; scale: number } {
  let big = 0;
  for (let i = 0; i < w.length; i++) big = Math.max(big, Math.abs(w[i]));
  const scale = big / 127 || 1, q = new Int8Array(w.length);
  for (let i = 0; i < w.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(w[i] / scale)));
  return { q, scale };
}
/** The weights as the chip would hold them, back in numbers (what predict then uses). */
export function roundTrip(w: ArrayLike<number>, p: Prec): Float64Array {
  if (p === 'double') return Float64Array.from(w);
  if (p === 'single') return Float64Array.from(Float32Array.from(w));
  const { q, scale } = quantizeLayer(w);
  return Float64Array.from(q, (v) => v * scale);
}
/** Bytes the model's numbers take on the chip. */
export function bytes(s: Spec, p: Prec): number {
  const f = p === 'double' ? 8 : 4;
  if (s.kind === 'tree') {
    const nodes = s.pred.length, idx = nodes > 32767 ? 4 : 2;
    return nodes * (2 + (p === 'double' ? 8 : 4) + 2 * idx + (s.classes ? 1 : f));
  }
  if (s.kind === 'svm') return (s.sv.length * (s.sv[0]?.length ?? 0) + s.coef.length + 1 + (s.mu ? 2 * s.mu.length : 0)) * f;
  if (s.kind === 'knn') return s.train.length * (s.train[0]?.length ?? 0) * f + s.train.length + (s.mu ? 2 * s.mu.length * f : 0);
  if (s.kind === 'linear') return s.beta.length * f;
  if (p === 'int8' && s.kind === 'ecoc') { const sv = s.learners.reduce((a, l) => a + l.sv.length, 0); return sv * s.inputs + sv + 4 * s.learners.length * 3 + (s.learners.some((l) => l.mu) ? 8 * s.learners.length * s.inputs : 0) + 4 + s.code.length * s.learners.length; }
  if (p === 'int8' && s.kind === 'bayes') return 2 * s.mu.length * (s.mu[0]?.length ?? 0) + 8 + 4 * s.prior.length;
  if (p === 'int8' && s.kind === 'discr') return s.w.length * (s.w[0]?.length ?? 0) + 4 + 4 * s.c.length;
  if (s.kind === 'ecoc') return s.learners.reduce((a, l) => a + l.sv.length * s.inputs + l.coef.length + 1 + (l.mu ? 2 * s.inputs : 0), 0) * f + s.code.length * s.learners.length;
  if (s.kind === 'bayes') return (2 * s.mu.length * (s.mu[0]?.length ?? 0) + s.prior.length) * f;
  if (s.kind === 'discr') return (s.w.length * (s.w[0]?.length ?? 0) + s.c.length) * f;
  if (s.kind === 'ensemble') {
    const nodes = s.trees.reduce((a, t) => a + t.pred.length, 0), idx = nodes > 32767 ? 4 : 2;
    const leafBytes = s.K && s.method === 'bag' ? s.K * f : s.K ? 1 : f;
    return nodes * (2 + f + 2 * idx + leafBytes) + s.trees.length * (4 + f);
  }
  if (p === 'int8full') { const weights = s.W.reduce((a, w) => a + w.r * w.c, 0), biases = s.b.reduce((a, b) => a + b.length, 0); return weights + 4 * biases + 4 * s.W.length * 2 + (s.act === 'tanh' || s.act === 'sigmoid' ? 256 * (s.W.length - 1) : 0) + (s.mu ? 8 * s.mu.length : 0); }
  const weights = s.W.reduce((n, w) => n + w.r * w.c, 0), biases = s.b.reduce((n, b) => n + b.length, 0), norm = s.mu ? 2 * s.mu.length : 0;
  return (p === 'int8' ? weights + 4 * s.W.length : weights * f) + (biases + norm) * (p === 'double' ? 8 : 4);
}

const num = (x: number, p: Prec) => (p === 'double' ? (Number.isInteger(x) ? `${x}.0` : String(x)) : `${Math.fround(x)}f`.replace(/^(-?\d+)f$/, '$1.0f'));
const list = (xs: ArrayLike<number>, f: (x: number) => string, per = 8) => {
  const out: string[] = [];
  for (let i = 0; i < xs.length; i += per) out.push(`  ${Array.from(xs).slice(i, i + per).map(f).join(', ')}`);
  return out.join(',\n');
};
/** C for the model: `<name>.c` and `<name>.h`. Classes come back as their number (0 = the first of ClassNames). */
export function modelC(s: Spec, name: string, p: Prec): { c: string; h: string } {
  if (s.kind !== 'net' && s.kind !== 'tree') return otherC(s, name, p);
  if (p === 'int8full') throw new Error('A wholly 8-bit network is written by fullIntC (it needs rows to set its scales).');
  const T = p === 'double' ? 'double' : 'float', fn = (f: string) => (p === 'double' ? f : `${f}f`);
  const head = [`/* ${name}.c: a trained model written out by Hyperion (${s.kind === 'net' ? `a neural network, ${p === 'int8' ? '8-bit weights' : `${p} weights`}` : `a decision tree, ${p}`}). Plain C99, no memory allocated. */`, '#include <math.h>', '#include <stdint.h>', `#include "${name}.h"`, ''];
  const classes = s.classes ? `/* Classes, by the number predict gives: ${s.classes.map((c, i) => `${i} = ${c}`).join(', ')} */\n` : '';
  if (s.kind === 'tree') {
    const nodes = s.pred.length, I = nodes > 32767 ? 'int32_t' : 'int16_t';
    const body = [
      `static const ${I} pred[${nodes}] = {\n${list(s.pred, String, 16)}\n};`,
      `static const ${T} cut[${nodes}] = {\n${list(s.cut, (x) => num(Number.isFinite(x) ? x : 0, p))}\n};`,
      `static const ${I} left[${nodes}] = {\n${list(s.left, String, 16)}\n};`,
      `static const ${I} right[${nodes}] = {\n${list(s.right, String, 16)}\n};`,
      s.classes ? `static const uint8_t leaf[${nodes}] = {\n${list(s.leaf, String, 16)}\n};` : `static const ${T} leaf[${nodes}] = {\n${list(s.leaf, (x) => num(x, p))}\n};`,
      '',
      `${s.classes ? 'int' : T} ${name}_predict(const ${T} x[${s.inputs}]) {`,
      '  int n = 0;',
      '  while (pred[n] >= 0) n = x[pred[n]] < cut[n] ? left[n] : right[n];',
      '  return leaf[n];',
      '}',
    ];
    return { c: [...head, classes + body.join('\n'), ''].join('\n'), h: header(name, `${s.classes ? 'int' : T} ${name}_predict(const ${T} x[${s.inputs}]);`, classes) };
  }
  const L = s.W.length, inputs = s.W[0].c, outputs = s.W[L - 1].r, widest = Math.max(...s.W.map((w) => Math.max(w.r, w.c)));
  const arrays: string[] = [];
  s.W.forEach((w, l) => {
    // Row-major here (one output neuron's weights together): w(q, i) sits at q*in + i.
    const rowMajor = Float64Array.from({ length: w.r * w.c }, (_, k) => w.d[Math.floor(k / w.c) + (k % w.c) * w.r]);
    if (p === 'int8') { const { q, scale } = quantizeLayer(rowMajor); arrays.push(`static const int8_t W${l + 1}[${w.r * w.c}] = {\n${list(q, String, 16)}\n};`, `static const float S${l + 1} = ${num(scale, 'single')};`); }
    else arrays.push(`static const ${T} W${l + 1}[${w.r * w.c}] = {\n${list(rowMajor, (x) => num(x, p))}\n};`);
    arrays.push(`static const ${T} B${l + 1}[${w.r}] = {\n${list(s.b[l], (x) => num(x, p))}\n};`);
  });
  if (s.mu && s.sigma) arrays.push(`static const ${T} MU[${inputs}] = { ${s.mu.map((x) => num(x, p)).join(', ')} };`, `static const ${T} SIGMA[${inputs}] = { ${s.sigma.map((x) => num(x, p)).join(', ')} };`);
  const act = s.act === 'relu' ? 'z > 0 ? z : 0' : s.act === 'tanh' ? `${fn('tanh')}(z)` : s.act === 'sigmoid' ? `1 / (1 + ${fn('exp')}(-z))` : 'z';
  const lines = [`${s.classes ? 'int' : T} ${name}_predict(const ${T} x[${inputs}]${s.classes ? `, ${T} scores[${outputs}]` : ''}) {`, `  ${T} a[${widest}], z[${widest}];`];
  lines.push(`  for (int i = 0; i < ${inputs}; i++) a[i] = ${s.mu ? '(x[i] - MU[i]) / SIGMA[i]' : 'x[i]'};`);
  s.W.forEach((w, l) => {
    const last = l === L - 1;
    lines.push(`  /* layer ${l + 1}: ${w.c} → ${w.r}${last ? '' : `, ${s.act}`} */`);
    lines.push(`  for (int q = 0; q < ${w.r}; q++) {`, `    ${T} s = 0;`, `    for (int i = 0; i < ${w.c}; i++) s += ${p === 'int8' ? `(${T})W${l + 1}[q * ${w.c} + i]` : `W${l + 1}[q * ${w.c} + i]`} * a[i];`, `    z[q] = ${p === 'int8' ? `S${l + 1} * s` : 's'} + B${l + 1}[q];`, '  }');
    if (!last) lines.push(`  for (int q = 0; q < ${w.r}; q++) { ${T} zq = z[q]; a[q] = ${act.replace(/z/g, 'zq')}; }`);
  });
  if (s.classes) lines.push(
    '  /* softmax: the scores add up to 1 */',
    `  ${T} top = z[0], sum = 0;`,
    `  for (int q = 1; q < ${outputs}; q++) if (z[q] > top) top = z[q];`,
    `  for (int q = 0; q < ${outputs}; q++) { scores[q] = ${fn('exp')}(z[q] - top); sum += scores[q]; }`,
    '  int best = 0;',
    `  for (int q = 0; q < ${outputs}; q++) { scores[q] /= sum; if (scores[q] > scores[best]) best = q; }`,
    '  return best;',
  );
  else lines.push('  return z[0];');
  lines.push('}');
  const proto = `${s.classes ? 'int' : T} ${name}_predict(const ${T} x[${inputs}]${s.classes ? `, ${T} scores[${outputs}]` : ''});`;
  return { c: [...head, classes + arrays.join('\n'), '', ...lines, ''].join('\n'), h: header(name, proto, classes) };
}
const header = (name: string, proto: string, classes: string) => [`/* ${name}.h: generated by Hyperion */`, `#ifndef ${name.toUpperCase()}_H`, `#define ${name.toUpperCase()}_H`, '#include <stdint.h>', classes, proto, `#endif`, ''].join('\n');

// ——— M525: SVMs, k-NN, ensembles, linear models ———
const head = (name: string, what: string) => [`/* ${name}.c: a trained model written out by Hyperion (${what}). Plain C99, no memory allocated. */`, '#include <math.h>', '#include <stdint.h>', `#include "${name}.h"`, ''];
const classNote = (classes: string[] | null) => (classes ? `/* Classes, by the number predict gives: ${classes.map((c, i) => `${i} = ${c}`).join(', ')} */\n` : '');
const std = (T: string, mu: number[] | null, sigma: number[] | null, p: Prec, inputs: number) => (mu && sigma
  ? { arrays: [`static const ${T} MU[${inputs}] = { ${mu.map((x) => num(x, p)).join(', ')} };`, `static const ${T} SIGMA[${inputs}] = { ${sigma.map((x) => num(x, p)).join(', ')} };`], line: `  for (int i = 0; i < ${inputs}; i++) z[i] = (x[i] - MU[i]) / SIGMA[i];` }
  : { arrays: [], line: `  for (int i = 0; i < ${inputs}; i++) z[i] = x[i];` });
const KIND_NAME: Record<string, string> = { svm: 'An SVM', knn: 'A k-nearest-neighbour model', linear: 'A linear model', ensemble: 'An ensemble', ecoc: 'A many-class SVM', bayes: 'A naive Bayes model', discr: 'A discriminant model' };
/** The first largest of K scores (an earlier class wins a tie, as Hyperion's predict). */
const pickTop = (K: number, arr: string) => ['  int top = 0;', `  for (int k = 1; k < ${K}; k++) if (${arr}[k] > ${arr}[top]) top = k;`];
function otherC(s: SvmSpec | KnnSpec | EnsSpec | LinSpec | EcocSpec | BayesSpec | DiscrSpec, name: string, p: Prec): { c: string; h: string } {
  const eight = p === 'int8' && (s.kind === 'ecoc' || s.kind === 'bayes' || s.kind === 'discr');
  if ((p === 'int8' && !eight) || p === 'int8full') throw new Error(`${KIND_NAME[s.kind]} is written with ${s.kind === 'ecoc' || s.kind === 'bayes' || s.kind === 'discr' ? "'int8', 'single' or 'double'" : "'single' or 'double'"} numbers.`);
  const T = p === 'double' ? 'double' : 'float', fn = (f: string) => (p === 'double' ? f : `${f}f`), v = (x: number) => num(x, p === 'int8' ? 'single' : p);
  if (s.kind === 'ecoc') return ecocC(s, name, p, T, fn, v);
  if (s.kind === 'bayes' || s.kind === 'discr') return scoreC(s, name, p, T, fn, v);
  if (s.kind === 'linear') {
    const lines = [`${T} ${name}_predict(const ${T} x[${s.inputs}]) {`, `  ${T} s = 0;`, `  for (int j = 0; j < ${s.inputs}; j++) s += x[j] * B[j + ${s.intercept ? 1 : 0}];`, `  return ${s.intercept ? 'B[0] + s' : 's'};`, '}'];
    return { c: [...head(name, `a linear model, ${p}`), `static const ${T} B[${s.beta.length}] = { ${s.beta.map(v).join(', ')} };`, '', ...lines, ''].join('\n'), h: header(name, `${T} ${name}_predict(const ${T} x[${s.inputs}]);`, '') };
  }
  if (s.kind === 'svm') {
    const P = s.sv[0]?.length ?? 0, N = s.sv.length, st = std(T, s.mu, s.sigma, p, P);
    const ker = s.kernel === 'rbf' ? `${fn('exp')}(-d / (SCALE * SCALE))` : s.kernel === 'polynomial' ? `${fn('pow')}(1 + d / (SCALE * SCALE), ${s.order})` : 'd / (SCALE * SCALE)';
    const lines = [
      `int ${name}_predict(const ${T} x[${P}], ${T} *score) {`, `  ${T} z[${P}], f = BIAS;`, st.line,
      `  for (int q = 0; q < ${N}; q++) {`, `    ${T} d = 0;`,
      s.kernel === 'rbf' ? `    for (int j = 0; j < ${P}; j++) { ${T} e = SV[q * ${P} + j] - z[j]; d += e * e; }` : `    for (int j = 0; j < ${P}; j++) d += SV[q * ${P} + j] * z[j];`,
      `    f += COEF[q] * ${ker};`, '  }', '  if (score) *score = f;', '  return f > 0;', '}',
    ];
    return { c: [...head(name, `a support vector machine (${s.kernel} kernel), ${p}`), classNote(s.classes) + `static const ${T} SV[${N * P}] = {\n${list(s.sv.flat(), v)}\n};`, `static const ${T} COEF[${N}] = {\n${list(s.coef, v)}\n};`, `static const ${T} BIAS = ${v(s.bias)}, SCALE = ${v(s.scale)};`, ...st.arrays, '', ...lines, ''].join('\n'), h: header(name, `int ${name}_predict(const ${T} x[${P}], ${T} *score);`, classNote(s.classes)) };
  }
  if (s.kind === 'knn') {
    const P = s.train[0]?.length ?? 0, N = s.train.length, k = Math.min(s.k, N), st = std(T, s.mu, s.sigma, p, P);
    const lines = [
      `int ${name}_predict(const ${T} x[${P}]) {`, `  ${T} z[${P}], best[${k}];`, `  int who[${k}], m = 0, votes[${s.K}] = {0};`, st.line,
      `  for (int i = 0; i < ${N}; i++) {`, `    ${T} d = 0;`, `    for (int j = 0; j < ${P}; j++) { ${T} e = TRAIN[i * ${P} + j] - z[j]; d += e * e; }`,
      '    /* the k nearest so far, nearest first (an earlier row wins a tie) */',
      `    if (m == ${k} && !(d < best[m - 1])) continue;`, `    int at = m < ${k} ? m++ : m - 1;`,
      '    while (at > 0 && d < best[at - 1]) { best[at] = best[at - 1]; who[at] = who[at - 1]; at--; }', '    best[at] = d; who[at] = i;', '  }',
      '  for (int q = 0; q < m; q++) votes[LABEL[who[q]]]++;', '  int top = 0;', `  for (int c = 1; c < ${s.K}; c++) if (votes[c] > votes[top]) top = c;`, '  return top;', '}',
    ];
    return { c: [...head(name, `${s.k}-nearest neighbours, ${p}`), classNote(s.classes) + `static const ${T} TRAIN[${N * P}] = {\n${list(s.train.flat(), v)}\n};`, `static const uint8_t LABEL[${N}] = {\n${list(s.label, String, 16)}\n};`, ...st.arrays, '', ...lines, ''].join('\n'), h: header(name, `int ${name}_predict(const ${T} x[${P}]);`, classNote(s.classes)) };
  }
  // Ensembles: every tree's nodes one after another; START gives each tree's first node.
  const nodes = s.trees.flatMap((t) => t.pred), total = nodes.length, I = total > 32767 ? 'int32_t' : 'int16_t', starts: number[] = [];
  let at = 0;
  for (const t of s.trees) { starts.push(at); at += t.pred.length; }
  const bag = s.method === 'bag', cls = !!s.K;
  const arrays = [
    `static const ${I} START[${s.trees.length}] = {\n${list(starts, String, 16)}\n};`,
    `static const ${I} PRED[${total}] = {\n${list(nodes, String, 16)}\n};`,
    `static const ${T} CUT[${total}] = {\n${list(s.trees.flatMap((t) => t.cut.map((x) => (Number.isFinite(x) ? x : 0))), v)}\n};`,
    `static const ${I} LEFT[${total}] = {\n${list(s.trees.flatMap((t) => t.left), String, 16)}\n};`,
    `static const ${I} RIGHT[${total}] = {\n${list(s.trees.flatMap((t) => t.right), String, 16)}\n};`,
    cls && bag ? `static const ${T} PROB[${total * s.K}] = {\n${list(s.trees.flatMap((t) => t.probs.flat()), v)}\n};` : cls ? `static const uint8_t LEAF[${total}] = {\n${list(s.trees.flatMap((t) => t.value), String, 16)}\n};` : `static const ${T} LEAF[${total}] = {\n${list(s.trees.flatMap((t) => t.value), v)}\n};`,
    // A bagged forest weighs its trees alike: no weights kept.
    ...(s.method === 'bag' ? [] : [`static const ${T} ALPHA[${s.trees.length}] = {\n${list(s.alpha, v)}\n};`]),
  ];
  const walk = ['    int base = START[t], n = 0;', '    while (PRED[base + n] >= 0) n = x[PRED[base + n]] < CUT[base + n] ? LEFT[base + n] : RIGHT[base + n];'];
  const lines = cls
    ? [`int ${name}_predict(const ${T} x[${s.inputs}], ${T} scores[${s.K}]) {`, `  ${T} v[${s.K}] = {0}, sum = 0;`, `  for (int t = 0; t < ${s.trees.length}; t++) {`, ...walk,
      bag ? `    for (int k = 0; k < ${s.K}; k++) v[k] += PROB[(base + n) * ${s.K} + k];` : '    v[LEAF[base + n]] += ALPHA[t];', '  }',
      `  for (int k = 0; k < ${s.K}; k++) sum += v[k];`, '  if (sum == 0) sum = 1;', '  int top = 0;', `  for (int k = 0; k < ${s.K}; k++) { if (scores) scores[k] = v[k] / sum; if (v[k] > v[top]) top = k; }`, '  return top;', '}']
    : [`${T} ${name}_predict(const ${T} x[${s.inputs}]) {`, `  ${T} s = ${s.method === 'lsboost' ? v(s.init) : '0'};`, `  for (int t = 0; t < ${s.trees.length}; t++) {`, ...walk,
      s.method === 'lsboost' ? '    s += ALPHA[t] * LEAF[base + n];' : '    s += LEAF[base + n];', '  }', `  return ${s.method === 'lsboost' ? 's' : `s / ${s.trees.length}`};`, '}'];
  const proto = cls ? `int ${name}_predict(const ${T} x[${s.inputs}], ${T} scores[${s.K}]);` : `${T} ${name}_predict(const ${T} x[${s.inputs}]);`;
  return { c: [...head(name, `an ensemble of ${s.trees.length} trees (${s.method}), ${p}`), classNote(s.classes) + arrays.join('\n'), '', ...lines, ''].join('\n'), h: header(name, proto, classNote(s.classes)) };
}

// ——— M529: SVMs for many classes (fitcecoc), naive Bayes, discriminants ———
function ecocC(s: EcocSpec, name: string, p: Prec, T: string, fn: (f: string) => string, v: (x: number) => string): { c: string; h: string } {
  const P = s.inputs, L = s.learners.length, K = s.code.length, svs = s.learners.map((l) => l.sv.length);
  const starts: number[] = [];
  let at = 0;
  for (const n of svs) { starts.push(at); at += n; }
  const anyStd = s.learners.some((l) => l.mu && l.sigma);
  const ker = s.kernel === 'rbf' ? `${fn('exp')}(-d / (SCALE * SCALE))` : s.kernel === 'polynomial' ? `${fn('pow')}(1 + d / (SCALE * SCALE), ${s.order})` : 'd / (SCALE * SCALE)';
  // M530: in 8 bits, each learner's support vectors and coefficients are whole numbers with a scale of their own.
  const q8 = p === 'int8' ? s.learners.map((l) => ({ sv: quantizeLayer(l.sv.flat()), coef: quantizeLayer(l.coef) })) : null;
  const arrays = [
    ...(q8 ? [
      `static const int8_t SV[${at * P}] = {\n${list(q8.flatMap((l) => [...l.sv.q]), String, 16)}\n};`,
      `static const float SVS[${L}] = { ${q8.map((l) => v(l.sv.scale)).join(', ')} };`,
      `static const int8_t COEF[${at}] = {\n${list(q8.flatMap((l) => [...l.coef.q]), String, 16)}\n};`,
      `static const float CS[${L}] = { ${q8.map((l) => v(l.coef.scale)).join(', ')} };`,
    ] : [
      `static const ${T} SV[${at * P}] = {\n${list(s.learners.flatMap((l) => l.sv.flat()), v)}\n};`,
      `static const ${T} COEF[${at}] = {\n${list(s.learners.flatMap((l) => l.coef), v)}\n};`,
    ]),
    `static const int32_t START[${L + 1}] = { ${[...starts, at].join(', ')} };`,
    `static const ${T} BIAS[${L}] = { ${s.learners.map((l) => v(l.bias)).join(', ')} };`,
    `static const ${T} SCALE = ${v(s.scale)};`,
    `static const int8_t CODE[${K * L}] = {\n${list(s.code.flat(), String, 16)}\n};`,
    ...(anyStd ? [`static const ${T} MU[${L * P}] = {\n${list(s.learners.flatMap((l) => l.mu ?? Array(P).fill(0)), v)}\n};`, `static const ${T} SIGMA[${L * P}] = {\n${list(s.learners.flatMap((l) => l.sigma ?? Array(P).fill(1)), v)}\n};`] : []),
  ];
  const lines = [
    `int ${name}_predict(const ${T} x[${P}], ${T} scores[${K}]) {`, `  ${T} f[${L}], z[${P}], loss[${K}];`,
    `  for (int l = 0; l < ${L}; l++) {`,
    anyStd ? `    for (int j = 0; j < ${P}; j++) z[j] = (x[j] - MU[l * ${P} + j]) / SIGMA[l * ${P} + j];` : `    for (int j = 0; j < ${P}; j++) z[j] = x[j];`,
    '    f[l] = BIAS[l];', '    for (int q = START[l]; q < START[l + 1]; q++) {', `      ${T} d = 0;`,
    s.kernel === 'rbf' ? `      for (int j = 0; j < ${P}; j++) { ${T} e = ${q8 ? 'SVS[l] * ' : ''}SV[q * ${P} + j] - z[j]; d += e * e; }` : `      for (int j = 0; j < ${P}; j++) d += SV[q * ${P} + j] * z[j];${q8 ? '\n      d *= SVS[l];' : ''}`,
    `      f[l] += ${q8 ? 'CS[l] * ' : ''}COEF[q] * ${ker};`, '    }', '  }',
    '  /* hinge-loss decoding: each class\'s average loss over the learners that know it; the smallest wins */',
    `  for (int k = 0; k < ${K}; k++) {`, `    ${T} sum = 0;`, '    int n = 0;',
    `    for (int l = 0; l < ${L}; l++) { int c = CODE[k * ${L} + l]; if (c) { ${T} h = 1 - c * f[l]; sum += (h > 0 ? h : 0) / 2; n++; } }`,
    '    loss[k] = -sum / (n ? n : 1);', '    if (scores) scores[k] = loss[k];', '  }',
    ...pickTop(K, 'loss'), '  return top;', '}',
  ];
  return { c: [...head(name, `${L} support vector machines for ${K} classes, one per pair (${s.kernel} kernel), ${p === 'int8' ? '8-bit support vectors and coefficients' : p}`), classNote(s.classes) + arrays.join('\n'), '', ...lines, ''].join('\n'), h: header(name, `int ${name}_predict(const ${T} x[${P}], ${T} scores[${K}]);`, classNote(s.classes)) };
}
function scoreC(s: BayesSpec | DiscrSpec, name: string, p: Prec, T: string, fn: (f: string) => string, v: (x: number) => string): { c: string; h: string } {
  const K = s.classes.length, bayes = s.kind === 'bayes', P = bayes ? s.mu[0].length : s.w[0].length;
  // Naive Bayes: log prior − Σ log spread (a constant per class), then − ½ ((x − mean) / spread)² per input.
  // M530: in 8 bits the means and 1 / spread (naive Bayes) or the weights (discriminant) are whole numbers with one scale;
  // BASE is then worked out from the spreads as the chip holds them.
  const e8 = p === 'int8' ? eightOf(s) : null;
  const arrays = e8?.kind === 'bayes'
    ? [`static const int8_t MU[${K * P}] = {\n${list(e8.mu.q, String, 16)}\n};`, `static const float MS = ${v(e8.mu.scale)};`, `static const int8_t PREC[${K * P}] = {\n${list(e8.prec.q, String, 16)}\n};`, `static const float PS = ${v(e8.prec.scale)};`, `static const float BASE[${K}] = { ${e8.spec.prior.map((pk, k) => v(Math.log(pk) - e8.spec.sd[k].reduce((a, d) => a + Math.log(d), 0))).join(', ')} };`]
    : e8?.kind === 'discr'
      ? [`static const int8_t W[${K * P}] = {\n${list(e8.w.q, String, 16)}\n};`, `static const float WS = ${v(e8.w.scale)};`, `static const float C[${K}] = { ${e8.spec.c.map(v).join(', ')} };`]
      : bayes
        ? [`static const ${T} MU[${K * P}] = {\n${list(s.mu.flat(), v)}\n};`, `static const ${T} SD[${K * P}] = {\n${list(s.sd.flat(), v)}\n};`, `static const ${T} BASE[${K}] = { ${s.prior.map((pk, k) => v(Math.log(pk) - s.sd[k].reduce((a, d) => a + Math.log(d), 0))).join(', ')} };`]
        : [`static const ${T} W[${K * P}] = {\n${list(s.w.flat(), v)}\n};`, `static const ${T} C[${K}] = { ${s.c.map(v).join(', ')} };`];
  const lines = [
    `int ${name}_predict(const ${T} x[${P}], ${T} scores[${K}]) {`, `  ${T} g[${K}], top_g, sum = 0;`,
    `  for (int k = 0; k < ${K}; k++) {`,
    bayes ? `    ${T} t = BASE[k];` : `    ${T} t = C[k]${e8 ? ', w = 0' : ''};`,
    bayes
      ? `    for (int j = 0; j < ${P}; j++) { ${T} e = ${e8 ? `(x[j] - MS * MU[k * ${P} + j]) * (PS * PREC[k * ${P} + j])` : `(x[j] - MU[k * ${P} + j]) / SD[k * ${P} + j]`}; t -= ${p === 'double' ? '0.5' : '0.5f'} * e * e; }`
      : e8 ? `    for (int j = 0; j < ${P}; j++) w += W[k * ${P} + j] * x[j];\n    t += WS * w;` : `    for (int j = 0; j < ${P}; j++) t += W[k * ${P} + j] * x[j];`,
    '    g[k] = t;', '  }', ...pickTop(K, 'g'),
    '  /* the chances of each class (softmax), if asked */', '  if (scores) {', '    top_g = g[top];',
    `    for (int k = 0; k < ${K}; k++) { scores[k] = ${fn('exp')}(g[k] - top_g); sum += scores[k]; }`,
    `    for (int k = 0; k < ${K}; k++) scores[k] /= sum;`, '  }', '  return top;', '}',
  ];
  return { c: [...head(name, `${bayes ? 'naive Bayes, a bell curve per class and input' : 'a linear discriminant'}, ${p === 'int8' ? (bayes ? '8-bit means and spreads' : '8-bit weights') : p}`), classNote(s.classes) + arrays.join('\n'), '', ...lines, ''].join('\n'), h: header(name, `int ${name}_predict(const ${T} x[${P}], ${T} scores[${K}]);`, classNote(s.classes)) };
}

// ——— M530: many-class SVMs, naive Bayes and discriminants in 8 bits ———
/** Positive numbers (1 / spread) as 8-bit whole numbers: never 0, so no spread becomes endless. */
function quantizePositive(w: ArrayLike<number>): { q: Int8Array; scale: number } {
  const r = quantizeLayer(w);
  for (let i = 0; i < r.q.length; i++) if (r.q[i] < 1) r.q[i] = 1;
  return r;
}
type Eight = { kind: 'bayes'; mu: { q: Int8Array; scale: number }; prec: { q: Int8Array; scale: number }; spec: BayesSpec } | { kind: 'discr'; w: { q: Int8Array; scale: number }; spec: DiscrSpec } | { kind: 'ecoc'; spec: EcocSpec };
/** The 8-bit numbers and the model they stand for (each number back as scale × whole number), for the C and its twin. */
export function eightOf(s: EcocSpec | BayesSpec | DiscrSpec): Eight {
  const back = ({ q, scale }: { q: Int8Array; scale: number }) => Array.from(q, (x) => x * scale);
  const rows = (xs: number[], c: number) => Array.from({ length: xs.length / c }, (_, i) => xs.slice(i * c, i * c + c));
  if (s.kind === 'bayes') {
    const P = s.mu[0].length, mu = quantizeLayer(s.mu.flat()), prec = quantizePositive(s.sd.flat().map((d) => 1 / d));
    return { kind: 'bayes', mu, prec, spec: { ...s, mu: rows(back(mu), P), sd: rows(back(prec).map((x) => 1 / x), P) } };
  }
  if (s.kind === 'discr') { const w = quantizeLayer(s.w.flat()); return { kind: 'discr', w, spec: { ...s, w: rows(back(w), s.w[0].length) } }; }
  return { kind: 'ecoc', spec: { ...s, learners: s.learners.map((l) => ({ ...l, sv: rows(back(quantizeLayer(l.sv.flat())), s.inputs), coef: back(quantizeLayer(l.coef)) })) } };
}
/** The class these models give a row (an earlier class wins a tie): Hyperion's twin of their C, in doubles. */
export function classOf(s: EcocSpec | BayesSpec | DiscrSpec, x: number[]): number {
  const first = (g: number[], better: (a: number, b: number) => boolean) => g.reduce((top, v, k) => (better(v, g[top]) ? k : top), 0);
  if (s.kind === 'discr') return first(s.w.map((w, k) => s.c[k] + w.reduce((a, wj, j) => a + wj * x[j], 0)), (a, b) => a > b);
  if (s.kind === 'bayes') return first(s.mu.map((mu, k) => mu.reduce((t, m, j) => t - 0.5 * ((x[j] - m) / s.sd[k][j]) ** 2, Math.log(s.prior[k]) - s.sd[k].reduce((a, d) => a + Math.log(d), 0))), (a, b) => a > b);
  const f = s.learners.map((l) => {
    const z = x.map((v, j) => (l.mu && l.sigma ? (v - l.mu[j]) / l.sigma[j] : v)), S2 = s.scale * s.scale;
    return l.sv.reduce((acc, sv, q) => {
      const d = s.kernel === 'rbf' ? sv.reduce((a, v, j) => a + (v - z[j]) ** 2, 0) : sv.reduce((a, v, j) => a + v * z[j], 0);
      return acc + l.coef[q] * (s.kernel === 'rbf' ? Math.exp(-d / S2) : s.kernel === 'polynomial' ? (1 + d / S2) ** s.order : d / S2);
    }, l.bias);
  });
  const loss = s.code.map((row) => { let sum = 0, n = 0; row.forEach((c, l) => { if (c) { sum += Math.max(0, 1 - c * f[l]) / 2; n++; } }); return sum / (n || 1); });
  return first(loss, (a, b) => a < b);
}

// ——— M525: a wholly 8-bit network ———
export interface FullLayer { r: number; c: number; q: Int8Array; bias: Int32Array; m: number; sh: number; lut: Int8Array | null; scale: number }
export interface FullInt { inScale: number; mu: number[] | null; sigma: number[] | null; act: NetSpec['act']; classes: string[] | null; layers: FullLayer[]; outScale: number }
const ACT = { relu: (z: number) => (z > 0 ? z : 0), tanh: Math.tanh, sigmoid: (z: number) => 1 / (1 + Math.exp(-z)), none: (z: number) => z };
/** A multiplier as m · 2^-sh with m of 15 bits, so the 32-bit sum times m stays exact in 53 bits (JavaScript's numbers). */
function multiplier(M: number): { m: number; sh: number } {
  let sh = 14 - Math.floor(Math.log2(M)), m = Math.round(M * 2 ** sh);
  if (m >= 2 ** 15) { m = Math.round(m / 2); sh--; }
  if (sh < 1) { m = Math.round(M * 2); sh = 1; }
  return { m, sh };
}
/** acc · m / 2^sh, rounded to the nearest (halves up): the same in C (fx-style floor division) and here. */
export const requant = (acc: number, m: number, sh: number) => Math.floor((acc * m + 2 ** (sh - 1)) / 2 ** sh);
const clamp8 = (v: number, lo: number) => (v < lo ? lo : v > 127 ? 127 : v);
const big = (xs: number[]) => Math.max(1e-12, ...xs.map(Math.abs));
/** The scales, found by running the network in floating point on the rows given (its training rows). */
export function planFullInt(s: NetSpec, rows: number[][]): FullInt {
  if (s.W.some((w) => w.c > 4096)) throw new Error('Layers up to 4,096 inputs wide here.');
  const zs = rows.map((x) => (s.mu && s.sigma ? x.map((v, i) => (v - s.mu![i]) / s.sigma![i]) : x));
  const L = s.W.length, act = ACT[s.act];
  // Each layer's inputs and sums over the rows (floating point).
  const ins: number[][][] = [zs], sums: number[][][] = [];
  for (let l = 0; l < L; l++) {
    const w = s.W[l], z = ins[l].map((a) => Array.from({ length: w.r }, (_, q) => { let t = s.b[l][q]; for (let i = 0; i < w.c; i++) t += w.d[q + i * w.r] * a[i]; return t; }));
    sums.push(z);
    if (l < L - 1) ins.push(z.map((r) => r.map(act)));
  }
  const inScale = big(zs.flat()) / 127;
  let sa = inScale;
  const layers: FullLayer[] = [];
  for (let l = 0; l < L; l++) {
    const w = s.W[l], rowMajor = Float64Array.from({ length: w.r * w.c }, (_, k) => w.d[Math.floor(k / w.c) + (k % w.c) * w.r]);
    const { q, scale: sw } = quantizeLayer(rowMajor), S = sw * sa;
    const bias = Int32Array.from(s.b[l], (b) => Math.max(-(2 ** 31), Math.min(2 ** 31 - 1, Math.round(b / S))));
    if (l === L - 1) { layers.push({ r: w.r, c: w.c, q, bias, m: 0, sh: 0, lut: null, scale: S }); break; }
    if (s.act === 'tanh' || s.act === 'sigmoid') {
      const sz = big(sums[l].flat()) / 127, next = 1 / 127, { m, sh } = multiplier(S / sz);
      const lut = Int8Array.from({ length: 256 }, (_, i) => clamp8(Math.round(act((i - 128) * sz) / next), -127));
      layers.push({ r: w.r, c: w.c, q, bias, m, sh, lut, scale: S });
      sa = next;
    } else {
      const next = big(ins[l + 1].flat()) / 127, { m, sh } = multiplier(S / next);
      layers.push({ r: w.r, c: w.c, q, bias, m, sh, lut: null, scale: S });
      sa = next;
    }
  }
  return { inScale, mu: s.mu, sigma: s.sigma, act: s.act, classes: s.classes, layers, outScale: layers[L - 1].scale };
}
/** The 8-bit inputs for a row (what name_predict does before the integer core). */
export const quantizeInput = (f: FullInt, x: number[]) => x.map((v, i) => clamp8(Math.floor((f.mu && f.sigma ? (v - f.mu[i]) / f.sigma[i] : v) / f.inScale + 0.5), -127));
/** The integer core, exactly as the C runs it: the class's number, or the regression's value. */
export function runFullInt(f: FullInt, xq: number[]): { cls: number; out: number[] } {
  let a = xq;
  const L = f.layers.length;
  for (let l = 0; l < L; l++) {
    const y = f.layers[l], next: number[] = new Array(y.r);
    for (let q = 0; q < y.r; q++) {
      let acc = y.bias[q];
      for (let i = 0; i < y.c; i++) acc += y.q[q * y.c + i] * a[i];
      if (l === L - 1) { next[q] = acc; continue; }
      const r = requant(acc, y.m, y.sh);
      next[q] = y.lut ? y.lut[clamp8(r, -127) + 128] : clamp8(r, f.act === 'relu' ? 0 : -127);
    }
    a = next;
  }
  let top = 0;
  for (let q = 1; q < a.length; q++) if (a[q] > a[top]) top = q;
  return { cls: top, out: f.classes ? a : [a[0] * f.outScale] };
}
export function fullIntC(f: FullInt, name: string): { c: string; h: string } {
  const L = f.layers.length, inputs = f.layers[0].c, outputs = f.layers[L - 1].r, widest = Math.max(...f.layers.map((y) => Math.max(y.r, y.c))), cls = !!f.classes;
  const arrays: string[] = [];
  f.layers.forEach((y, l) => {
    arrays.push(`static const int8_t W${l + 1}[${y.r * y.c}] = {\n${list(y.q, String, 16)}\n};`, `static const int32_t B${l + 1}[${y.r}] = {\n${list(y.bias, String, 8)}\n};`);
    if (l < L - 1) arrays.push(`static const int32_t M${l + 1} = ${y.m}; /* times 2^-${y.sh}: from this layer's sums to the next layer's 8-bit scale */`);
    if (y.lut) arrays.push(`static const int8_t T${l + 1}[256] = {\n${list(y.lut, String, 16)}\n};`);
  });
  if (f.mu && f.sigma) arrays.push(`static const float MU[${inputs}] = { ${f.mu.map((x) => num(x, 'single')).join(', ')} };`, `static const float SIGMA[${inputs}] = { ${f.sigma.map((x) => num(x, 'single')).join(', ')} };`);
  arrays.push(`static const float IN_SCALE = ${num(f.inScale, 'single')};`);
  if (!cls) arrays.push(`static const float OUT_SCALE = ${num(f.outScale, 'single')};`);
  const core = [`${cls ? 'int' : 'int32_t'} ${name}_predict_q(const int8_t xq[${inputs}]) {`, `  int8_t a[${widest}], b[${widest}];`, `  int32_t z[${outputs}];`, `  for (int i = 0; i < ${inputs}; i++) a[i] = xq[i];`];
  f.layers.forEach((y, l) => {
    const last = l === L - 1, k = l + 1;
    core.push(`  /* layer ${k}: ${y.c} → ${y.r}${last ? '' : `, ${f.act}`} */`, `  for (int q = 0; q < ${y.r}; q++) {`, `    int32_t acc = B${k}[q];`, `    for (int i = 0; i < ${y.c}; i++) acc += (int32_t)W${k}[q * ${y.c} + i] * a[i];`);
    if (last) core.push('    z[q] = acc;', '  }');
    else {
      core.push(y.lut ? `    b[q] = T${k}[clamp8(requant(acc, M${k}, ${y.sh}), -127) + 128];` : `    b[q] = clamp8(requant(acc, M${k}, ${y.sh}), ${f.act === 'relu' ? 0 : -127});`, '  }', `  for (int q = 0; q < ${y.r}; q++) a[q] = b[q];`);
    }
  });
  if (cls) core.push('  int top = 0;', `  for (int q = 1; q < ${outputs}; q++) if (z[q] > z[top]) top = q;`, '  return top;', '}');
  else core.push('  return z[0];', '}');
  const wrap = [`${cls ? 'int' : 'float'} ${name}_predict(const float x[${inputs}]) {`, `  int8_t xq[${inputs}];`,
    `  for (int i = 0; i < ${inputs}; i++) xq[i] = clamp8((int32_t)floorf(${f.mu ? '(x[i] - MU[i]) / SIGMA[i]' : 'x[i]'} / IN_SCALE + 0.5f), -127);`,
    `  return ${cls ? `${name}_predict_q(xq)` : `(float)${name}_predict_q(xq) * OUT_SCALE`};`, '}'];
  const helpers = [
    '/* acc · m / 2^sh, rounded to the nearest (halves up), with whole numbers only */',
    'static int32_t requant(int32_t acc, int32_t m, int sh) {', '  int64_t t = (int64_t)acc * m + ((int64_t)1 << (sh - 1)), d = (int64_t)1 << sh, q = t / d;', '  if (t % d != 0 && t < 0) q -= 1;', '  return (int32_t)q;', '}',
    'static int8_t clamp8(int32_t v, int lo) { return (int8_t)(v < lo ? lo : v > 127 ? 127 : v); }',
  ];
  const what = `a neural network wholly in 8-bit whole numbers: weights, activations${f.act === 'tanh' || f.act === 'sigmoid' ? ` (${f.act} by a table)` : ''}; 32-bit sums`;
  const protos = `${cls ? 'int' : 'int32_t'} ${name}_predict_q(const int8_t xq[${inputs}]);\n${cls ? 'int' : 'float'} ${name}_predict(const float x[${inputs}]);`;
  return { c: [...head(name, what), classNote(f.classes) + arrays.join('\n'), '', ...helpers, '', ...core, '', '/* From the sensor\'s numbers: standardised and made 8-bit (the only floating point), then the integer core. */', ...wrap, ''].join('\n'), h: header(name, protos, classNote(f.classes)) };
}
