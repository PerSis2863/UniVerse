// Hyperion's embedded AI (M481): a trained model made small enough for a microcontroller. Neural networks: weights in
// double, single or 8-bit whole numbers (one scale per layer, symmetric: w ≈ scale·q with q from −127 to 127; the
// activations stay in floating point, so the chip needs no floating-point weights in memory, only the arithmetic).
// Decision trees: their split points in double or single. Each kind written out as plain C with its weights as
// constant arrays and one predict function. Our own code.

export type Prec = 'double' | 'single' | 'int8';
export interface NetSpec { kind: 'net'; W: { r: number; c: number; d: ArrayLike<number> }[]; b: ArrayLike<number>[]; act: 'relu' | 'tanh' | 'sigmoid' | 'none'; classes: string[] | null; mu: number[] | null; sigma: number[] | null }
export interface TreeSpec { kind: 'tree'; pred: number[]; cut: number[]; left: number[]; right: number[]; leaf: number[]; classes: string[] | null; inputs: number }
export type Spec = NetSpec | TreeSpec;

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
