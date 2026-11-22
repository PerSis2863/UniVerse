import type { Problem } from './lint';

// Hyperion's "Time it" (M400, the owner's 20 big features: "combine 2 features into one"): a run timed line by line,
// shown as heat beside the code, joined with the code checker's advice: the slowest lines each come with a plain tip
// on how to make them faster (an array grown in a loop, printing or drawing on every pass, one number at a time).

export interface LineTime { line: number; ms: number; count: number }
export interface Profile { lines: LineTime[]; total: number }

/** Told before each statement (the interpreter's trace hook); the time until the next one goes to this line. */
export class Profiler {
  private starts: number[] = [0];
  private ms = new Map<number, number>();
  private count = new Map<number, number>();
  private last = -1;
  private t0: number;
  private readonly begin: number;
  constructor(src: string, private now: () => number) {
    for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) this.starts.push(i + 1);
    this.begin = this.t0 = now();
  }
  private lineOf(at: number) { let lo = 0, hi = this.starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.starts[m] <= at) lo = m; else hi = m - 1; } return lo + 1; }
  step(at: number) {
    const t = this.now(), line = this.lineOf(at);
    if (this.last >= 0) this.ms.set(this.last, (this.ms.get(this.last) ?? 0) + (t - this.t0));
    this.count.set(line, (this.count.get(line) ?? 0) + 1);
    this.last = line;
    this.t0 = t;
  }
  finish(): Profile {
    const t = this.now();
    if (this.last >= 0) this.ms.set(this.last, (this.ms.get(this.last) ?? 0) + (t - this.t0));
    const lines = [...this.count].map(([line, count]) => ({ line, count, ms: this.ms.get(line) ?? 0 })).sort((a, b) => a.line - b.line);
    return { lines, total: t - this.begin };
  }
}

/** A time for people: 0.4 ms, 120 ms, 1.23 s. */
export const timeText = (ms: number) => (ms < 1 ? `${ms.toFixed(2)} ms` : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);

export interface HotLine { line: number; ms: number; share: number; count: number; tip: string }
/** The lines that take the most time (at least 5% of it, at most `n`), each with a way to make it faster. */
export function hotLines(src: string, prof: Profile, problems: Problem[], n = 3): HotLine[] {
  const lines = src.split('\n');
  const starts: number[] = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  const lineOf = (at: number) => { let k = 0; while (k + 1 < starts.length && starts[k + 1] <= at) k++; return k + 1; };
  const sum = prof.lines.reduce((s, l) => s + l.ms, 0) || 1;
  return [...prof.lines].sort((a, b) => b.ms - a.ms).filter((l) => l.ms / sum >= 0.05).slice(0, n).map((l) => {
    const text = lines[l.line - 1] ?? '', mine = problems.filter((p) => lineOf(p.from) === l.line), share = l.ms / sum;
    const times = `${l.count.toLocaleString()} time${l.count === 1 ? '' : 's'}`;
    let tip: string;
    if (mine.some((p) => /grows on every pass/.test(p.message))) tip = 'It grows an array on every pass: make it full size before the loop (for example zeros(1, n)) and fill it in.';
    else if (mine.some((p) => /prints its result/.test(p.message))) tip = `It prints on every pass (${times}): add ; at the end, and show the result once after the loop.`;
    else if (l.count > 1 && /\b(plot|plot3|scatter|surf|mesh|bar|histogram|drawnow|figure|subplot|title|xlabel|ylabel|legend|imagesc|imshow)\s*\(/.test(text)) tip = `It draws ${times}: drawing is slow, so work everything out first and draw once after the loop.`;
    else if (l.count > 1 && /\b(disp|fprintf|sprintf|num2str)\s*\(/.test(text)) tip = `It writes text ${times}: gather the results and show them once at the end.`;
    else if (l.count >= 1000) tip = `It runs ${times}: doing the work on whole arrays at once (y = x.^2 rather than a loop over x) is usually far faster.`;
    else if (/\b(ode45|ode23|fzero|fminsearch|integral|quad|eig|inv|svd|fft)\s*\(/.test(text)) tip = 'Most of the time is in one heavy function: a smaller problem, a looser tolerance or fewer points makes it quicker.';
    else tip = `It takes ${Math.round(share * 100)}% of the time${l.count > 1 ? ` over ${times}` : ''}.`;
    return { line: l.line, ms: l.ms, share, count: l.count, tip };
  });
}
