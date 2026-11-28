import { chartOf, compile, KINDS, MAX_STEPS, n, type Block, type Diagram, type Req } from './blocks';
import type { Expr } from './chart';
import { safeNames } from './blockir';

// Hyperion Simulate → Blocks → Verify (M566, the owner's picture: "author, import, and manage requirements … maintain
// traceability across designs, tests, and generated code … automatically generate test cases for model coverage …
// check model and code compliance … find bugs and prove the absence of critical run-time errors … produce reports
// and artifacts necessary to certify to industry standards"). Hyperion's version, all in the browser:
//
// - requirements on signals (stays in a range, settles, reaches a level in time, overshoots at most so much), checked
//   on the model as it is and on every generated test;
// - coverage of the model's decisions: each saturation below / inside / above, each Board output's range, each chart
//   state entered, transition fired and transition condition found both false and true;
// - tests made automatically: the sources' settings changed (seeded, so the same every time) and a change kept when
//   it reaches a decision no test had;
// - model checks, in the spirit of a model advisor: what's unwired, unreachable or shadowed, a time step too big for
//   the dynamics or for the generated code's Euler steps, run-time errors the generated code could meet (dividing by a
//   signal, a square root of a negative), and fixed-point overflow from the ranges every test saw;
// - a report tying requirements to blocks, tests and the names in the generated code.

export interface Outcome { id: string; label: string; block: string }
export interface Run { watched: Record<string, number[]>; t: number[]; hit: Set<string>; ranges: Record<string, [number, number]>; error?: string }
export interface ReqResult { req: Req; pass: boolean; detail: string; at?: number }
export interface Test { name: string; changes: { block: string; key: string; value: number }[]; hit: string[] }
export interface Check { level: 'error' | 'warning' | 'note'; block?: string; text: string }

const sig = (s: string) => { const [id, o] = s.split('#'); return { id, out: Number(o) || 0 }; };

/** Every decision the model has, as outcomes to reach. */
export function outcomes(dg: Diagram): Outcome[] {
  const out: Outcome[] = [];
  for (const b of dg.blocks) {
    if (b.kind === 'saturation' || b.kind === 'boardOut') for (const [k, l] of [['below', 'below its range'], ['inside', 'inside its range'], ['above', 'above its range']]) out.push({ id: `${b.id}:${k}`, label: `input ${l}`, block: b.id });
    if (b.kind === 'chart') {
      let ch; try { ch = chartOf(b); } catch { continue; }
      ch.states.forEach((st) => out.push({ id: `${b.id}:state:${st.name}`, label: `state ${st.name} entered`, block: b.id }));
      ch.trans.forEach((tr, i) => {
        const nm = `${ch.states[tr.from].name} → ${ch.states[tr.to].name}`;
        out.push({ id: `${b.id}:fire:${i}`, label: `${nm} fired`, block: b.id }, { id: `${b.id}:false:${i}`, label: `${nm}: condition false`, block: b.id }, { id: `${b.id}:true:${i}`, label: `${nm}: condition true`, block: b.id });
      });
    }
  }
  return out;
}

