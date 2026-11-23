/// <reference lib="webworker" />
import { Lab, type Host } from '@/lib/lab/interp';
import { Graphics, renderSvg, toTikz } from '@/lib/lab/plot';
import { LabError } from '@/lib/lab/parse';
import { dimsOf, inline, kind, sizeOf } from '@/lib/lab/values';
import { takeWarning } from '@/lib/lab/interp';
import { FileStore, type Pixels } from '@/lib/lab/files';
import { BUILTINS } from '@/lib/lab/builtins';
import '@/lib/lab/ml-lab';
import '@/lib/lab/optim-lab';
import '@/lib/lab/maint-lab';
import '@/lib/lab/energy-lab';
import '@/lib/lab/grid-lab';
import '@/lib/lab/comms-lab';
import '@/lib/lab/image-lab';
import '@/lib/lab/radar-lab';
import '@/lib/lab/filters-lab';
import '@/lib/lab/audio-lab';
import { serialFeed, type SerialOut } from '@/lib/lab/serial-lab';
import { reportText, runScriptTests, testReports, type TestReport } from '@/lib/lab/verify-lab';
import '@/lib/lab/help-commands';
import { parallel, runResumable, type Pool, type Task, type TaskResult } from '@/lib/lab/parallel-lab';
import '@/lib/lab/gpu-lab';
import '@/lib/lab/des-lab';
import '@/lib/lab/codegen-lab';
import { initGpu } from '@/lib/lab/gpu';
import { resolve, view, type Step, type View } from '@/lib/lab/inspect';
import { pages as pagesOf } from '@/lib/lab/values';
import { Profiler, type Profile } from '@/lib/lab/profile';
import { Recorder, type TraceStep } from '@/lib/lab/trace';
import type { Figure } from '@/lib/lab/plot';
import type { SweepFrame } from '@/lib/lab/sweep';

// M376: Hyperion's engine runs here, off the page's thread, so a long loop never freezes the window (Stop ends
// the worker). Text goes back in batches; after each run the variables and the figures (as SVG in both themes and
// their LaTeX) follow.

export type ToLab = { run: string; id: number; test: string } | { serial: Parameters<typeof serialFeed>[0] } | { run: string; id: number } | { profile: string; id: number } | { figure: number; w: number; h: number } | { upload: FileIn[] } | { remove: string } | { inspect: Inspect } | { watch: string; id: number } | { traceFig: number; w: number; h: number } | { sweep: { codes: string[]; values: number[]; w: number; h: number }; id: number };
/** The variable viewer's request (M390): a variable, a path into it, a page and a window. */
export interface Inspect { name: string; steps: Step[]; page: number; from: [number, number] }
/** A file going in (pictures come already decoded, as the worker can't decode them synchronously). */
export interface FileIn { name: string; bytes: Uint8Array; pixels?: Pixels }
/** A file the code wrote (bytes) or deleted (null). */
export interface FileOut { name: string; bytes: Uint8Array | null; pixels?: Pixels }
export type FromLab =
  | { out: string }
  | { done: number; error?: string; at?: number; vars: VarRow[]; figs: FigOut[] | null; current: number | null; files: FileOut[]; drawn: number[] }
  | { fig: FigOut }
  | { names: string[] }
  | { sound: { channels: Float32Array[]; fs: number } }
  | { serialOut: SerialOut }
  | { tested: TestReport }
  | { trace: { steps: TraceStep[]; full: boolean } }
  | { traceFig: { index: number; light: string; dark: string } }
  | { profiled: Profile }
  | { sweepFrame: { index: number; frame: SweepFrame } }
  | { view: Inspect & { expr: string; size: string; v: View | null; error?: string } };
export interface VarRow { name: string; size: string; cls: string; value: string }
export interface FigOut { id: number; light: string; dark: string; tex: string }

