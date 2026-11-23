// Trains Relief's own AI (M420) from nothing and writes src/lib/relief-model.gen.ts. No outside service:
// it runs on this computer in a few seconds. From apps/web:
//
//   npx tsx scripts/ai/train-relief.mts                     the made-up examples only
//   npx tsx scripts/ai/train-relief.mts --extra real.tsv    plus real ones: URGENCY<tab>KIND<tab>text per line
//
// (A real.tsv exported from the live site holds people's words: keep it on your computer, never commit it.)
// It prints how often the model is right on examples it never saw while learning.
import { readFileSync, writeFileSync } from 'node:fs';
import { ALONE, CUES, NEEDS, REAL_LIKE, WHO, type K, type U } from './relief-examples';
import { COLUMNS, features, totals } from '../../src/lib/relief-model';

const BUCKETS = 2048;
const UR: U[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const KINDS: K[] = ['FOOD', 'WATER', 'SHELTER', 'MEDICAL', 'TRANSPORT', 'CLOTHES', 'OTHER'];
type Ex = [U, K, string];

// A fixed random sequence, so every run learns the same model.
let seed = 20261121;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];

/** A typo or two, lower case, no punctuation: how messages really arrive. */
function rough(s: string) {
  let t = rand() < 0.5 ? s.toLowerCase() : s;
  if (rand() < 0.4) t = t.replace(/[.,!?:]/g, '');
  if (rand() < 0.3) {
    const i = 1 + Math.floor(rand() * Math.max(1, t.length - 2));
    t = rand() < 0.5 ? t.slice(0, i) + t.slice(i + 1) : t.slice(0, i - 1) + t[i] + t[i - 1] + t.slice(i + 1);
  }
  return t;
}

function built(n: number): Ex[] {
  const out: Ex[] = [];
  for (let i = 0; i < n; i++) {
    if (rand() < 0.12) { const [kind, said] = pick(ALONE); out.push(['CRITICAL', kind, rough([pick(['', 'SOS', 'help', 'emergency', 'pls help', 'madad']), pick(WHO).replace('#', '3'), said].filter(Boolean).join(' '))]); continue; }
    const [base, kind, need] = pick(NEEDS);
    const cue = rand() < 0.45 ? null : pick(CUES);
    const who = pick(WHO).replace('#', String(2 + Math.floor(rand() * 9)));
    let u = base;
    if (cue?.[0] === 'CRITICAL') u = 'CRITICAL';
    else if (cue?.[0] === 'HIGH') u = 'HIGH';
    else if (cue?.[0] === 'LOW') u = base === 'HIGH' ? 'MEDIUM' : 'LOW';
    const parts = cue && rand() < 0.4 ? [cue[1], who, need] : [who, need, cue?.[1] ?? ''];
    out.push([u, kind, rough(parts.filter(Boolean).join(rand() < 0.5 ? ' ' : ', '))]);
  }
  return out;
}

const arg = process.argv.indexOf('--extra');
const extra: Ex[] = arg > 0 ? readFileSync(process.argv[arg + 1], 'utf8').split('\n').map((l) => l.split('\t')).filter((p) => p.length >= 3 && UR.includes(p[0] as U) && KINDS.includes(p[1] as K)).map((p) => [p[0] as U, p[1] as K, p.slice(2).join(' ')]) : [];

// Every third real-like message is kept aside: the honest test.
const test = REAL_LIKE.filter((_, i) => i % 3 === 0);
const train = [...REAL_LIKE.filter((_, i) => i % 3 !== 0), ...REAL_LIKE.filter((_, i) => i % 3 !== 0), ...built(9000), ...extra, ...extra];

// The model: one weight per bucket and answer, plus a bias per answer. Learned with AdaGrad on cross-entropy
// (the four urgencies and the seven kinds are two separate choices), with a little weight decay.
const n = COLUMNS.length;
const w = new Float32Array(BUCKETS * n), g2 = new Float32Array(BUCKETS * n).fill(1e-8);
const bias = new Array<number>(n).fill(0), b2 = new Array<number>(n).fill(1e-8);
const softmax = (t: number[]) => { const m = Math.max(...t); const e = t.map((x) => Math.exp(x - m)); const s = e.reduce((a, b) => a + b, 0); return e.map((x) => x / s); };

const LR = 0.5, DECAY = 1e-5;
for (let epoch = 0; epoch < 12; epoch++) {
  for (let i = train.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [train[i], train[j]] = [train[j], train[i]]; }
  for (const [u, k, text] of train) {
    const f = features(text, BUCKETS);
    const norm = 1 / Math.sqrt(Math.max(1, f.length));
    const t = COLUMNS.map((_, c) => bias[c] + f.reduce((s, b) => s + w[b * n + c], 0) * norm);
    const p = [...softmax(t.slice(0, 4)), ...softmax(t.slice(4))];
    const y = COLUMNS.map((col) => (col === u || col === k ? 1 : 0));
    for (let c = 0; c < n; c++) {
      const g = p[c] - y[c];
      b2[c] += g * g; bias[c] -= (LR / Math.sqrt(b2[c])) * g;
      for (const b of f) { const at = b * n + c; const gw = g * norm + DECAY * w[at]; g2[at] += gw * gw; w[at] -= (LR / Math.sqrt(g2[at])) * gw; }
    }
  }
}

// Store each weight in one byte: a column's weights share one scale (its biggest weight is 127).
const scale = COLUMNS.map((_, c) => { let m = 0; for (let b = 0; b < BUCKETS; b++) m = Math.max(m, Math.abs(w[b * n + c])); return m / 127 || 1; });
const q = Int8Array.from(w, (v, i) => Math.round(v / scale[i % n]));

// How often it is right (with the one-byte weights, exactly as the app will run it).
const right = (set: Ex[]) => {
  let uOk = 0, kOk = 0;
  for (const [u, k, text] of set) {
    const t = totals(text, { w: q, scale, bias, buckets: BUCKETS });
    const ui = t.slice(0, 4).indexOf(Math.max(...t.slice(0, 4))), ki = t.slice(4).indexOf(Math.max(...t.slice(4)));
    if (UR[ui] === u) uOk++; if (KINDS[ki] === k) kOk++;
  }
  return `urgency ${Math.round((100 * uOk) / set.length)}%, kind ${Math.round((100 * kOk) / set.length)}% of ${set.length}`;
};
const r = (x: number) => Math.round(x * 1e5) / 1e5;
writeFileSync(new URL('../../src/lib/relief-model.gen.ts', import.meta.url), `// Written by scripts/ai/train-relief.mts. Don't edit.
export const BUCKETS = ${BUCKETS};
export const SCALE: number[] = ${JSON.stringify(scale.map(r))};
export const BIAS: number[] = ${JSON.stringify(bias.map(r))};
export const WEIGHTS = '${Buffer.from(q.buffer).toString('base64')}';
`);
console.log(`Trained on ${train.length} examples (${extra.length} real). Unseen messages: ${right(test)}. Seen: ${right(train.slice(0, 2000))}.`);