/** One run with the decisions it reached, the watched signals, and every signal's lowest and highest value. */
export function run(dg: Diagram, watch: string[] = []): Run {
  const hit = new Set<string>(), watched: Record<string, number[]> = Object.fromEntries(watch.map((w) => [w, []])), ranges: Record<string, [number, number]> = {}, t: number[] = [];
  let m: ReturnType<typeof compile>;
  try { m = compile(dg); } catch (e) { return { watched, t, hit, ranges, error: (e as Error).message }; }
  const x = Float64Array.from(m.x0), h = Math.max(1e-6, dg.dt), steps = Math.min(MAX_STEPS, Math.ceil(dg.stop / h - 1e-9)), every = Math.max(1, Math.floor(steps / 2000));
  const sats = m.blocks.filter((b) => b.kind === 'saturation' || b.kind === 'boardOut');
  const value = (s: string) => { const { id, out } = sig(s); return out ? (m.yo.get(id)?.[out] ?? 0) : (m.y.get(id) ?? 0); };
  const observe = (tt: number, keep: boolean) => {
    m.outputs(tt, x);
    for (const b of sats) {
      const u = m.input(b, 0), lo = b.kind === 'saturation' ? n(b.p.lower, -1) : n(b.p.lo), hi = b.kind === 'saturation' ? n(b.p.upper, 1) : n(b.p.hi, 1);
      hit.add(`${b.id}:${u < lo ? 'below' : u > hi ? 'above' : 'inside'}`);
    }
    for (const [id, v] of m.y) { const r = ranges[id]; if (!r) ranges[id] = [v, v]; else { if (v < r[0]) r[0] = v; if (v > r[1]) r[1] = v; } }
    if (keep) { t.push(tt); for (const w of watch) watched[w].push(value(w)); }
  };
  m.update(0, x);
  for (let k = 0; k < steps; k++) {
    observe(k * h, k % every === 0);
    m.step(k * h, x, h);
    m.update((k + 1) * h, x);
    if (!x.every(Number.isFinite)) return { watched, t, hit, ranges, error: `The model blew up at t = ${+(k * h).toPrecision(3)} s.` };
  }
  observe(steps * h, true);
  for (const [id, c] of m.charts) {
    c.ch.states.forEach((st, i) => { if (c.run.visits[i]) hit.add(`${id}:state:${st.name}`); });
    c.ch.trans.forEach((_, i) => { if (c.run.fired[i]) hit.add(`${id}:fire:${i}`); if (c.run.cond[i][0]) hit.add(`${id}:false:${i}`); if (c.run.cond[i][1]) hit.add(`${id}:true:${i}`); });
  }
  return { watched, t, hit, ranges };
}

/** Whether a run meets a requirement, and where it first doesn't. */
export function checkReq(req: Req, r: Run): ReqResult {
  const y = r.watched[req.signal], t = r.t;
  if (!y || !y.length) return { req, pass: false, detail: r.error ?? 'The signal wasn’t recorded.' };
  const idx = t.map((_, i) => i).filter((i) => t[i] >= req.from - 1e-9);
  const f = (v: number) => String(+v.toPrecision(4));
  switch (req.kind) {
    case 'range': {
      const bad = idx.find((i) => y[i] < req.a || y[i] > req.b);
      return bad === undefined ? { req, pass: true, detail: `stays between ${f(req.a)} and ${f(req.b)} from ${f(req.from)} s` } : { req, pass: false, detail: `is ${f(y[bad])} at ${f(t[bad])} s`, at: t[bad] };
    }
    case 'settle': {
      // Within ±b of a by time `from`, and stays.
      const bad = idx.find((i) => Math.abs(y[i] - req.a) > req.b);
      return bad === undefined ? { req, pass: true, detail: `within ${f(req.a)} ± ${f(req.b)} from ${f(req.from)} s on` } : { req, pass: false, detail: `${f(y[bad])} at ${f(t[bad])} s, outside ${f(req.a)} ± ${f(req.b)}`, at: t[bad] };
    }
    case 'reach': {
      // Reaches a by time `from` (b unused).
      const i = t.findIndex((_, k) => (req.a >= y[0] ? y[k] >= req.a : y[k] <= req.a));
      return i >= 0 && t[i] <= req.from + 1e-9 ? { req, pass: true, detail: `reaches ${f(req.a)} at ${f(t[i])} s` } : { req, pass: false, detail: i >= 0 ? `reaches ${f(req.a)} only at ${f(t[i])} s` : `never reaches ${f(req.a)}`, at: i >= 0 ? t[i] : undefined };
    }
    case 'overshoot': {
      // After `from`, the peak above the final value is at most a % of the step from the value at `from`.
      if (!idx.length) return { req, pass: false, detail: 'nothing after that time' };
      const start = y[idx[0]], fin = y[y.length - 1], dir = Math.sign(fin - start) || 1, span = Math.abs(fin - start) || 1;
      const peak = Math.max(...idx.map((i) => dir * (y[i] - fin))), pct = (Math.max(0, peak) / span) * 100;
      return pct <= req.a + 1e-9 ? { req, pass: true, detail: `overshoots ${f(pct)} %` } : { req, pass: false, detail: `overshoots ${f(pct)} %, more than ${f(req.a)} %` };
    }
  }
}

