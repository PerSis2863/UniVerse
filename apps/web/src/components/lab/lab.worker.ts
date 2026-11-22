/// <reference lib="webworker" />
import { Lab } from '@/lib/lab/interp';
import { Graphics, renderSvg, toTikz } from '@/lib/lab/plot';
import { LabError } from '@/lib/lab/parse';
import { dimsOf, inline, kind, sizeOf } from '@/lib/lab/values';
import { takeWarning } from '@/lib/lab/interp';
import { FileStore, type Pixels } from '@/lib/lab/files';
import { BUILTINS } from '@/lib/lab/builtins';
import { resolve, view, type Step, type View } from '@/lib/lab/inspect';
import { pages as pagesOf } from '@/lib/lab/values';

// M376: UniVerse Lab's engine runs here, off the page's thread, so a long loop never freezes the window (Stop ends
// the worker). Text goes back in batches; after each run the variables and the figures (as SVG in both themes and
// their LaTeX) follow.

export type ToLab = { run: string; id: number } | { figure: number; w: number; h: number } | { upload: FileIn[] } | { remove: string } | { inspect: Inspect };
/** The variable viewer's request (M390): a variable, a path into it, a page and a window. */
export interface Inspect { name: string; steps: Step[]; page: number; from: [number, number] }
/** A file going in (pictures come already decoded, as the worker can't decode them synchronously). */
export interface FileIn { name: string; bytes: Uint8Array; pixels?: Pixels }
/** A file the code wrote (bytes) or deleted (null). */
export interface FileOut { name: string; bytes: Uint8Array | null; pixels?: Pixels }
export type FromLab =
  | { out: string }
  | { done: number; error?: string; at?: number; vars: VarRow[]; figs: FigOut[] | null; current: number | null; files: FileOut[] }
  | { fig: FigOut }
  | { names: string[] }
  | { view: Inspect & { expr: string; size: string; v: View | null; error?: string } };
export interface VarRow { name: string; size: string; cls: string; value: string }
export interface FigOut { id: number; light: string; dark: string; tex: string }

const graphics = new Graphics();
const files = new FileStore();
let buf = '', flushAt = 0;
const flush = () => { if (buf) { postMessage({ out: buf } satisfies FromLab); buf = ''; } };
const lab = new Lab({
  out: (t) => { buf += t; const now = performance.now(); if (now - flushAt > 50 || buf.length > 20000) { flushAt = now; flush(); } },
  graphics,
  files,
  now: () => performance.now(),
});
let size = { w: 720, h: 520 };
// The editor colours and suggests the engine's functions (M389).
postMessage({ names: Object.keys(BUILTINS).sort() } satisfies FromLab);
const figOut = (id: number): FigOut | null => {
  const f = graphics.figures.find((x) => x.id === id);
  return f ? { id, light: renderSvg(f, size.w, size.h, false), dark: renderSvg(f, size.w, size.h, true), tex: toTikz(f) } : null;
};

self.onmessage = (e: MessageEvent<ToLab>) => {
  const m = e.data;
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
  if ('figure' in m) { size = { w: m.w, h: m.h }; const f = figOut(m.figure); if (f) postMessage({ fig: f } satisfies FromLab); return; }
  let error: string | undefined, at: number | undefined;
  const before = new Set(graphics.figures.map((f) => f.id));
  let touched = false;
  graphics.onChange = () => { touched = true; };
  try { lab.run(m.run); } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    if (err instanceof LabError && err.at >= 0) at = err.at;
  }
  const w = takeWarning(); if (w) buf += `${w}\n`;
  flush();
  const vars: VarRow[] = [...lab.vars].sort((a, b) => a[0].localeCompare(b[0])).map(([name, v]) => ({ name, size: (v.k === 'mat' ? dimsOf(v) : sizeOf(v)).join('×'), cls: kind(v), value: inline(v) }));
  const changed = touched || graphics.figures.some((f) => !before.has(f.id)) || graphics.figures.length !== before.size;
  const figs = changed ? graphics.figures.map((f) => figOut(f.id)).filter((f): f is FigOut => !!f) : null;
  const written: FileOut[] = files.takeChanges().map(({ name, file }) => ({ name, bytes: file?.bytes ?? null, pixels: file?.pixels }));
  postMessage({ done: m.id, error, at, vars, figs, current: graphics.current?.id ?? null, files: written } satisfies FromLab);
};
