import { LabError, parse, type Expr, type FnDef, type Stmt } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { Flow, Lab, parHook, textOf } from './interp';
import { cmat, imOf, mat, num, sizeOf, str, toMat, type Cell, type Fn, type Mat, type Value } from './values';

// Hyperion's parallel computing (M477): parfor, parfeval / fetchOutputs / fetchNext / wait, parpool, gcp.
// The engine runs a script straight through on one background thread, and browsers let a thread wait on another only
// on cross-origin-isolated sites (this one isn't). So a parfor written at a script's top level pauses the run: its
// iterations are split among a pool of other workers (each a whole engine), the results are merged back (arrays
// indexed by the loop variable, sums, products and concatenations), and the run carries on from the next statement,
// with the speed-up printed. A parfor inside a function or another loop runs in order (as MATLAB does without a pool).
// parfeval sends a call to the pool at once; the first fetchOutputs / fetchNext / wait that finds it unfinished pauses
// the run until the pool has answered, then that top-level statement runs again (so put fetches in their own loop).

/** What the engine's worker gives this module: a pool of engines. */
export interface Pool { size: number; run(task: Task): Promise<TaskResult> }
export type Task =
  | { kind: 'parfor'; vars: [string, Value][]; fns: [string, FnDef][]; body: Stmt[]; loopVar: string; items: Value[]; reductions: Reduction[] }
  | { kind: 'call'; vars: [string, Value][]; fns: [string, FnDef][]; fn: Value; args: Value[]; nout: number };
export interface TaskResult { vars?: [string, Value][]; outs?: Value[]; error?: string; out: string; ms: number }
interface Reduction { name: string; op: string; identity: Value }

export const parallel: { pool: Pool | null; wanted: number } = { pool: null, wanted: 0 };
const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };

/** A pause: the run waits for `wait`, then goes on from the next top-level statement, or runs this one again. */
class Pause extends Flow {
  constructor(readonly wait: () => Promise<void>, readonly rerun: boolean) { super('pause'); }
}
const topLevel = new WeakSet<Stmt>();
/** M478: stops the run until `wait` is done, then runs this top-level statement again (gather on the GPU). */
export const pauseFor = (wait: () => Promise<void>) => new Pause(wait, true);

// ——— What a parfor body does to each variable ———
const rootOf = (e: Expr): string | null => (e.k === 'id' ? e.name : e.k === 'index' ? rootOf(e.of) : (e as { k: string; of?: Expr }).k === 'field' ? rootOf((e as unknown as { of: Expr }).of) : null);
/** Variables the body assigns: indexed (merged element by element), reductions (x = x + …), or temporaries. */
export function classify(body: Stmt[], loopVar: string): { sliced: Set<string>; reductions: Reduction[]; temps: Set<string> } {
  const sliced = new Set<string>(), temps = new Set<string>(), red = new Map<string, string>();
  const walk = (list: Stmt[]) => {
    for (const st of list) {
      const s = st as Stmt & { to?: Expr[]; e?: Expr; op?: string; body?: Stmt[]; arms?: { body: Stmt[] }[]; other?: Stmt[]; handler?: Stmt[]; cases?: { body: Stmt[] }[] };
      if (st.s === 'assign' && s.to) {
        for (const t of s.to) {
          const n = rootOf(t);
          if (!n || n === '~' || n === loopVar) continue;
          if (t.k !== 'id') { sliced.add(n); continue; }
          const op = reductionOp(n, s.op ?? '=', s.e!);
          if (op) red.set(n, op); else temps.add(n);
        }
      }
      for (const b of [s.body, s.other, s.handler, ...(s.arms ?? []).map((a) => a.body), ...(s.cases ?? []).map((c) => c.body)]) if (Array.isArray(b)) walk(b);
    }
  };
  walk(body);
  for (const n of red.keys()) temps.delete(n);
  const identity = (op: string): Value => (op === '*' || op === '.*' ? num(1) : op === '&' ? { ...num(1), logical: true } : op === '|' ? { ...num(0), logical: true } : op === ',' || op === ';' ? mat(0, 0) : num(0));
  return { sliced, temps, reductions: [...red].map(([name, op]) => ({ name, op, identity: identity(op) })) };
}
function reductionOp(name: string, op: string, e: Expr): string | null {
  if (op !== '=') return ['+', '-', '*'].includes(op[0]) ? op[0] : null;
  const isName = (x: Expr) => x.k === 'id' && x.name === name;
  if (e.k === 'bin' && ['+', '*', '.*', '&', '|'].includes(e.op) && (isName(e.a) || isName(e.b))) return e.op;
  if (e.k === 'bin' && e.op === '-' && isName(e.a)) return '-';
  if (e.k === 'matrix' && !e.cell) {
    if (e.rows.length === 1 && e.rows[0].length > 1 && isName(e.rows[0][0])) return ',';
    if (e.rows.length > 1 && e.rows.every((r) => r.length === 1) && isName(e.rows[0][0])) return ';';
  }
  return null;
}