const graphics = new Graphics();
const files = new FileStore();
let buf = '', flushAt = 0;
const flush = () => { if (buf) { postMessage({ out: buf } satisfies FromLab); buf = ''; } };
// Watch it run (M393): while a recorded run goes, printing and figure changes go to the recorder.
let recorder: Recorder | null = null;
// Time it (M400): while a timed run goes, each statement tells the profiler.
let profiler: Profiler | null = null;
let traceFigs: Figure[] = [];
const host: Host = {
  out: (t) => { if (recorder) { recorder.write(t); return; } buf += t; const now = performance.now(); if (now - flushAt > 50 || buf.length > 20000) { flushAt = now; flush(); } },
  trace: (at, vars, depth) => { recorder?.step(at, vars, depth); profiler?.step(at); },
  graphics,
  files,
  now: () => performance.now(),
  serial: (m) => { postMessage({ serialOut: m as SerialOut } satisfies FromLab); },
  sound: (channels, fs) => { flush(); postMessage({ sound: { channels, fs } } satisfies FromLab); },
};
const lab = new Lab(host);
// M477: a pool of engines for parfor and parfeval (one fewer than the computer's cores, at most 8), started the first
// time a script asks; each runs one task at a time.
class WorkerPool implements Pool {
  private idle: Worker[] = [];
  private all: Worker[] = [];
  private queue: { task: Task; done: (r: TaskResult) => void }[] = [];
  private waiting = new Map<number, (r: TaskResult) => void>();
  private seq = 0;
  constructor(readonly size: number) {}
  run(task: Task) { return new Promise<TaskResult>((done) => { this.queue.push({ task, done }); this.next(); }); }
  private next() {
    while (this.queue.length) {
      let w = this.idle.pop();
      if (!w && this.all.length < this.size) {
        w = new Worker(new URL('./par.worker.ts', import.meta.url));
        w.onmessage = (ev: MessageEvent<{ id: number; result: TaskResult }>) => { const d = this.waiting.get(ev.data.id); this.waiting.delete(ev.data.id); this.idle.push(ev.target as Worker); d?.(ev.data.result); this.next(); };
        this.all.push(w);
      }
      if (!w) return;
      const job = this.queue.shift()!, id = ++this.seq;
      this.waiting.set(id, job.done);
      w.postMessage({ id, task: job.task });
    }
  }
}
const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
if (typeof Worker !== 'undefined' && cores > 2) parallel.pool = new WorkerPool(Math.min(8, cores - 1));
// M478: the graphics chip, asked for once (asynchronously) so gpuArray finds it ready.
void initGpu();
testReports.onReport = (r) => postMessage({ tested: r } satisfies FromLab);
let size = { w: 720, h: 520 };
// The editor colours and suggests the engine's functions (M389).
postMessage({ names: Object.keys(BUILTINS).sort() } satisfies FromLab);
const figOut = (id: number): FigOut | null => {
  const f = graphics.figures.find((x) => x.id === id);
  return f ? { id, light: renderSvg(f, size.w, size.h, false), dark: renderSvg(f, size.w, size.h, true), tex: toTikz(f) } : null;
};

const varRows = (): VarRow[] => [...lab.vars].sort((a, b) => a[0].localeCompare(b[0])).map(([name, v]) => ({ name, size: (v.k === 'mat' ? dimsOf(v) : sizeOf(v)).join('×'), cls: kind(v), value: inline(v) }));

/** Sweep (M402): each script in a fresh workspace of its own, its figure drawn as a frame, its numbers kept. */
function sweep(codes: string[], values: number[], w: number, h: number) {
  codes.forEach((code, index) => {
    const g = new Graphics();
    const one = new Lab({ out: () => {}, graphics: g, files, now: () => performance.now() });
    let error: string | undefined;
    try { one.run(code); } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      if (err instanceof LabError && err.at >= 0) error = `line ${code.slice(0, err.at).split('\n').length}: ${error}`;
    }
    takeWarning();
    const f = g.current ?? g.figures[g.figures.length - 1];
    const outs: Record<string, number> = {};
    for (const [name, v] of one.vars) {
      if (v.k === 'mat' && v.d.length === 1 && !(v.im && v.im[0] !== 0)) outs[name] = v.d[0];
    }
    const frame: SweepFrame = { value: values[index], light: f ? renderSvg(f, w, h, false) : '', dark: f ? renderSvg(f, w, h, true) : '', outs, ...(error ? { error } : {}) };
    postMessage({ sweepFrame: { index, frame } } satisfies FromLab);
  });
}