/** The settings tests may change: each source's numbers (and a Board input's test value). */
const KNOBS: Partial<Record<Block['kind'], string[]>> = { step: ['before', 'after', 'time'], constant: ['value'], pulse: ['amplitude', 'period', 'width'], ramp: ['slope', 'start'], sine: ['amplitude', 'frequency'], boardIn: ['test'] };
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
export const withChanges = (dg: Diagram, changes: Test['changes']): Diagram => ({ ...dg, blocks: dg.blocks.map((b) => { const c = changes.filter((x) => x.block === b.id); return c.length ? { ...b, p: { ...b.p, ...Object.fromEntries(c.map((x) => [x.key, x.value])) } } : b; }) });

/** Tests that reach the model's decisions: the model as it is, then changes kept when they reach something new. */
export function generateTests(dg: Diagram, budget = 60, seed = 7): { tests: Test[]; all: Outcome[]; hit: Set<string>; runs: number } {
  const all = outcomes(dg), hit = new Set<string>(), tests: Test[] = [], rand = rng(seed);
  const first = run(dg);
  first.hit.forEach((h) => hit.add(h));
  tests.push({ name: 'The model as it is', changes: [], hit: [...first.hit] });
  const knobs = dg.blocks.flatMap((b) => (KNOBS[b.kind] ?? []).map((key) => ({ b, key })));
  let runs = 1;
  if (!knobs.length || !all.length) return { tests, all, hit, runs };
  const factors = [-2, -1, -0.5, 0, 0.25, 0.5, 2, 4, 10];
  while (runs < budget && all.some((o) => !hit.has(o.id))) {
    const count = 1 + Math.floor(rand() * Math.min(3, knobs.length)), changes: Test['changes'] = [];
    for (let i = 0; i < count; i++) {
      const { b, key } = knobs[Math.floor(rand() * knobs.length)], v = n(b.p[key]);
      let value = rand() < 0.7 ? v * factors[Math.floor(rand() * factors.length)] : (rand() * 2 - 1) * (Math.abs(v) * 3 + 2);
      if (key === 'time' || key === 'start') value = rand() * dg.stop;
      if (key === 'period' || key === 'frequency') value = Math.max(1e-3, Math.abs(value) || v);
      if (key === 'width') value = Math.round(rand() * 100);
      changes.push({ block: b.id, key, value: +value.toPrecision(4) });
    }
    const r = run(withChanges(dg, changes));
    runs++;
    const fresh = [...r.hit].filter((h) => !hit.has(h));
    if (!r.error && fresh.length) { fresh.forEach((h) => hit.add(h)); tests.push({ name: `Test ${tests.length}`, changes, hit: [...r.hit] }); }
  }
  return { tests, all, hit, runs };
}

const divides = (e: Expr): boolean => (e.k === 'bin' ? (e.op === '/' && e.b.k !== 'num') || divides(e.a) || divides(e.b) : e.k === 'un' ? divides(e.a) : e.k === 'call' ? (e.fn === 'sqrt' && e.args[0].k !== 'num') || e.args.some(divides) : false);

