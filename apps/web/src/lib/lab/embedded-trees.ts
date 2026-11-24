import { classNote, head, header, list, num, type EnsSpec, type TreeSpec } from './embedded';

// M539: decision trees and tree ensembles wholly in whole numbers ('int8full'), as the networks (M525) and the other
// models (M533, M537): each input becomes 8-bit (its own centre and step from the training rows, the only floating
// point besides the answer or the scores), each split point the whole number it falls on in those steps, so a walk down a
// tree only compares whole numbers. A class tree's leaves are already class numbers; a bagged forest's leaf chances are
// 8-bit (0–255) and summed, a boosted one's tree weights 15-bit and summed; a regression's leaf values are 32-bit on one
// shared scale S (LSBoost's weights folded in), summed in 64 bits, the answer F · S. The C and the twin here give the
// same whole numbers.

export interface TreeIntPlan {
  model: 'tree' | 'ensemble'; method: 'tree' | EnsSpec['method']; P: number; centre: number[]; step: number[]; classes: string[] | null; K: number;
  trees: { pred: number[]; cut: number[]; left: number[]; right: number[] }[];
  /** per node: the class (class tree, boosted), the K chances 0–255 (bagged classes), or the value F (regression) */
  leaf: number[][];
  /** boosted classes: each tree's weight in 15 bits */
  alpha: number[];
  /** regression: F's start (LSBoost's Init on the scale) and the scale (a bagged forest's mean folded in) */
  init: number; S: number;
}

const MAX_IN = 65536;
const clamp8 = (v: number) => (v < -127 ? -127 : v > 127 ? 127 : v);

/** The plan: the input steps from the training rows, every split point on them, the leaves as whole numbers. */
export function planTree(s: TreeSpec | EnsSpec, rows: number[][]): TreeIntPlan {
  const P = s.inputs;
  if (P > MAX_IN) throw new Error(`Up to ${MAX_IN.toLocaleString('en')} inputs here.`);
  const lo = Array.from({ length: P }, (_, j) => Math.min(...rows.map((r) => r[j]))), hi = Array.from({ length: P }, (_, j) => Math.max(...rows.map((r) => r[j])));
  const centre = lo.map((l, j) => (l + hi[j]) / 2), step = lo.map((l, j) => (hi[j] - l) / 254 || 1);
  // x < cut becomes xq < cq, cq the cut rounded as the inputs are (−128 and 128: always right, always left)
  const cutQ = (pred: number[], cut: number[]) => cut.map((c, n) => (pred[n] < 0 || !Number.isFinite(c) ? 0 : Math.max(-128, Math.min(128, Math.floor((c - centre[pred[n]]) / step[pred[n]] + 0.5)))));
  const src = s.kind === 'tree' ? [{ pred: s.pred, cut: s.cut, left: s.left, right: s.right }] : s.trees;
  const trees = src.map((t) => ({ pred: t.pred, cut: cutQ(t.pred, t.cut), left: t.left, right: t.right }));
  const K = s.kind === 'tree' ? (s.classes ? s.classes.length : 0) : s.K, method: TreeIntPlan['method'] = s.kind === 'tree' ? 'tree' : s.method;
  const base = { model: s.kind, method, P, centre, step, classes: s.classes, K, trees, alpha: [] as number[], init: 0, S: 1 };
  if (K && s.kind === 'tree') return { ...base, leaf: [s.leaf] };
  if (K && s.kind === 'ensemble') {
    if (s.method === 'bag') return { ...base, leaf: s.trees.map((t) => t.probs.flatMap((r) => r.map((p) => Math.max(0, Math.min(255, Math.round(p * 255)))))) };
    const big = Math.max(1e-300, ...s.alpha.map(Math.abs));
    return { ...base, leaf: s.trees.map((t) => t.value), alpha: s.alpha.map((a) => Math.round((a / big) * 32767)) };
  }
  // Regression: each leaf's share of the answer (LSBoost: its tree's weight times it) on one scale, at most 2^23.
  const values = s.kind === 'tree' ? [s.leaf] : s.trees.map((t, i) => t.value.map((v) => (s.method === 'lsboost' ? s.alpha[i] * v : v)));
  const init = s.kind === 'ensemble' && s.method === 'lsboost' ? s.init : 0;
  const S = Math.max(1e-300, Math.abs(init), ...values.flatMap((v) => v.map(Math.abs))) / 2 ** 23;
  const per = s.kind === 'ensemble' && s.method === 'bag' ? s.trees.length : 1;
  return { ...base, leaf: values.map((v) => v.map((x) => Math.round(x / S))), init: Math.round(init / S), S: S / per };
}

