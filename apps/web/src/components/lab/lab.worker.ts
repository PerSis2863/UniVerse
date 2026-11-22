/// <reference lib="webworker" />
import { Lab } from '@/lib/lab/interp';
import { Graphics, renderSvg, toTikz } from '@/lib/lab/plot';
import { LabError } from '@/lib/lab/parse';
import { inline, kind, sizeOf } from '@/lib/lab/values';
import { takeWarning } from '@/lib/lab/interp';
import { FileStore, type Pixels } from '@/lib/lab/files';

// M376: UniVerse Lab's engine runs here, off the page's thread, so a long loop never freezes the window (Stop ends
// the worker). Text goes back in batches; after each run the variables and the figures (as SVG in both themes and
// their LaTeX) follow.

export type ToLab = { run: string; id: number } | { figure: number; w: number; h: number } | { upload: FileIn[] } | { remove: string };
/** A file going in (pictures come already decoded, as the worker can't decode them synchronously). */
export interface FileIn { name: string; bytes: Uint8Array; pixels?: Pixels }
/** A file the code wrote (bytes) or deleted (null). */
export interface FileOut { name: string; bytes: Uint8Array | null; pixels?: Pixels }
export type FromLab =
  | { out: string }
  | { done: number; error?: string; at?: number; vars: VarRow[]; figs: FigOut[] | null; current: number | null; files: FileOut[] }
  | { fig: FigOut };
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
const figOut = (id: number): FigOut | null => {
  const f = graphics.figures.find((x) => x.id === id);
  return f ? { id, light: renderSvg(f, size.w, size.h, false), dark: renderSvg(f, size.w, size.h, true), tex: toTikz(f) } : null;
};

self.onmessage = (e: MessageEvent<ToLab>) => {
  const m = e.data;
  if ('upload' in m) { for (const f of m.upload) files.load(f.name, { bytes: f.bytes, pixels: f.pixels }); return; }
  if ('remove' in m) { files.files.delete(m.remove); return; }
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
  const vars: VarRow[] = [...lab.vars].sort((a, b) => a[0].localeCompare(b[0])).map(([name, v]) => { const [r, c] = sizeOf(v); return { name, size: `${r}×${c}`, cls: kind(v), value: inline(v) }; });
  const changed = touched || graphics.figures.some((f) => !before.has(f.id)) || graphics.figures.length !== before.size;
  const figs = changed ? graphics.figures.map((f) => figOut(f.id)).filter((f): f is FigOut => !!f) : null;
  const written: FileOut[] = files.takeChanges().map(({ name, file }) => ({ name, bytes: file?.bytes ?? null, pixels: file?.pixels }));
  postMessage({ done: m.id, error, at, vars, figs, current: graphics.current?.id ?? null, files: written } satisfies FromLab);
};