/** Model checks: what's unwired, unreachable or shadowed, a step too big, run-time errors the code could meet, overflow. */
export function modelChecks(dg: Diagram, ranges?: Record<string, [number, number]>): Check[] {
  const out: Check[] = [], names = safeNames(dg), used = new Set(dg.wires.map((w) => w.from));
  try { compile(dg); } catch (e) { out.push({ level: 'error', text: (e as Error).message }); }
  for (const b of dg.blocks) {
    const ins = KINDS[b.kind].ins(b.p);
    for (let i = 0; i < ins; i++) if (!dg.wires.some((w) => w.to === b.id && w.in === i)) out.push({ level: b.kind === 'scope' ? 'note' : 'warning', block: b.id, text: `${names.get(b.id)}: input ${i + 1} isn’t wired (it reads 0).` });
    if (KINDS[b.kind].outs(b.p) > 0 && !used.has(b.id)) out.push({ level: 'note', block: b.id, text: `${names.get(b.id)}: its output goes nowhere.` });
    if (b.kind === 'saturation' && n(b.p.lower, -1) > n(b.p.upper, 1)) out.push({ level: 'error', block: b.id, text: `${names.get(b.id)}: its lowest is above its highest.` });
    if (b.kind === 'pid' && n(b.p.Kd) && n(b.p.N, 100) * dg.dt > 1) out.push({ level: 'warning', block: b.id, text: `${names.get(b.id)}: N · time step = ${+(n(b.p.N, 100) * dg.dt).toPrecision(3)} > 1, so the derivative filter is unstable in generated code (forward Euler); make the step smaller or N lower.` });
    if (b.kind === 'tf') {
      const d = String(b.p.den).trim().split(/[\s,]+/).map(Number), lead = d.find((v) => v !== 0) ?? 1, last = d[d.length - 1] / lead;
      if (Math.abs(last) * dg.dt > 0.5) out.push({ level: 'warning', block: b.id, text: `${names.get(b.id)}: its poles are fast for this time step (generated code with Euler steps may ring or blow up).` });
    }
    if (b.kind === 'chart') {
      let ch; try { ch = chartOf(b); } catch (e) { out.push({ level: 'error', block: b.id, text: `${names.get(b.id)}: ${(e as Error).message}` }); continue; }
      ch.states.forEach((st, i) => { if (i > 0 && !ch.trans.some((tr) => tr.to === i && tr.from !== i)) out.push({ level: 'warning', block: b.id, text: `${names.get(b.id)}: state ${st.name} can never be reached (nothing leads to it).` }); });
      ch.trans.forEach((tr, i) => {
        const earlier = ch.trans.slice(0, i).find((o) => o.from === tr.from && o.cond.k === 'num' && o.cond.v !== 0 && o.after <= tr.after);
        if (earlier) out.push({ level: 'warning', block: b.id, text: `${names.get(b.id)}: ${ch.states[tr.from].name} → ${ch.states[tr.to].name} can never fire: an earlier transition from ${ch.states[tr.from].name} always fires first.` });
        if (divides(tr.cond) || tr.action.some((a) => divides(a.e))) out.push({ level: 'warning', block: b.id, text: `${names.get(b.id)}: line ${tr.line} divides by a signal or takes a square root of one: the generated code may divide by zero or take the root of a negative.` });
      });
      for (const st of ch.states) for (const a of [...st.entry, ...st.during, ...st.exit]) if (divides(a.e)) out.push({ level: 'warning', block: b.id, text: `${names.get(b.id)}: state ${st.name} divides by a signal or takes a square root of one (line ${st.line}).` });
    }
  }
  if (ranges) for (const [id, [lo, hi]] of Object.entries(ranges)) if (Math.max(Math.abs(lo), Math.abs(hi)) >= 32767) out.push({ level: 'warning', block: id, text: `${names.get(id)} reached ${+(Math.abs(lo) > Math.abs(hi) ? lo : hi).toPrecision(4)}: past ±32,767, it overflows the Verilog and VHDL fixed point.` });
  if (!out.length) out.push({ level: 'note', text: 'No problems found.' });
  return out;
}

/** Everything the Verify tab shows, in one go (run in a worker). */
export function verifyAll(dg: Diagram, budget = 60) {
  const reqs = dg.reqs ?? [], watch = [...new Set(reqs.map((r) => r.signal))];
  const gen = generateTests(dg, budget), nominal = run(dg, watch);
  const results = reqs.map((r) => checkReq(r, nominal));
  // Each requirement under every generated test too (the tests change the inputs, so a failure there is a finding).
  const perTest = gen.tests.slice(1).map((t) => { const r = run(withChanges(dg, t.changes), watch); return { test: t.name, results: reqs.map((q) => checkReq(q, r).pass), ranges: r.ranges }; });
  const ranges: Record<string, [number, number]> = { ...nominal.ranges };
  for (const p of perTest) for (const [id, [lo, hi]] of Object.entries(p.ranges)) { const r = ranges[id]; ranges[id] = r ? [Math.min(r[0], lo), Math.max(r[1], hi)] : [lo, hi]; }
  return { results, tests: gen.tests, all: gen.all, hit: [...gen.hit], runs: gen.runs, perTest: perTest.map(({ test, results: rs }) => ({ test, results: rs })), checks: modelChecks(dg, ranges), ranges, error: nominal.error };
}
export type Verified = ReturnType<typeof verifyAll>;