// ——— Merging the workers' results ———
const EMPTY = mat(0, 0);
const cellAt = (v: Value | undefined, i: number, j: number): Value | null => (v?.k === 'cell' && i < v.r && j < v.c ? v.d[i + j * v.r] : null);
const sameVal = (a: Value | null, b: Value | null) => a === b || (!!a && !!b && JSON.stringify(a, (_, x) => (x instanceof Float64Array ? [...x] : x instanceof Map ? [...x] : x)) === JSON.stringify(b, (_, x) => (x instanceof Float64Array ? [...x] : x instanceof Map ? [...x] : x)));
/** The original value with every element a worker changed written in (sizes grow to the largest). */
export function mergeSliced(v0: Value | undefined, parts: (Value | undefined)[]): Value | undefined {
  const all = [v0, ...parts].filter((x): x is Value => !!x);
  if (!all.length) return undefined;
  if (all.every((x) => x.k === 'mat')) {
    const ms = all as Mat[], R = Math.max(...ms.map((m) => m.r)), C = Math.max(...ms.map((m) => m.c));
    const re = new Float64Array(R * C), im = new Float64Array(R * C), base = v0 as Mat | undefined;
    const at = (m: Mat | undefined, i: number, j: number, part: 're' | 'im') => (m && i < m.r && j < m.c ? (part === 're' ? m.d[i + j * m.r] : imOf(m)[i + j * m.r]) : 0);
    for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) { re[i + j * R] = at(base, i, j, 're'); im[i + j * R] = at(base, i, j, 'im'); }
    for (const p of parts as (Mat | undefined)[]) {
      if (!p) continue;
      for (let j = 0; j < p.c; j++) for (let i = 0; i < p.r; i++) {
        const r = at(p, i, j, 're'), q = at(p, i, j, 'im');
        if (!Object.is(r, at(base, i, j, 're')) || q !== at(base, i, j, 'im')) { re[i + j * R] = r; im[i + j * R] = q; }
      }
    }
    const out = cmat(R, C, re, im), first = ms[0];
    if (first.logical && ms.every((m) => m.logical)) out.logical = true;
    if (first.cls) out.cls = first.cls;
    return out;
  }
  if (all.every((x) => x.k === 'cell')) {
    const cs = all as Cell[], R = Math.max(...cs.map((c) => c.r)), C = Math.max(...cs.map((c) => c.c));
    const d: Value[] = Array.from({ length: R * C }, (_, k) => cellAt(v0, k % R, Math.floor(k / R)) ?? mat(0, 0));
    for (const p of parts) for (let k = 0; k < R * C; k++) { const i = k % R, j = Math.floor(k / R), x = cellAt(p, i, j); if (x && !sameVal(x, cellAt(v0, i, j) ?? EMPTY)) d[k] = x; }
    return { k: 'cell', r: R, c: C, d };
  }
  // Structs and the rest: the last worker that changed it.
  return [...parts].reverse().find((p) => p && !sameVal(p, v0 ?? null)) ?? v0;
}
function combine(lab: Lab, op: string, a: Value, b: Value): Value {
  if (op === ',' || op === ';') return BUILTINS[op === ',' ? 'horzcat' : 'vertcat']([a, b], 1, lab)[0];
  return lab.binop(op === '-' ? '+' : op, a, b);
}