/** The 8-bit inputs for a row (the C's name_predict does the same in float). */
export const treeInput = (p: TreeIntPlan, x: number[]) => x.map((v, j) => clamp8(Math.floor((v - p.centre[j]) / p.step[j] + 0.5)));

/** The integer core, exactly as the C runs it: the class and its votes, or the answer as F (the answer is F · S). */
export function runTree(p: TreeIntPlan, xq: number[]): { cls: number; votes: number[]; F: number } {
  const leafOf = (t: number) => {
    const tr = p.trees[t];
    let n = 0;
    while (tr.pred[n] >= 0) n = xq[tr.pred[n]] < tr.cut[n] ? tr.left[n] : tr.right[n];
    return n;
  };
  if (!p.K) { let F = p.init; p.trees.forEach((_, t) => { F += p.leaf[t][leafOf(t)]; }); return { cls: -1, votes: [], F }; }
  if (p.method === 'tree') return { cls: p.leaf[0][leafOf(0)], votes: [], F: 0 };
  const votes = Array(p.K).fill(0);
  p.trees.forEach((_, t) => {
    const n = leafOf(t);
    if (p.method === 'bag') for (let k = 0; k < p.K; k++) votes[k] += p.leaf[t][n * p.K + k];
    else votes[p.leaf[t][n]] += p.alpha[t];
  });
  let top = 0;
  for (let k = 1; k < p.K; k++) if (votes[k] > votes[top]) top = k;
  return { cls: top, votes, F: 0 };
}

/** Bytes the chip keeps: per node the input, split, two children and the leaf; the steps and centres. */
export function treeBytes(p: TreeIntPlan): number {
  const nodes = p.trees.reduce((a, t) => a + t.pred.length, 0), idx = Math.max(nodes, p.P) > 32767 ? 4 : 2;
  const leaf = p.K && p.method === 'bag' ? p.K : p.K ? 1 : 4;
  return nodes * (3 * idx + 2 + leaf) + (p.model === 'ensemble' ? p.trees.length * idx : 0) + p.alpha.length * 2 + 8 * p.P;
}

