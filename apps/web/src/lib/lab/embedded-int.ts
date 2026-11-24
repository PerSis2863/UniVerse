import { classNote, head, header, list, num, quantizeLayer, quantizePositive, type BayesSpec, type DiscrSpec, type EcocSpec } from './embedded';

// M533: many-class SVMs (fitcecoc), naive Bayes and discriminants wholly in whole numbers ('int8full'), as the networks
// are since M525: the inputs become 8-bit (each input its own centre and step, the only floating point besides the
// optional scores), and everything that decides the class is 8-bit numbers, 32- and 64-bit sums and multipliers
// m · 2^-sh. Each "unit" (a class's score, or one SVM of the many-class set) gives a whole number F on one shared scale S
// (its real value ≈ F · S). The C and the twin here (BigInt) give the same whole numbers.

type Q = { q: Int8Array; scale: number };
/** A linear unit: F = b + requant(Σ w·xq). A distance unit: F = b − requant(Σ ((xq − c)·r)²). An SVM with a Gaussian
 * kernel: Σ coef · E[index of the distance] (E a table of exp, 15 bits). A polynomial one: Σ coef · (1 + t)^order in Q16. */
export type IntUnit =
  | { kind: 'lin'; w: Int8Array; m: number; sh: number; b: number }
  | { kind: 'dist'; c: Int8Array; r: Int8Array; m: number; sh: number; b: number }
  | { kind: 'rbf'; c: Int8Array; r: Int8Array; coef: Int8Array; mt: number; sht: number; m: number; sh: number; b: number }
  | { kind: 'poly'; u: Int8Array; a: number[]; vmax: number; coef: Int8Array; mt: number; sht: number; m: number; sh: number; b: number };
export interface IntPlan { model: 'ecoc' | 'bayes' | 'discr'; P: number; classes: string[]; centre: number[]; step: number[]; S: number; units: IntUnit[]; code: number[][] | null; one: number; order: number }

const TSTEP = 32, TLEN = 512; // the exp table: e^(-i/32) for i < 512 (to e^-16), in 15 bits
export const EXPQ = Int16Array.from({ length: TLEN }, (_, i) => Math.round(Math.exp(-i / TSTEP) * 32767));
const clamp8 = (v: number) => (v < -127 ? -127 : v > 127 ? 127 : v);
/** A multiplier M as m · 2^-sh, with m short enough that a sum of accBits bits times m stays inside 62 bits. */
function multiplier(M: number, accBits: number): { m: number; sh: number } {
  if (!(M > 0)) return { m: 0, sh: 1 };
  const mb = Math.max(4, Math.min(15, 61 - Math.ceil(accBits)));
  let sh = mb - 1 - Math.floor(Math.log2(M)), m = Math.round(M * 2 ** sh);
  if (m >= 2 ** mb) { m = Math.round(m / 2); sh--; }
  if (sh < 1) { m = Math.round(M * 2); sh = 1; }
  return { m, sh };
}
const one = BigInt(1), zero = BigInt(0);
/** acc · m / 2^sh, rounded to the nearest (halves up): the same in C. */
export function requantB(acc: bigint, m: number, sh: number): bigint {
  const t = acc * BigInt(m) + (one << BigInt(sh - 1)), d = one << BigInt(sh);
  let q = t / d;
  if (t % d !== zero && t < zero) q -= one;
  return q;
}
const log2 = (x: number) => Math.log2(Math.max(1, x));

