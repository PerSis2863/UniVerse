import { inline, type Value } from './values';
import type { Figure, Graphics } from './plot';

// Hyperion's "watch it run" (M393): a run recorded step by step, so the window can play it back, pause it, go back
// and forwards, and stop at breakpoints. Each step: the line about to run, how deep in function calls, what the step
// before printed, the variables it sees (only when they changed) and which figure copy shows then. Long runs keep
// their first MAX_STEPS steps; figure copies stop after a budget of numbers (later steps show the last copy).

export interface TraceStep {
  line: number;
  depth: number;
  /** What this step printed. */
  out: string;
  /** The variables after this step as [name, summary], or null when the same as the step before. */
  vars: [string, string][] | null;
  /** Names that changed in this step. */
  changed: string[];
  /** The figure copy to show after this step (−1: none yet). */
  fig: number;
}
export const MAX_STEPS = 5000;
const FIG_BUDGET = 3_000_000; // numbers kept in figure copies

const lineAt = (src: string, at: number) => { let n = 1; for (let i = 0; i < at && i < src.length; i++) if (src.charCodeAt(i) === 10) n++; return n; };
/** Roughly how many numbers a figure holds (for the copies' budget). */
const weight = (f: Figure) => { let n = 0; for (const ax of f.axes.values()) { for (const s of ax.series) n += s.x.length * 3; for (const g of ax.grids) n += g.z.length * 3 + (g.rgb?.length ?? 0); } return n; };

export class Recorder {
  steps: TraceStep[] = [];
  figs: Figure[] = [];
  full = false;
  private out = '';
  private prev = new Map<string, string>();
  private prevFrame: Map<string, Value> | null = null;
  private figDirty = false;
  private kept = 0;
  /** Each step's own frame (a function's variables stay with its steps, even after it returns). */
  private frame: Map<string, Value> | null = null;
  constructor(private src: string, private graphics: Graphics) {}
  write(text: string) { this.out += text; }
  figureChanged() { this.figDirty = true; }
  /** The step that just ran is finished: what it printed, what changed in its frame, the figure. */
  private close() {
    const last = this.steps[this.steps.length - 1], vars = this.frame;
    if (!last || !vars) return;
    last.out = this.out; this.out = '';
    const now = new Map<string, string>();
    for (const [n, v] of vars) now.set(n, inline(v));
    const changed = [...now].filter(([n, t]) => this.prev.get(n) !== t).map(([n]) => n);
    const gone = [...this.prev.keys()].some((n) => !now.has(n));
    last.vars = changed.length || gone || vars !== this.prevFrame ? [...now].sort((a, b) => a[0].localeCompare(b[0])) : null;
    last.changed = vars === this.prevFrame ? changed : [];
    this.prev = now; this.prevFrame = vars;
    if (this.figDirty && this.graphics.current) {
      const w = weight(this.graphics.current);
      if (this.kept + w <= FIG_BUDGET) { this.figs.push(structuredClone(this.graphics.current)); this.kept += w; }
      this.figDirty = false;
    }
    last.fig = this.figs.length - 1;
  }
  /** Called before each statement (the interpreter's trace hook). */
  step(at: number, vars: Map<string, Value>, depth: number) {
    if (this.full) return;
    this.close();
    if (this.steps.length >= MAX_STEPS) { this.full = true; return; }
    this.steps.push({ line: lineAt(this.src, at), depth, out: '', vars: null, changed: [], fig: -1 });
    this.frame = vars;
  }
  /** The run ended: the last step's results. */
  finish() { if (!this.full) this.close(); }
}

/** The variables shown at step k (the last full list at or before it). */
export function varsAt(steps: TraceStep[], k: number): [string, string][] {
  for (let i = Math.min(k, steps.length - 1); i >= 0; i--) { const v = steps[i].vars; if (v) return v; }
  return [];
}
/** Everything printed up to and including step k. */
export const printedUpTo = (steps: TraceStep[], k: number) => steps.slice(0, k + 1).map((s) => s.out).join('');