export function treeIntC(p: TreeIntPlan, name: string): { c: string; h: string } {
  const T = p.trees.length, P = p.P, K = p.K, nodes = p.trees.flatMap((t) => t.pred), total = nodes.length;
  const I = Math.max(total, P) > 32767 ? 'int32_t' : 'int16_t', starts: number[] = [], multi = p.model === 'ensemble';
  let at = 0;
  for (const t of p.trees) { starts.push(at); at += t.pred.length; }
  const leafArr = K && p.method === 'bag' ? `static const uint8_t LEAF[${total * K}] = {\n${list(p.leaf.flat(), String, 16)}\n};`
    : K ? `static const uint8_t LEAF[${total}] = {\n${list(p.leaf.flat(), String, 16)}\n};`
      : `static const int32_t LEAF[${total}] = {\n${list(p.leaf.flat(), String, 8)}\n};`;
  const arrays = [
    `static const float CENTRE[${P}] = { ${p.centre.map((x) => num(x, 'single')).join(', ')} };`, `static const float STEP[${P}] = { ${p.step.map((x) => num(x, 'single')).join(', ')} };`,
    ...(multi ? [`static const ${I} START[${T}] = {\n${list(starts, String, 16)}\n};`] : []),
    `static const ${I} PRED[${total}] = {\n${list(nodes, String, 16)}\n};`,
    `/* each split point in the input's 8-bit steps: go left when xq < CUT */\nstatic const int16_t CUT[${total}] = {\n${list(p.trees.flatMap((t) => t.cut), String, 16)}\n};`,
    `static const ${I} LEFT[${total}] = {\n${list(p.trees.flatMap((t) => t.left), String, 16)}\n};`,
    `static const ${I} RIGHT[${total}] = {\n${list(p.trees.flatMap((t) => t.right), String, 16)}\n};`,
    leafArr,
    ...(p.alpha.length ? [`/* each tree's weight in 15 bits */\nstatic const int16_t ALPHA[${T}] = {\n${list(p.alpha, String, 16)}\n};`] : []),
  ];
  const walk = multi ? ['    int base = START[t], n = 0;', '    while (PRED[base + n] >= 0) n = xq[PRED[base + n]] < CUT[base + n] ? LEFT[base + n] : RIGHT[base + n];'] : [];
  const quant = `  for (int j = 0; j < ${P}; j++) { float q = floorf((x[j] - CENTRE[j]) / STEP[j] + 0.5f); xq[j] = (int8_t)(q < -127 ? -127 : q > 127 ? 127 : q); }`;
  const S = num(p.S, 'single');
  let core: string[], wrap: string[], protos: string, what: string;
  if (!K) {
    core = [`/* The integer core: 8-bit inputs in, the answer as a whole number F out (the answer is F × ${S}). */`, `int64_t ${name}_predict_q(const int8_t xq[${P}]) {`, `  int64_t F = ${p.init};`,
      ...(multi ? [`  for (int t = 0; t < ${T}; t++) {`, ...walk, '    F += LEAF[base + n];', '  }'] : ['  int n = 0;', '  while (PRED[n] >= 0) n = xq[PRED[n]] < CUT[n] ? LEFT[n] : RIGHT[n];', '  F += LEAF[n];']),
      '  return F;', '}'];
    wrap = [`float ${name}_predict(const float x[${P}]) {`, `  int8_t xq[${P}];`, quant, `  return (float)${name}_predict_q(xq) * ${S};`, '}'];
    protos = `int64_t ${name}_predict_q(const int8_t xq[${P}]);\nfloat ${name}_predict(const float x[${P}]);`;
    what = multi ? `an ensemble of ${T} regression trees (${p.method})` : 'a regression tree';
  } else if (p.method === 'tree') {
    core = ['/* The integer core: 8-bit inputs in, the class out. */', `int ${name}_predict_q(const int8_t xq[${P}]) {`, '  int n = 0;', '  while (PRED[n] >= 0) n = xq[PRED[n]] < CUT[n] ? LEFT[n] : RIGHT[n];', '  return LEAF[n];', '}'];
    wrap = [`int ${name}_predict(const float x[${P}]) {`, `  int8_t xq[${P}];`, quant, `  return ${name}_predict_q(xq);`, '}'];
    protos = `int ${name}_predict_q(const int8_t xq[${P}]);\nint ${name}_predict(const float x[${P}]);`;
    what = 'a classification tree';
  } else {
    core = [`/* The integer core: 8-bit inputs in, the class out; votes[k] is each class's whole-number total (${p.method === 'bag' ? 'its chances, 0–255 a tree' : 'the 15-bit weights of the trees that chose it'}). */`,
      `int ${name}_predict_q(const int8_t xq[${P}], int32_t votes[${K}]) {`, `  for (int k = 0; k < ${K}; k++) votes[k] = 0;`, `  for (int t = 0; t < ${T}; t++) {`, ...walk,
      p.method === 'bag' ? `    for (int k = 0; k < ${K}; k++) votes[k] += LEAF[(base + n) * ${K} + k];` : '    votes[LEAF[base + n]] += ALPHA[t];', '  }',
      '  int top = 0;', `  for (int k = 1; k < ${K}; k++) if (votes[k] > votes[top]) top = k;`, '  return top;', '}'];
    wrap = [`int ${name}_predict(const float x[${P}], float scores[${K}]) {`, `  int8_t xq[${P}];`, `  int32_t votes[${K}];`, '  int top;', quant, `  top = ${name}_predict_q(xq, votes);`,
      '  /* each class\'s share of the votes, if asked */', '  if (scores) {', '    int64_t sum = 0;', `    for (int k = 0; k < ${K}; k++) sum += votes[k];`, `    for (int k = 0; k < ${K}; k++) scores[k] = sum ? (float)votes[k] / (float)sum : 0.0f;`, '  }', '  return top;', '}'];
    protos = `int ${name}_predict_q(const int8_t xq[${P}], int32_t votes[${K}]);\nint ${name}_predict(const float x[${P}], float scores[${K}]);`;
    what = `an ensemble of ${T} classification trees (${p.method})`;
  }
  return { c: [...head(name, `${what}, wholly in whole numbers: 8-bit inputs, whole-number splits${K ? '' : ' and leaves'}`), classNote(p.classes) + arrays.join('\n'), '', ...core, '', '/* From the sensor\'s numbers: each input made 8-bit (the only floating point, with the answer or scores), then the integer core. */', ...wrap, ''].join('\n'), h: header(name, protos, classNote(p.classes)) };
}