/** The plan: centres and steps from the training rows, each unit's 8-bit numbers and multipliers, the shared scale. */
export function planInt(s: EcocSpec | BayesSpec | DiscrSpec, rows: number[][]): IntPlan {
  const P = s.kind === 'bayes' ? s.mu[0].length : s.kind === 'discr' ? s.w[0].length : s.inputs;
  if (P > 256) throw new Error('Up to 256 inputs here.');
  const lo = Array.from({ length: P }, (_, j) => Math.min(...rows.map((r) => r[j]))), hi = Array.from({ length: P }, (_, j) => Math.max(...rows.map((r) => r[j])));
  const centre = lo.map((l, j) => (l + hi[j]) / 2), step = lo.map((l, j) => (hi[j] - l) / 254 || 1);
  const xq = (x: number[]) => x.map((v, j) => clamp8(Math.floor((v - centre[j]) / step[j] + 0.5)));
  const cq = (v: number, j: number) => clamp8(Math.round((v - centre[j]) / step[j]));
  // The units in real numbers first (their value as a function of the 8-bit inputs), then on the shared scale.
  type Real = { make: (S: number) => IntUnit; f: (q: number[]) => number };
  const reals: Real[] = [];
  const distBits = 2 * log2(254 * 127) + log2(P);
  const linear = (w: number[], b: number): Real => {
    const W = quantizeLayer(w), f = (q: number[]) => b + W.scale * q.reduce((a, x, j) => a + W.q[j] * x, 0);
    return { f, make: (S) => ({ kind: 'lin', w: W.q, ...multiplier(W.scale / S, log2(127 * 127 * P) + 1), b: Math.round(b / S) }) };
  };
  if (s.kind === 'discr') s.w.forEach((w, k) => reals.push(linear(w.map((x, j) => x * step[j]), s.c[k] + w.reduce((a, x, j) => a + x * centre[j], 0))));
  else if (s.kind === 'bayes') s.mu.forEach((mu, k) => {
    const c = Int8Array.from(mu, cq), R: Q = quantizePositive(s.sd[k].map((d, j) => step[j] / d));
    // log prior − Σ log spread, from the spreads as the chip holds them (step / (r · scale)).
    const base = Math.log(s.prior[k]) - Array.from(R.q).reduce((a, r, j) => a + Math.log(step[j] / (r * R.scale)), 0), half = 0.5 * R.scale * R.scale;
    reals.push({ f: (q) => base - half * q.reduce((a, x, j) => a + ((x - c[j]) * R.q[j]) ** 2, 0), make: (S) => ({ kind: 'dist', c, r: R.q, ...multiplier(half / S, distBits), b: Math.round(base / S) }) });
  });
  else for (const l of s.learners) {
    const mu = l.mu ?? Array(P).fill(0), sg = l.sigma ?? Array(P).fill(1), S2 = s.scale * s.scale, n = l.sv.length;
    const C = quantizeLayer(l.coef);
    if (s.kernel === 'linear') {
      const W = mu.map((_, j) => l.sv.reduce((a, sv, q) => a + l.coef[q] * sv[j], 0) / S2);
      reals.push(linear(W.map((w, j) => (w * step[j]) / sg[j]), l.bias + W.reduce((a, w, j) => a + (w * (centre[j] - mu[j])) / sg[j], 0)));
    } else if (s.kernel === 'rbf') {
      const c = Int8Array.from(l.sv.flatMap((sv) => sv.map((v, j) => cq(v * sg[j] + mu[j], j)))), R = quantizePositive(sg.map((d, j) => step[j] / (d * s.scale)));
      const kq = (q: number[], i: number) => { const d = q.reduce((a, x, j) => a + ((c[i * P + j] - x) * R.q[j]) ** 2, 0), t = Math.round(d * R.scale * R.scale * TSTEP); return t < TLEN ? EXPQ[t] : 0; };
      reals.push({ f: (q) => l.bias + (C.scale / 32767) * Array.from(C.q).reduce((a, cf, i) => a + cf * kq(q, i), 0), make: (S) => ({ kind: 'rbf', c, r: R.q, coef: C.q, ...renamed(multiplier(R.scale * R.scale * TSTEP, distBits)), ...multiplier(C.scale / (32767 * S), log2(127 * 32767 * n)), b: Math.round(l.bias / S) }) });
    } else {
      // sv · z / S² = a + Σ u · xq for each support vector
      const U = quantizeLayer(l.sv.flatMap((sv) => sv.map((v, j) => (v * step[j]) / (sg[j] * S2)))), a = l.sv.map((sv) => sv.reduce((t, v, j) => t + (v * (centre[j] - mu[j])) / (sg[j] * S2), 0));
      const vOf = (q: number[], i: number) => 1 + a[i] + U.scale * q.reduce((t, x, j) => t + U.q[i * P + j] * x, 0);
      const vmax = Math.max(1, 2 * Math.max(...rows.flatMap((x) => a.map((_, i) => Math.abs(vOf(xq(x), i))))));
      if (s.order > 6 || 16 + s.order * log2(vmax) + 20 + log2(vmax) > 62) throw new Error('This polynomial kernel grows too large for whole numbers: use \'int8\'.');
      const accBits = log2(127 * n) + 16 + s.order * log2(vmax);
      reals.push({ f: (q) => l.bias + C.scale * Array.from(C.q).reduce((t, cf, i) => t + cf * Math.max(-vmax, Math.min(vmax, vOf(q, i))) ** s.order, 0), make: (S) => ({ kind: 'poly', u: U.q, a, vmax, coef: C.q, ...renamed(multiplier(U.scale * 2 ** 16, log2(127 * 127 * P) + 1)), ...multiplier(C.scale / (2 ** 16 * S), accBits), b: Math.round(l.bias / S) }) });
    }
  }
  // The shared scale: the largest unit value on the training rows, twice over, as 2^24.
  const big = Math.max(1e-9, ...rows.flatMap((x) => reals.map((r) => Math.abs(r.f(xq(x))))), ...(s.kind === 'ecoc' ? [1] : []));
  const S = (2 * big) / 2 ** 24;
  return { model: s.kind, P, classes: s.classes, centre, step, S, units: reals.map((r) => r.make(S)), code: s.kind === 'ecoc' ? s.code : null, one: Math.round(1 / S), order: s.kind === 'ecoc' ? s.order : 0 };
}
const renamed = (x: { m: number; sh: number }) => ({ mt: x.m, sht: x.sh });