// ——— parfor ———
/** Iterations split into one even chunk per worker. */
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.min(n, xs.length) }, (_, k) => xs.slice(Math.floor((k * xs.length) / Math.min(n, xs.length)), Math.floor(((k + 1) * xs.length) / Math.min(n, xs.length))));
const shareable = (vars: Map<string, Value>) => [...vars].filter(([, v]) => v.k !== 'fn' || !v.name?.startsWith('@')) as [string, Value][];
parHook.parfor = (lab, st, vars) => {
  const pool = parallel.pool;
  if (!pool || pool.size < 2 || !topLevel.has(st) || st.v.k !== 'id') return false;
  const range = lab.ev(st.e, { vars, nargin: 0, nargout: 0, depth: 0 } as never);
  const [r, c] = sizeOf(range);
  if (c < 2) return false;
  const items: Value[] = Array.from({ length: c }, (_, j) => (range.k === 'mat' ? mat(r, 1, range.d.subarray(j * r, j * r + r)) : range.k === 'cell' ? { k: 'cell', r, c: 1, d: range.d.slice(j * r, j * r + r) } : range));
  const loopVar = st.v.name, { sliced, reductions } = classify(st.body, loopVar);
  for (const red of reductions) if (!vars.has(red.name)) throw new LabError(`parfor: give ${red.name} a starting value before the loop (it adds up across iterations).`);
  const base = shareable(vars), fns = [...lab.fns], workers = parallel.wanted ? Math.min(parallel.wanted, pool.size) : pool.size;
  throw new Pause(async () => {
    const t0 = performance.now();
    const results = await Promise.all(chunks(items, workers).map((part) => pool.run({ kind: 'parfor', vars: base, fns, body: st.body, loopVar, items: part, reductions })));
    const wall = performance.now() - t0, busy = results.reduce((s, x) => s + x.ms, 0);
    for (const res of results) if (res.out) lab.host.out(res.out);
    const bad = results.find((x) => x.error);
    if (bad) throw new LabError(`In a parfor iteration: ${bad.error}`, st.at);
    const got = results.map((x) => new Map(x.vars ?? []));
    for (const n of sliced) { const m = mergeSliced(vars.get(n), got.map((g) => g.get(n))); if (m) vars.set(n, m); }
    for (const red of reductions) { let acc = vars.get(red.name)!; for (const g of got) { const p = g.get(red.name); if (p) acc = combine(lab, red.op, acc, p); } vars.set(red.name, acc); }
    vars.delete(loopVar);
    lab.host.out(`parfor: ${items.length} iterations on ${results.length} workers in ${(wall / 1000).toFixed(2)} s (${(busy / 1000).toFixed(2)} s of work: about ${(busy / Math.max(wall, 1)).toFixed(1)}× one worker)\n`);
  }, false);
};

/** Runs a script so that it can pause for parallel work (top-level parfor, unfinished futures) and carry on. */
export async function runResumable(lab: Lab, src: string) {
  const prog = parse(src);
  for (const [k, f] of prog.fns) lab.fns.set(k, f);
  for (const st of prog.body) topLevel.add(st);
  for (let i = 0; i < prog.body.length;) {
    try { lab.execTop([prog.body[i]]); i++; } catch (e) {
      if (!(e instanceof Pause)) throw e;
      await e.wait();
      if (!e.rerun) i++;
    }
  }
}