self.onmessage = async (e: MessageEvent<ToLab>) => {
  const m = e.data;
  if ('sweep' in m) {
    sweep(m.sweep.codes, m.sweep.values, m.sweep.w, m.sweep.h);
    const written: FileOut[] = files.takeChanges().map(({ name, file }) => ({ name, bytes: file?.bytes ?? null, pixels: file?.pixels }));
    postMessage({ done: m.id, vars: varRows(), figs: null, current: graphics.current?.id ?? null, files: written, drawn: [] } satisfies FromLab);
    return;
  }
  if ('serial' in m) { serialFeed(m.serial); return; }
  if ('upload' in m) { for (const f of m.upload) files.load(f.name, { bytes: f.bytes, pixels: f.pixels }); return; }
  if ('remove' in m) { files.files.delete(m.remove); return; }
  if ('inspect' in m) {
    const q = m.inspect, root = lab.vars.get(q.name);
    if (!root) { postMessage({ view: { ...q, expr: q.name, size: '', v: null, error: `${q.name} no longer exists.` } } satisfies FromLab); return; }
    try {
      const { value, expr } = resolve(root, q.name, q.steps), [r, c] = sizeOf(value), P = pagesOf(value);
      postMessage({ view: { ...q, expr, size: `${r}×${c}${P > 1 ? `×${P}` : ''} ${kind(value)}`, v: view(value, q.page, q.from) } } satisfies FromLab);
    } catch (err) { postMessage({ view: { ...q, expr: q.name, size: '', v: null, error: err instanceof Error ? err.message : String(err) } } satisfies FromLab); }
    return;
  }
  if ('traceFig' in m) {
    const f = traceFigs[m.traceFig];
    if (f) postMessage({ traceFig: { index: m.traceFig, light: renderSvg(f, m.w, m.h, false), dark: renderSvg(f, m.w, m.h, true) } } satisfies FromLab);
    return;
  }
  if ('figure' in m) { size = { w: m.w, h: m.h }; const f = figOut(m.figure); if (f) postMessage({ fig: f } satisfies FromLab); return; }
  let error: string | undefined, at: number | undefined;
  const before = new Set(graphics.figures.map((f) => f.id));
  let touched = false;
  // M397: which figures this run drew on (a notebook section shows only its own).
  const drawn = new Set<number>();
  const code = 'watch' in m ? m.watch : 'profile' in m ? m.profile : m.run;
  if ('watch' in m) recorder = new Recorder(code, graphics);
  if ('profile' in m) { profiler = new Profiler(code, () => performance.now()); host.fnTimer = profiler; }
  graphics.onChange = () => { touched = true; if (graphics.current) drawn.add(graphics.current.id); recorder?.figureChanged(); };
  try {
    // M476: the Test button runs the script's %% sections (and test functions) as tests.
    if ('test' in m) { const r = runScriptTests(lab, code, m.test); host.out(reportText(r)); testReports.onReport?.(r); } else if ('run' in m) await runResumable(lab, code); else lab.run(code);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    if (err instanceof LabError && err.at >= 0) at = err.at;
  }
  const w = takeWarning();
  if (recorder) {
    if (w) recorder.write(`${w}\n`);
    recorder.finish();
    traceFigs = recorder.figs;
    postMessage({ trace: { steps: recorder.steps, full: recorder.full } } satisfies FromLab);
    recorder = null;
  } else if (w) buf += `${w}\n`;
  if (profiler) { postMessage({ profiled: profiler.finish() } satisfies FromLab); profiler = null; delete host.fnTimer; }
  flush();
  const vars = varRows();
  const changed = touched || graphics.figures.some((f) => !before.has(f.id)) || graphics.figures.length !== before.size;
  const figs = changed ? graphics.figures.map((f) => figOut(f.id)).filter((f): f is FigOut => !!f) : null;
  const written: FileOut[] = files.takeChanges().map(({ name, file }) => ({ name, bytes: file?.bytes ?? null, pixels: file?.pixels }));
  for (const f of graphics.figures) if (!before.has(f.id)) drawn.add(f.id);
  postMessage({ done: m.id, error, at, vars, figs, current: graphics.current?.id ?? null, files: written, drawn: [...drawn] } satisfies FromLab);
};