/** The 8-bit inputs for a row (the C's name_predict does the same in float). */
export const intInput = (p: IntPlan, x: number[]) => x.map((v, j) => clamp8(Math.floor((v - p.centre[j]) / p.step[j] + 0.5)));
/** The integer core, exactly as the C runs it: each unit's F, then the class (ECOC: the hinge sums and their counts). */
export function runInt(p: IntPlan, xq: number[]): { cls: number; F: bigint[]; sums: bigint[]; n: number[] } {
  const P = p.P, B = (x: number) => BigInt(x);
  const F = p.units.map((u) => {
    if (u.kind === 'lin') return B(u.b) + requantB(B(xq.reduce((a, x, j) => a + u.w[j] * x, 0)), u.m, u.sh);
    const dist = (c: Int8Array, r: Int8Array, i: number) => { let d = zero; for (let j = 0; j < P; j++) { const e = B((c[i * P + j] - xq[j]) * r[j]); d += e * e; } return d; };
    if (u.kind === 'dist') return B(u.b) - requantB(dist(u.c, u.r, 0), u.m, u.sh);
    let acc = zero;
    for (let i = 0; i < u.coef.length; i++) {
      if (u.kind === 'rbf') { const t = requantB(dist(u.c, u.r, i), u.mt, u.sht); acc += B(u.coef[i]) * B(t < B(TLEN) ? EXPQ[Number(t)] : 0); continue; }
      const lim = B(Math.round(u.vmax * 2 ** 16));
      let v = B(Math.round((1 + u.a[i]) * 2 ** 16)) + requantB(B(xq.reduce((a, x, j) => a + u.u[i * P + j] * x, 0)), u.mt, u.sht);
      if (v > lim) v = lim;
      if (v < -lim) v = -lim;
      let R = one << BigInt(16);
      for (let k = 0; k < p.order; k++) R = requantB(R * v, 1, 16);
      acc += B(u.coef[i]) * R;
    }
    return B(u.b) + requantB(acc, u.m, u.sh);
  });
  if (!p.code) { let top = 0; F.forEach((f, k) => { if (f > F[top]) top = k; }); return { cls: top, F, sums: F, n: F.map(() => 1) }; }
  const ONE = B(p.one), sums: bigint[] = [], n: number[] = [];
  for (const row of p.code) { let s = zero, c = 0; row.forEach((cv, l) => { if (cv) { const h = ONE - B(cv) * F[l]; if (h > zero) s += h; c++; } }); sums.push(s); n.push(c || 1); }
  let top = 0;
  for (let k = 1; k < sums.length; k++) if (sums[k] * B(n[top]) < sums[top] * B(n[k])) top = k;
  return { cls: top, F, sums, n };
}
/** Bytes the chip keeps: the 8-bit numbers, a few 32-bit numbers per unit, the table, the centres and steps. */
export function intBytes(p: IntPlan): number {
  const per = p.units.reduce((t, u) => t + 12 + (u.kind === 'lin' ? u.w.length : u.kind === 'dist' ? 2 * u.c.length : u.kind === 'rbf' ? u.c.length + u.r.length + u.coef.length + 8 : u.u.length + u.coef.length + 8 * u.a.length + 8), 0);
  return per + 8 * p.P + (p.units.some((u) => u.kind === 'rbf') ? 2 * TLEN : 0) + (p.code ? p.code.length * p.code[0].length : 0);
}
const L64 = (v: number | bigint) => `INT64_C(${v})`;
export function intModelC(p: IntPlan, name: string): { c: string; h: string } {
  const P = p.P, K = p.classes.length, U = p.units.length, arrays: string[] = [], core: string[] = [];
  arrays.push(`static const float CENTRE[${P}] = { ${p.centre.map((x) => num(x, 'single')).join(', ')} };`, `static const float STEP[${P}] = { ${p.step.map((x) => num(x, 'single')).join(', ')} };`);
  if (p.units.some((u) => u.kind === 'rbf')) arrays.push(`/* e^(-i/${TSTEP}) in 15 bits */\nstatic const int16_t EXPQ[${TLEN}] = {\n${list(EXPQ, String, 16)}\n};`);
  p.units.forEach((u, k) => {
    const A = (n: string, xs: ArrayLike<number>) => arrays.push(`static const int8_t U${k}_${n}[${xs.length}] = {\n${list(xs, String, 16)}\n};`);
    if (u.kind === 'lin') A('W', u.w);
    else if (u.kind === 'dist' || u.kind === 'rbf') { A('C', u.c); A('R', u.r); }
    if (u.kind === 'poly') { A('U', u.u); arrays.push(`static const int64_t U${k}_A[${u.a.length}] = { ${u.a.map((a) => L64(Math.round((1 + a) * 2 ** 16))).join(', ')} };`); }
    if (u.kind === 'rbf' || u.kind === 'poly') A('COEF', u.coef);
    core.push(`  /* unit ${k}: ${u.kind === 'lin' ? 'linear' : u.kind === 'dist' ? 'a bell curve per input' : u.kind === 'rbf' ? 'support vectors, Gaussian kernel' : 'support vectors, polynomial kernel'} */`, '  {');
    if (u.kind === 'lin') core.push('    int32_t acc = 0;', `    for (int j = 0; j < ${P}; j++) acc += (int32_t)U${k}_W[j] * xq[j];`, `    F[${k}] = ${L64(u.b)} + requant(acc, ${u.m}, ${u.sh});`);
    else if (u.kind === 'dist') core.push('    int64_t d = 0;', `    for (int j = 0; j < ${P}; j++) { int32_t e = ((int32_t)U${k}_C[j] - xq[j]) * U${k}_R[j]; d += (int64_t)e * e; }`, `    F[${k}] = ${L64(u.b)} - requant(d, ${u.m}, ${u.sh});`);
    else {
      core.push('    int64_t acc = 0;', `    for (int i = 0; i < ${u.coef.length}; i++) {`);
      if (u.kind === 'rbf') core.push('      int64_t d = 0, t;', `      for (int j = 0; j < ${P}; j++) { int32_t e = ((int32_t)U${k}_C[i * ${P} + j] - xq[j]) * U${k}_R[j]; d += (int64_t)e * e; }`, `      t = requant(d, ${u.mt}, ${u.sht});`, `      if (t < ${TLEN}) acc += (int64_t)U${k}_COEF[i] * EXPQ[t];`);
      else {
        const lim = Math.round(u.vmax * 2 ** 16);
        core.push('      int32_t s = 0;', `      int64_t v, r = (int64_t)1 << 16;`, `      for (int j = 0; j < ${P}; j++) s += (int32_t)U${k}_U[i * ${P} + j] * xq[j];`, `      v = U${k}_A[i] + requant(s, ${u.mt}, ${u.sht});`, `      if (v > ${L64(lim)}) v = ${L64(lim)};`, `      if (v < -${L64(lim)}) v = -${L64(lim)};`, `      for (int o = 0; o < ${p.order}; o++) r = requant(r * v, 1, 16);`, `      acc += (int64_t)U${k}_COEF[i] * r;`);
      }
      core.push('    }', `    F[${k}] = ${L64(u.b)} + requant(acc, ${u.m}, ${u.sh});`);
    }
    core.push('  }');
  });
  if (p.code) {
    arrays.push(`static const int8_t CODE[${K * U}] = {\n${list(p.code.flat(), String, 16)}\n};`);
    core.push('  /* hinge-loss decoding in whole numbers: each class\'s sum over the learners that know it, compared by its count */', `  for (int k = 0; k < ${K}; k++) {`, '    sums[k] = 0; n[k] = 0;',
      `    for (int l = 0; l < ${U}; l++) { int c = CODE[k * ${U} + l]; if (c) { int64_t h = ${L64(p.one)} - c * F[l]; if (h > 0) sums[k] += h; n[k]++; } }`, '    if (!n[k]) n[k] = 1;', '  }',
      '  int top = 0;', `  for (int k = 1; k < ${K}; k++) if (sums[k] * n[top] < sums[top] * n[k]) top = k;`, '  return top;');
  } else core.push(`  for (int k = 0; k < ${K}; k++) { sums[k] = F[k]; n[k] = 1; }`, '  int top = 0;', `  for (int k = 1; k < ${K}; k++) if (F[k] > F[top]) top = k;`, '  return top;');
  const helpers = ['/* acc · m / 2^sh, rounded to the nearest (halves up), with whole numbers only */', 'static int64_t requant(int64_t acc, int64_t m, int sh) {', '  int64_t t = acc * m + ((int64_t)1 << (sh - 1)), d = (int64_t)1 << sh, q = t / d;', '  if (t % d != 0 && t < 0) q -= 1;', '  return q;', '}'];
  const coreFn = [`/* The integer core: 8-bit inputs in, the class out; sums[k] (and n[k]) are each class's whole-number score${p.code ? ' (the hinge sum: smaller is better, over n[k] learners)' : ''}. */`, `int ${name}_predict_q(const int8_t xq[${P}], int64_t sums[${K}], int n[${K}]) {`, `  int64_t F[${U}];`, ...core, '}'];
  const S = num(p.S, 'single');
  const wrap = [`int ${name}_predict(const float x[${P}], float scores[${K}]) {`, `  int8_t xq[${P}];`, `  int64_t sums[${K}];`, `  int n[${K}], top;`,
    `  for (int j = 0; j < ${P}; j++) { float q = floorf((x[j] - CENTRE[j]) / STEP[j] + 0.5f); xq[j] = (int8_t)(q < -127 ? -127 : q > 127 ? 127 : q); }`,
    `  top = ${name}_predict_q(xq, sums, n);`,
    ...(p.code
      ? ['  /* the scores, if asked: minus each class\'s average hinge loss */', `  if (scores) for (int k = 0; k < ${K}; k++) scores[k] = -(float)sums[k] / n[k] * ${S} / 2;`]
      : ['  /* the chances of each class (softmax), if asked */', '  if (scores) {', '    float sum = 0;', `    for (int k = 0; k < ${K}; k++) { scores[k] = expf((float)(sums[k] - sums[top]) * ${S}); sum += scores[k]; }`, `    for (int k = 0; k < ${K}; k++) scores[k] /= sum;`, '  }']),
    '  return top;', '}'];
  const kind = p.model === 'ecoc' ? `${U} support vector machines for ${K} classes` : p.model === 'bayes' ? 'naive Bayes' : 'a linear discriminant';
  const protos = `int ${name}_predict_q(const int8_t xq[${P}], int64_t sums[${K}], int n[${K}]);\nint ${name}_predict(const float x[${P}], float scores[${K}]);`;
  return { c: [...head(name, `${kind}, wholly in whole numbers: 8-bit numbers and inputs, 32- and 64-bit sums`), classNote(p.classes) + arrays.join('\n'), '', ...helpers, '', ...coreFn, '', '/* From the sensor\'s numbers: each input made 8-bit (the only floating point, with the scores), then the integer core. */', ...wrap, ''].join('\n'), h: header(name, protos, classNote(p.classes)) };
}