// ——— parfeval and futures ———
interface Future { id: number; state: 'queued' | 'finished'; outs?: Value[]; error?: string; out?: string; read: boolean; job?: Promise<void> }
const futures = new Map<number, Future>();
let nextId = 1;
const idsOf = (v: Value | undefined): number[] => {
  if (!v) throw new LabError('Give the futures parfeval returned.');
  if (v.k === 'struct' && v.f.has('ID')) return [toMat(v.f.get('ID')!).d[0]];
  if (v.k === 'cell') return v.d.flatMap(idsOf);
  if (v.k === 'mat') return [...v.d];
  throw new LabError('Give the futures parfeval returned.');
};
const ensure = (ids: number[]) => {
  const waiting = ids.map((id) => futures.get(id)).filter((f): f is Future => !!f && f.state !== 'finished');
  if (waiting.length) throw new Pause(async () => { await Promise.all([...futures.values()].map((f) => f.job)); }, true);
};
def('parfeval', (a, _n, lab) => {
  const fn = a[0], nout = a[1] ? Math.round(toMat(a[1]).d[0]) : 1, args = a.slice(2);
  if (!fn || fn.k !== 'fn') throw new LabError('parfeval(@f, nout, inputs…) needs a function first.');
  const f: Future = { id: nextId++, state: 'queued', read: false };
  futures.set(f.id, f);
  const pool = parallel.pool;
  if (pool && pool.size >= 1) {
    f.job = pool.run({ kind: 'call', vars: shareable(lab.vars), fns: [...lab.fns], fn: fn as Fn, args, nout }).then((r) => { f.state = 'finished'; f.outs = r.outs; f.error = r.error; f.out = r.out; });
  } else {
    // No pool here (a test, or a nested engine): the call runs now.
    try { f.outs = lab.callFn(fn, args, nout); } catch (e) { f.error = e instanceof Error ? e.message : String(e); }
    f.state = 'finished';
  }
  // A future is its number here (MATLAB's Future objects aren't in the engine): F(k) = parfeval(…) makes an array.
  return [num(f.id)];
});
def('fetchOutputs', (a, nout, lab) => {
  const ids = idsOf(a[0]);
  ensure(ids);
  const fs = ids.map((id) => futures.get(id)!);
  for (const f of fs) { if (f.out) { lab.host.out(f.out); f.out = ''; } if (f.error) throw new LabError(`The future ${f.id} stopped: ${f.error}`); f.read = true; }
  if (fs.length === 1) return fs[0].outs ?? [];
  // Several futures: each output stacked (one row per future), as MATLAB's UniformOutput.
  return Array.from({ length: Math.max(1, nout) }, (_, k) => BUILTINS.vertcat(fs.map((f) => f.outs?.[k] ?? mat(0, 0)), 1, lab)[0]);
});
def('fetchNext', (a, _n, lab) => {
  const ids = idsOf(a[0]);
  ensure(ids);
  const k = ids.findIndex((id) => !futures.get(id)!.read);
  if (k < 0) return [mat(0, 0)];
  const f = futures.get(ids[k])!;
  if (f.out) { lab.host.out(f.out); f.out = ''; }
  if (f.error) throw new LabError(`The future ${f.id} stopped: ${f.error}`);
  f.read = true;
  return [num(k + 1), ...(f.outs ?? [])];
});
def('wait', (a) => { ensure(idsOf(a[0])); return [{ ...num(1), logical: true }]; });
def('cancel', (a) => { for (const id of idsOf(a[0])) futures.delete(id); return []; });
def('parpool', (a) => {
  const max = parallel.pool?.size ?? 1, want = a[0] && a[0].k === 'mat' ? Math.round(a[0].d[0]) : a[0] && a[0].k === 'str' ? Math.round(toMat(a[1] ?? num(max)).d[0]) : max;
  if (!(want >= 1)) throw new LabError('parpool(n): n workers, 1 or more.');
  parallel.wanted = Math.min(want, max);
  return [{ k: 'struct', f: new Map<string, Value>([['NumWorkers', num(parallel.wanted)], ['Cluster', str('This computer (Web Workers)')]]) }];
});
def('gcp', (a) => {
  if (!parallel.pool && a[0] && textOf(a[0]) === 'nocreate') return [mat(0, 0)];
  const n = parallel.wanted || parallel.pool?.size || 1;
  return [{ k: 'struct', f: new Map<string, Value>([['NumWorkers', num(n)], ['Cluster', str(parallel.pool ? 'This computer (Web Workers)' : 'None: runs in order')]]) }];
});

// ——— A pool engine's side (par.worker.ts): runs a task in a fresh engine ———
export function runTask(task: Task): TaskResult {
  let out = '';
  const t0 = performance.now(), lab = new Lab({ out: (t) => { out += t; }, now: () => performance.now() });
  for (const [k, v] of task.vars) lab.vars.set(k, v);
  for (const [k, f] of task.fns) lab.fns.set(k, f);
  try {
    if (task.kind === 'call') { const outs = lab.callFn(task.fn, task.args, task.nout); return { outs, out, ms: performance.now() - t0 }; }
    const { sliced, reductions } = classify(task.body, task.loopVar);
    for (const red of reductions) lab.vars.set(red.name, red.identity);
    for (const item of task.items) { lab.vars.set(task.loopVar, item); lab.execTop(task.body); }
    const names = [...sliced, ...reductions.map((x) => x.name)];
    return { vars: names.filter((n) => lab.vars.has(n)).map((n) => [n, lab.vars.get(n)!]), out, ms: performance.now() - t0 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), out, ms: performance.now() - t0 };
  }
}
