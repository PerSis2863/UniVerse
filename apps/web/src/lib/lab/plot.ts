import { LabError } from './parse';
import { mat, numel, scalar, toMat, type Value } from './values';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';

// UniVerse Lab's figures (M375): plot, scatter, bar, stairs, stem, area, histogram, fplot, log axes, subplot, hold,
// titles, labels, legends, grids and limits, drawn as SVG (sharp at any size, light or dark), and written out as
// LaTeX pgfplots code (our own version of what matlab2tikz does for MATLAB figures). Our own colours, not MATLAB's.

export type Kind = 'line' | 'scatter' | 'bar' | 'stairs' | 'stem' | 'area';
export interface Series { kind: Kind; x: number[]; y: number[]; color: string; dash: '' | '--' | ':' | '-.' | 'none'; marker: string | null; width: number; label: string | null; size: number }
export interface Axes { series: Series[]; title: string; xlabel: string; ylabel: string; legend: string[] | null; grid: boolean; hold: boolean; xlim: [number, number] | null; ylim: [number, number] | null; equal: boolean; logx: boolean; logy: boolean; next: number }
export interface Figure { id: number; rows: number; cols: number; axes: Map<number, Axes>; current: number; name: string }

/** Our palette for lines one after another (each readable on white and on near-black). */
export const PALETTE = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#ca8a04', '#db2777'];
const LETTER: Record<string, string> = { b: '#2563eb', r: '#dc2626', g: '#16a34a', c: '#0891b2', m: '#c026d3', y: '#ca8a04', k: '#111827', w: '#ffffff' };
const NAMED: Record<string, string> = { blue: LETTER.b, red: LETTER.r, green: LETTER.g, cyan: LETTER.c, magenta: LETTER.m, yellow: LETTER.y, black: LETTER.k, white: LETTER.w };

export class Graphics {
  figures: Figure[] = [];
  current: Figure | null = null;
  /** Called after any change (the window redraws the figure). */
  onChange: (() => void) | null = null;
  figure(id?: number) {
    let f = id !== undefined ? this.figures.find((x) => x.id === id) : undefined;
    if (!f) { f = { id: id ?? (Math.max(0, ...this.figures.map((x) => x.id)) + 1), rows: 1, cols: 1, axes: new Map(), current: 1, name: '' }; this.figures.push(f); }
    this.current = f;
    return f;
  }
  axes(): Axes {
    const f = this.current ?? this.figure();
    let a = f.axes.get(f.current);
    if (!a) { a = blankAxes(); f.axes.set(f.current, a); }
    return a;
  }
  changed() { this.onChange?.(); }
}
const blankAxes = (): Axes => ({ series: [], title: '', xlabel: '', ylabel: '', legend: null, grid: false, hold: false, xlim: null, ylim: null, equal: false, logx: false, logy: false, next: 0 });

const gfx = (lab: Lab): Graphics => {
  const g = lab.host.graphics;
  if (!(g instanceof Graphics)) throw new LabError('Figures aren’t available here.');
  return g;
};
const vec = (v: Value) => [...toMat(v).d];
const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };

/** Line specs like 'r--o' or 'k:'; then name–value pairs ('LineWidth', 2, 'Color', 'g', 'DisplayName', 'data'). */
function style(args: Value[], base: Partial<Series>): Partial<Series> {
  const s: Partial<Series> = { ...base };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.k !== 'str') continue;
    const name = a.v.toLowerCase(), val = args[i + 1];
    if (['linewidth', 'color', 'displayname', 'markersize', 'marker', 'linestyle', 'markerfacecolor', 'facecolor'].includes(name) && val) {
      if (name === 'linewidth') s.width = scalar(val);
      else if (name === 'markersize') s.size = scalar(val);
      else if (name === 'color' || name === 'facecolor' || name === 'markerfacecolor') s.color = colour(val);
      else if (name === 'displayname') s.label = textOf(val);
      else if (name === 'marker') s.marker = textOf(val) === 'none' ? null : textOf(val);
      else if (name === 'linestyle') { const ls = textOf(val); s.dash = ls === '-' ? '' : (ls as Series['dash']); }
      i++;
      continue;
    }
    // A spec: colour letter, line style and marker in any order ('r--o', 'k:', 'x').
    const spec = a.v;
    const dash = spec.includes('--') ? '--' : spec.includes('-.') ? '-.' : spec.includes(':') ? ':' : spec.includes('-') ? '' : null;
    const rest = spec.replace(/--|-\.|-|:/g, '');
    const letter = [...rest].find((ch) => LETTER[ch]);
    if (letter) s.color = LETTER[letter];
    const mk = [...rest].find((ch) => 'o+*.xsd^v><ph'.includes(ch));
    if (mk) s.marker = mk;
    if (dash !== null) s.dash = dash;
    else if (mk) s.dash = 'none';
  }
  return s;
}
function colour(v: Value): string {
  if (v.k === 'str') return LETTER[v.v] ?? NAMED[v.v.toLowerCase()] ?? (/^#[0-9a-f]{6}$/i.test(v.v) ? v.v : PALETTE[0]);
  const d = vec(v).map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255));
  if (d.length !== 3) throw new LabError('A colour is a letter like \'r\', a name, or [r g b] from 0 to 1.');
  return `#${d.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
/** Adds series to the current axes (replacing them unless "hold on"). */
function add(lab: Lab, list: Series[]) {
  const g = gfx(lab), a = g.axes();
  if (!a.hold) { const keep = { hold: a.hold }; Object.assign(a, blankAxes(), keep); }
  for (const s of list) a.series.push(s);
  g.changed();
}
const nextColour = (lab: Lab) => { const a = gfx(lab).axes(); const n = a.hold ? a.series.length : 0; return PALETTE[n % PALETTE.length]; };

function seriesFrom(args: Value[], lab: Lab, kind: Kind): Series[] {
  // plot(y), plot(x, y), plot(x, y, spec, x2, y2, spec2, …), with a matrix y giving one line per column.
  const out: Series[] = [];
  let i = 0, n = gfx(lab).axes().hold ? gfx(lab).axes().series.length : 0;
  while (i < args.length && args[i].k !== 'str') {
    const first = toMat(args[i]);
    const second = args[i + 1] && args[i + 1].k !== 'str' ? toMat(args[i + 1]) : null;
    // plot(z) with complex z draws its real against its imaginary parts (M377).
    const [X, Y] = !second && first.im ? [mat(first.r, first.c, first.d), mat(first.r, first.c, first.im)] : second ? [first, second] : [mat(first.r === 1 || first.c === 1 ? 1 : first.r, first.r === 1 || first.c === 1 ? first.d.length : 1, Array.from({ length: first.r === 1 || first.c === 1 ? first.d.length : first.r }, (_, k) => k + 1)), first];
    i += second ? 2 : 1;
    const spec: Value[] = [];
    while (i < args.length && args[i].k === 'str' && !(args[i + 1] && args[i + 1].k !== 'str' && isPairName(args[i]))) { spec.push(args[i]); i++; if (spec.length) break; }
    const columns = Y.r === 1 || Y.c === 1 ? [[...Y.d]] : Array.from({ length: Y.c }, (_, j) => [...Y.d.subarray(j * Y.r, j * Y.r + Y.r)]);
    const xs = X.r === 1 || X.c === 1 ? [...X.d] : null;
    columns.forEach((ys, j) => {
      const x = xs ?? [...X.d.subarray(j * X.r, j * X.r + X.r)];
      if (x.length !== ys.length) throw new LabError(`x and y must be the same length (got ${x.length} and ${ys.length}).`);
      out.push({ kind, x, y: ys, color: PALETTE[n++ % PALETTE.length], dash: kind === 'scatter' ? 'none' : '', marker: kind === 'scatter' ? 'o' : kind === 'stem' ? 'o' : null, width: 1.5, label: null, size: 6, ...style(spec, {}) } as Series);
    });
  }
  // Name–value pairs at the end apply to every line made by this call.
  const rest = args.slice(i);
  if (rest.length) { const st = style(rest, {}); for (const s of out) Object.assign(s, st); }
  return out;
}
const isPairName = (v: Value) => v.k === 'str' && /^(linewidth|color|displayname|markersize|marker|linestyle|markerfacecolor|facecolor)$/i.test(v.v);

def('plot', (a, _n, lab) => { if (!a.length) throw new LabError('plot needs something to draw, like plot(x, y).'); add(lab, seriesFrom(a, lab, 'line')); return []; });
def('scatter', (a, _n, lab) => { const s = seriesFrom(a.slice(0, 2), lab, 'scatter'); const st = style(a.slice(2).filter((v) => v.k === 'str'), {}); s.forEach((x) => Object.assign(x, st)); if (a[2] && a[2].k !== 'str' && numel(a[2]) === 1) s.forEach((x) => { x.size = Math.sqrt(scalar(a[2])); }); add(lab, s); return []; });
def('bar', (a, _n, lab) => { add(lab, seriesFrom(a, lab, 'bar').map((s) => ({ ...s, dash: 'none' as const, marker: null }))); return []; });
def('stairs', (a, _n, lab) => { add(lab, seriesFrom(a, lab, 'stairs')); return []; });
def('stem', (a, _n, lab) => { add(lab, seriesFrom(a, lab, 'stem')); return []; });
def('area', (a, _n, lab) => { add(lab, seriesFrom(a, lab, 'area')); return []; });
for (const [n, lx, ly] of [['semilogx', true, false], ['semilogy', false, true], ['loglog', true, true]] as const) {
  BUILTINS[n] = (a, _n, lab) => { add(lab, seriesFrom(a, lab, 'line')); const ax = gfx(lab).axes(); ax.logx = lx; ax.logy = ly; return []; };
}
def('histogram hist', (a, nout, lab) => {
  const data = vec(a[0]).filter(Number.isFinite);
  if (!data.length) throw new LabError('histogram needs some numbers.');
  const lo = Math.min(...data), hi = Math.max(...data);
  let edges: number[];
  if (a[1] && numel(a[1]) > 1) edges = vec(a[1]);
  else { const n = a[1] ? scalar(a[1]) : Math.max(1, Math.ceil(Math.sqrt(data.length))); const w = (hi - lo || 1) / n; edges = Array.from({ length: n + 1 }, (_, k) => lo + k * w); }
  const counts = new Array(edges.length - 1).fill(0);
  for (const x of data) { const k = edges.findIndex((e, i) => i < edges.length - 1 && x >= e && (x < edges[i + 1] || (i === edges.length - 2 && x <= edges[i + 1]))); if (k >= 0) counts[k]++; }
  const centres = counts.map((_, k) => (edges[k] + edges[k + 1]) / 2);
  if (nout > 0) return [mat(1, counts.length, counts), mat(1, centres.length, centres)];
  add(lab, [{ kind: 'bar', x: centres, y: counts, color: nextColour(lab), dash: 'none', marker: null, width: 1, label: null, size: 6 }]);
  return [];
});
def('fplot ezplot', (a, _n, lab) => {
  const lim = a[1] && a[1].k !== 'str' ? vec(a[1]) : [-5, 5];
  const xs = Array.from({ length: 400 }, (_, k) => lim[0] + ((lim[1] - lim[0]) * k) / 399);
  const ys = xs.map((x) => scalar(lab.callFn(a[0], [mat(1, 1, [x])])[0]));
  add(lab, [{ kind: 'line', x: xs, y: ys, color: nextColour(lab), dash: '', marker: null, width: 1.5, label: null, size: 6, ...style(a.slice(a[1] && a[1].k !== 'str' ? 2 : 1), {}) }]);
  return [];
});
const onOff = (a: Value[], dflt: boolean) => (a[0]?.k === 'str' ? !/^off$/i.test(a[0].v) : dflt);
def('hold', (a, _n, lab) => { const ax = gfx(lab).axes(); ax.hold = a[0]?.k === 'str' ? !/^off$/i.test(a[0].v) : !ax.hold; return []; });
def('grid', (a, _n, lab) => { const ax = gfx(lab).axes(); ax.grid = a.length ? onOff(a, true) : !ax.grid; gfx(lab).changed(); return []; });
const text = (key: 'title' | 'xlabel' | 'ylabel') => (a: Value[], _n: number, lab: Lab) => { gfx(lab).axes()[key] = a[0] ? textOf(a[0]) : ''; gfx(lab).changed(); return []; };
BUILTINS.title = text('title'); BUILTINS.xlabel = text('xlabel'); BUILTINS.ylabel = text('ylabel');
def('legend', (a, _n, lab) => {
  const ax = gfx(lab).axes();
  if (a[0]?.k === 'str' && /^(off|hide)$/i.test(a[0].v)) ax.legend = null;
  else if (a[0]?.k === 'str' && /^(show|on|boxon|boxoff|toggle)$/i.test(a[0].v)) ax.legend = [];
  else if (a[0]?.k === 'cell') ax.legend = a[0].d.map((v) => textOf(v));
  else {
    // legend('a', 'b', 'Location', 'northwest'): the names, without the options and their values.
    const names: string[] = [];
    for (let i = 0; i < a.length; i++) { const v = a[i]; if (v.k !== 'str') continue; if (/^(location|orientation|box|fontsize)$/i.test(v.v)) { i++; continue; } names.push(v.v); }
    ax.legend = names;
  }
  if (!ax.legend?.length) ax.legend = ax.series.map((s, i) => s.label ?? `data${i + 1}`);
  gfx(lab).changed();
  return [];
});
def('xlim', (a, _n, lab) => { const v = vec(a[0]); gfx(lab).axes().xlim = [v[0], v[1]]; gfx(lab).changed(); return []; });
def('ylim', (a, _n, lab) => { const v = vec(a[0]); gfx(lab).axes().ylim = [v[0], v[1]]; gfx(lab).changed(); return []; });
def('axis', (a, _n, lab) => {
  const ax = gfx(lab).axes();
  for (const v of a) {
    if (v.k === 'str') { if (/^equal$/i.test(v.v)) ax.equal = true; else if (/^(tight|auto|normal)$/i.test(v.v)) { ax.xlim = null; ax.ylim = null; ax.equal = false; } }
    else { const d = vec(v); if (d.length >= 4) { ax.xlim = [d[0], d[1]]; ax.ylim = [d[2], d[3]]; } }
  }
  gfx(lab).changed();
  return [];
});
def('subplot', (a, _n, lab) => {
  const g = gfx(lab), f = g.current ?? g.figure();
  const [r, c, p0] = a.length >= 3 ? [scalar(a[0]), scalar(a[1]), scalar(a[2])] : (() => { const n = String(scalar(a[0])); return [Number(n[0]), Number(n[1]), Number(n[2])]; })();
  if (r !== f.rows || c !== f.cols) { f.rows = r; f.cols = c; f.axes = new Map([...f.axes].filter(([k]) => k <= r * c)); }
  f.current = Math.max(1, Math.min(r * c, p0));
  g.axes();
  g.changed();
  return [];
});
def('figure', (a, _n, lab) => { gfx(lab).figure(a[0] && a[0].k !== 'str' ? scalar(a[0]) : undefined); gfx(lab).changed(); return []; });
def('clf', (_a, _n, lab) => { const f = gfx(lab).current; if (f) { f.axes = new Map(); f.rows = 1; f.cols = 1; f.current = 1; } gfx(lab).changed(); return []; });
def('close', (a, _n, lab) => {
  const g = gfx(lab);
  if (a[0]?.k === 'str' && /^all$/i.test(a[0].v)) { g.figures = []; g.current = null; }
  else { const id = a[0] && a[0].k !== 'str' ? scalar(a[0]) : g.current?.id; g.figures = g.figures.filter((f) => f.id !== id); g.current = g.figures[g.figures.length - 1] ?? null; }
  g.changed();
  return [];
});
def('gcf', (_a, _n, lab) => [mat(1, 1, [gfx(lab).current?.id ?? gfx(lab).figure().id])]);
def('drawnow', () => []);

// ——— Drawing: ticks, then SVG ———

/** "Nice" tick positions covering [lo, hi] (steps of 1, 2 or 5 × 10ⁿ). */
export function ticks(lo: number, hi: number, want = 6): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / want, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 5, 10].map((m) => m * mag).find((s) => (hi - lo) / s <= want) ?? 10 * mag;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + step * 1e-9; t += step) out.push(+t.toPrecision(12));
  return out;
}
const label = (t: number) => { const a = Math.abs(t); return a !== 0 && (a >= 1e5 || a < 1e-3) ? t.toExponential(1).replace('e+', 'e') : String(+t.toPrecision(6)); };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** A little TeX in labels: x^2, x_1 and Greek names (\alpha), as Unicode. */
export function tex(s: string): string {
  const greek: Record<string, string> = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω', Delta: 'Δ', Omega: 'Ω', Sigma: 'Σ', infty: '∞', pm: '±', cdot: '·', times: '×', leq: '≤', geq: '≥', circ: '°' };
  const sup: Record<string, string> = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', '+': '⁺', n: 'ⁿ' };
  const sub: Record<string, string> = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
  return s.replace(/\\([A-Za-z]+)/g, (m, w: string) => greek[w] ?? m)
    .replace(/\^\{([^}]*)\}|\^(.)/g, (m, g: string | undefined, c: string | undefined) => [...(g ?? c ?? '')].map((ch) => sup[ch] ?? ch).join(''))
    .replace(/_\{([^}]*)\}|_(.)/g, (m, g: string | undefined, c: string | undefined) => [...(g ?? c ?? '')].map((ch) => sub[ch] ?? ch).join(''));
}

interface Box { x: number; y: number; w: number; h: number }
const DASH: Record<string, string> = { '': '', '--': '6 4', ':': '1.5 3', '-.': '6 3 1.5 3', none: '' };

/** One figure as SVG text, `width` × `height` pixels. */
export function renderSvg(f: Figure, width: number, height: number, dark = false): string {
  const ink = dark ? '#e4e4e7' : '#18181b', soft = dark ? '#a1a1aa' : '#52525b', line = dark ? '#3f3f46' : '#d4d4d8', bg = dark ? '#18181b' : '#ffffff';
  const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Inter, system-ui, sans-serif"><rect width="${width}" height="${height}" fill="${bg}"/>`];
  const cw = width / f.cols, ch = height / f.rows;
  for (let p = 1; p <= f.rows * f.cols; p++) {
    const ax = f.axes.get(p);
    if (!ax) continue;
    const col = (p - 1) % f.cols, rowi = Math.floor((p - 1) / f.cols);
    const box: Box = { x: col * cw + 58, y: rowi * ch + (ax.title ? 34 : 16), w: cw - 58 - 18, h: ch - (ax.title ? 34 : 16) - (ax.xlabel ? 52 : 34) };
    if (box.w < 40 || box.h < 40) continue;
    parts.push(drawAxes(ax, box, { ink, soft, line }));
  }
  parts.push('</svg>');
  return parts.join('');
}

function extent(ax: Axes): { x: [number, number]; y: [number, number] } {
  const fin = (v: number, log: boolean) => Number.isFinite(v) && (!log || v > 0);
  const xs = ax.series.flatMap((s) => s.x.filter((v) => fin(v, ax.logx))), ys = ax.series.flatMap((s) => s.y.filter((v) => fin(v, ax.logy)));
  if (ax.series.some((s) => s.kind === 'bar' || s.kind === 'area' || s.kind === 'stem')) ys.push(0);
  const span = (v: number[], log: boolean): [number, number] => {
    if (!v.length) return [0, 1];
    let lo = Math.min(...v), hi = Math.max(...v);
    if (lo === hi) { lo -= log ? lo / 2 : 1; hi += log ? hi : 1; }
    return [lo, hi];
  };
  let x = ax.xlim ?? span(xs, ax.logx), y = ax.ylim ?? span(ys, ax.logy);
  // Bars need half a bar of room at each end.
  const bars = ax.series.filter((s) => s.kind === 'bar');
  if (bars.length && !ax.xlim) { const gap = barWidth(bars[0].x); x = [x[0] - gap / 2, x[1] + gap / 2]; }
  // y rounds out to the next tidy numbers (as MATLAB's automatic limits do); x stays tight to the data for lines,
  // with a little room for scatter points.
  if (!ax.ylim && !ax.logy) y = outward(y[0], y[1]);
  if (!ax.xlim && !ax.logx && ax.series.some((s) => s.kind === 'scatter')) x = outward(x[0], x[1]);
  return { x, y };
}
function outward(lo: number, hi: number): [number, number] {
  const t = ticks(lo, hi), step = t.length > 1 ? t[1] - t[0] : 1;
  return [Math.floor(lo / step + 1e-9) * step, Math.ceil(hi / step - 1e-9) * step];
}
const barWidth = (x: number[]) => (x.length > 1 ? Math.min(...x.slice(1).map((v, i) => v - x[i]).filter((d) => d > 0)) : 1);

function drawAxes(ax: Axes, b: Box, c: { ink: string; soft: string; line: string }): string {
  const { x: [x0, x1], y: [y0, y1] } = extent(ax);
  let { w, h } = b; const { x: bx, y: by } = b;
  if (ax.equal) { const sx = w / (x1 - x0), sy = h / (y1 - y0), s = Math.min(sx, sy); w = (x1 - x0) * s; h = (y1 - y0) * s; }
  const lx = (v: number) => (ax.logx ? Math.log10(v) : v), ly = (v: number) => (ax.logy ? Math.log10(v) : v);
  const X = (v: number) => bx + ((lx(v) - lx(x0)) / (lx(x1) - lx(x0) || 1)) * w;
  const Y = (v: number) => by + h - ((ly(v) - ly(y0)) / (ly(y1) - ly(y0) || 1)) * h;
  const out: string[] = [];
  const xt = ax.logx ? decades(x0, x1) : ticks(x0, x1), yt = ax.logy ? decades(y0, y1) : ticks(y0, y1);
  const id = `c${Math.round(bx)}_${Math.round(by)}`;
  out.push(`<defs><clipPath id="${id}"><rect x="${bx}" y="${by}" width="${w}" height="${h}"/></clipPath></defs>`);
  if (ax.grid) {
    for (const t of xt) if (t >= x0 && t <= x1) out.push(`<line x1="${X(t)}" y1="${by}" x2="${X(t)}" y2="${by + h}" stroke="${c.line}" stroke-width="0.8"/>`);
    for (const t of yt) if (t >= y0 && t <= y1) out.push(`<line x1="${bx}" y1="${Y(t)}" x2="${bx + w}" y2="${Y(t)}" stroke="${c.line}" stroke-width="0.8"/>`);
  }
  out.push(`<g clip-path="url(#${id})">`);
  const bars = ax.series.filter((s) => s.kind === 'bar');
  ax.series.forEach((s) => {
    const pts = s.x.map((x, i) => [x, s.y[i]] as const).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && (!ax.logx || x > 0) && (!ax.logy || y > 0));
    const dash = DASH[s.dash] ? ` stroke-dasharray="${DASH[s.dash]}"` : '';
    if (s.kind === 'bar') {
      const k = bars.indexOf(s), n = bars.length, full = barWidth(s.x) * 0.8, bw = full / n;
      for (const [x, y] of pts) { const left = X(x - full / 2 + k * bw), right = X(x - full / 2 + (k + 1) * bw), top = Y(Math.max(0, y)), bot = Y(Math.min(0, y)); out.push(`<rect x="${left}" y="${top}" width="${Math.max(0.5, right - left)}" height="${Math.max(0, bot - top)}" fill="${s.color}" fill-opacity="0.85"/>`); }
      return;
    }
    if (s.kind === 'area' && pts.length) out.push(`<path d="M${X(pts[0][0])},${Y(0)} ${pts.map(([x, y]) => `L${X(x)},${Y(y)}`).join(' ')} L${X(pts[pts.length - 1][0])},${Y(0)} Z" fill="${s.color}" fill-opacity="0.25"/>`);
    if (s.kind === 'stem') for (const [x, y] of pts) out.push(`<line x1="${X(x)}" y1="${Y(0)}" x2="${X(x)}" y2="${Y(y)}" stroke="${s.color}" stroke-width="${s.width}"/>`);
    if (s.dash !== 'none' && s.kind !== 'stem' && pts.length > 1) {
      // A NaN breaks the line, as in MATLAB.
      const runs: string[] = []; let cur = '';
      s.x.forEach((x, i) => { const y = s.y[i]; if (!Number.isFinite(x) || !Number.isFinite(y)) { if (cur) runs.push(cur); cur = ''; return; } if (s.kind === 'stairs' && cur) cur += ` H${X(x)}`; cur += `${cur ? ' L' : 'M'}${X(x).toFixed(2)},${Y(y).toFixed(2)}`; });
      if (cur) runs.push(cur);
      out.push(`<path d="${runs.join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linejoin="round" stroke-linecap="round"${dash}/>`);
    }
    if (s.marker) for (const [x, y] of pts) out.push(markerSvg(s.marker, X(x), Y(y), s.size / 2 + 0.5, s.color));
  });
  out.push('</g>');
  out.push(`<rect x="${bx}" y="${by}" width="${w}" height="${h}" fill="none" stroke="${c.soft}" stroke-width="1"/>`);
  for (const t of xt) if (t >= x0 - 1e-12 && t <= x1 + 1e-12) out.push(`<line x1="${X(t)}" y1="${by + h}" x2="${X(t)}" y2="${by + h - 5}" stroke="${c.soft}"/><text x="${X(t)}" y="${by + h + 16}" fill="${c.soft}" font-size="11" text-anchor="middle">${ax.logx ? `10${tex(`^{${Math.round(Math.log10(t))}}`)}` : label(t)}</text>`);
  for (const t of yt) if (t >= y0 - 1e-12 && t <= y1 + 1e-12) out.push(`<line x1="${bx}" y1="${Y(t)}" x2="${bx + 5}" y2="${Y(t)}" stroke="${c.soft}"/><text x="${bx - 7}" y="${Y(t) + 4}" fill="${c.soft}" font-size="11" text-anchor="end">${ax.logy ? `10${tex(`^{${Math.round(Math.log10(t))}}`)}` : label(t)}</text>`);
  if (ax.title) out.push(`<text x="${bx + w / 2}" y="${by - 12}" fill="${c.ink}" font-size="14" font-weight="600" text-anchor="middle">${esc(tex(ax.title))}</text>`);
  if (ax.xlabel) out.push(`<text x="${bx + w / 2}" y="${by + h + 38}" fill="${c.ink}" font-size="12" text-anchor="middle">${esc(tex(ax.xlabel))}</text>`);
  if (ax.ylabel) out.push(`<text transform="translate(${bx - 44} ${by + h / 2}) rotate(-90)" fill="${c.ink}" font-size="12" text-anchor="middle">${esc(tex(ax.ylabel))}</text>`);
  const names = ax.legend ?? (ax.series.some((s) => s.label) ? ax.series.map((s, i) => s.label ?? `data${i + 1}`) : null);
  if (names?.length) {
    const lw = Math.max(...names.map((n) => n.length)) * 6.6 + 40, lh = names.length * 18 + 8;
    out.push(`<g transform="translate(${bx + w - lw - 8} ${by + 8})"><rect width="${lw}" height="${lh}" rx="6" fill="${c.ink === '#18181b' ? '#ffffff' : '#18181b'}" fill-opacity="0.92" stroke="${c.line}"/>`);
    names.forEach((n, i) => { const s = ax.series[i]; if (!s) return; const yy = 14 + i * 18; out.push(s.kind === 'bar' || s.kind === 'area' ? `<rect x="8" y="${yy - 6}" width="18" height="10" fill="${s.color}"/>` : `<line x1="8" y1="${yy - 1}" x2="26" y2="${yy - 1}" stroke="${s.color}" stroke-width="${s.dash === 'none' ? 0 : s.width}"${DASH[s.dash] ? ` stroke-dasharray="${DASH[s.dash]}"` : ''}/>${s.marker ? markerSvg(s.marker, 17, yy - 1, 3.5, s.color) : ''}`, `<text x="32" y="${yy + 3}" fill="${c.ink}" font-size="11">${esc(tex(n))}</text>`); });
    out.push('</g>');
  }
  return out.join('');
}
function decades(lo: number, hi: number) { const out: number[] = []; for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) out.push(10 ** e); return out; }
function markerSvg(m: string, x: number, y: number, r: number, color: string): string {
  const f = `fill="none" stroke="${color}" stroke-width="1.3"`;
  switch (m) {
    case 'o': return `<circle cx="${x}" cy="${y}" r="${r}" ${f}/>`;
    case '.': return `<circle cx="${x}" cy="${y}" r="${Math.max(1.5, r / 2.5)}" fill="${color}"/>`;
    case 's': return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" ${f}/>`;
    case 'd': return `<path d="M${x},${y - r} L${x + r},${y} L${x},${y + r} L${x - r},${y} Z" ${f}/>`;
    case '^': return `<path d="M${x},${y - r} L${x + r},${y + r} L${x - r},${y + r} Z" ${f}/>`;
    case 'v': return `<path d="M${x},${y + r} L${x + r},${y - r} L${x - r},${y - r} Z" ${f}/>`;
    case '+': return `<path d="M${x - r},${y} H${x + r} M${x},${y - r} V${y + r}" ${f}/>`;
    case 'x': return `<path d="M${x - r},${y - r} L${x + r},${y + r} M${x - r},${y + r} L${x + r},${y - r}" ${f}/>`;
    case '*': return `<path d="M${x - r},${y} H${x + r} M${x},${y - r} V${y + r} M${x - r * 0.7},${y - r * 0.7} L${x + r * 0.7},${y + r * 0.7} M${x - r * 0.7},${y + r * 0.7} L${x + r * 0.7},${y - r * 0.7}" ${f}/>`;
    default: return `<circle cx="${x}" cy="${y}" r="${r}" ${f}/>`;
  }
}

// ——— LaTeX: pgfplots, our own matlab2tikz ———

const texEsc = (s: string) => s.replace(/([#%&_{}])/g, '\\$1');
/** Labels keep $…$ maths as typed; plain x^2 becomes $x^2$. */
const texLabel = (s: string) => (/\$/.test(s) ? s : /[\\^_]/.test(s) ? `$${s}$` : texEsc(s));
const MARK: Record<string, string> = { o: 'o', '.': '*', '+': '+', '*': 'asterisk', x: 'x', s: 'square', d: 'diamond', '^': 'triangle', v: 'triangle', p: 'pentagon' };
const PGF_DASH: Record<string, string> = { '--': 'dashed', ':': 'dotted', '-.': 'dashdotted' };

/** The figure as a LaTeX tikzpicture with pgfplots (\usepackage{pgfplots}; subplots need \usepgfplotslibrary{groupplots}). */
export function toTikz(f: Figure): string {
  const colours = new Map<string, string>();
  const name = (hex: string) => { if (!colours.has(hex)) colours.set(hex, `uvcolor${colours.size + 1}`); return colours.get(hex)!; };
  const many = f.rows * f.cols > 1;
  const body: string[] = [];
  for (let p = 1; p <= f.rows * f.cols; p++) {
    const ax = f.axes.get(p);
    if (!ax && !many) continue;
    const opts: string[] = [];
    if (ax?.title) opts.push(`title={${texLabel(ax.title)}}`);
    if (ax?.xlabel) opts.push(`xlabel={${texLabel(ax.xlabel)}}`);
    if (ax?.ylabel) opts.push(`ylabel={${texLabel(ax.ylabel)}}`);
    if (ax?.grid) opts.push('grid=major');
    if (ax?.logx) opts.push('xmode=log');
    if (ax?.logy) opts.push('ymode=log');
    if (ax?.equal) opts.push('axis equal');
    if (ax?.xlim) opts.push(`xmin=${ax.xlim[0]}, xmax=${ax.xlim[1]}`);
    if (ax?.ylim) opts.push(`ymin=${ax.ylim[0]}, ymax=${ax.ylim[1]}`);
    if (ax?.series.some((s) => s.kind === 'bar')) opts.push('ybar', `bar width=${(barWidth(ax.series.find((s) => s.kind === 'bar')!.x) * 0.8 / ax.series.filter((s) => s.kind === 'bar').length).toPrecision(3)}`);
    const names = ax?.legend ?? (ax?.series.some((s) => s.label) ? ax.series.map((s, i) => s.label ?? `data${i + 1}`) : null);
    if (names?.length) opts.push('legend pos=north east', `legend style={font=\\small}`);
    const plots = (ax?.series ?? []).map((s) => {
      const o = [`color=${name(s.color)}`];
      if (s.kind === 'bar') o.push(`fill=${name(s.color)}`);
      if (s.kind === 'area') o.push(`fill=${name(s.color)}, fill opacity=0.25`);
      if (s.kind === 'stairs') o.push('const plot');
      if (s.kind === 'stem') o.push('ycomb');
      if (s.dash === 'none' && s.kind !== 'bar') o.push('only marks');
      else if (PGF_DASH[s.dash]) o.push(PGF_DASH[s.dash]);
      o.push(s.marker ? `mark=${MARK[s.marker] ?? '*'}` : 'mark=none');
      if (s.width !== 1.5 && s.kind !== 'bar') o.push(`line width=${(s.width * 0.5).toPrecision(2)}pt`);
      const pts = s.x.map((x, i) => (Number.isFinite(x) && Number.isFinite(s.y[i]) ? `(${+x.toPrecision(6)},${+s.y[i].toPrecision(6)})` : '\n')).join(' ').replace(/ ?\n ?/g, '\n');
      return `\\addplot[${o.join(', ')}] coordinates {\n${pts}\n};`;
    });
    const legend = names?.length ? [`\\legend{${names.map((n) => texLabel(n)).join(', ')}}`] : [];
    if (many) body.push(`\\nextgroupplot[${opts.join(', ')}]`, ...plots, ...legend);
    else body.push(`\\begin{axis}[\n  width=0.9\\textwidth, height=0.6\\textwidth,\n  ${opts.join(',\n  ')}\n]`, ...plots, ...legend, '\\end{axis}');
  }
  const defs = [...colours].map(([hex, n]) => `\\definecolor{${n}}{HTML}{${hex.slice(1).toUpperCase()}}`);
  const head = ['% Made with UniVerse Lab. Needs \\usepackage{pgfplots} and \\pgfplotsset{compat=1.18}' + (many ? ', plus \\usepgfplotslibrary{groupplots}.' : '.'), ...defs, '\\begin{tikzpicture}'];
  const group = many ? [`\\begin{groupplot}[group style={group size=${f.cols} by ${f.rows}, horizontal sep=2cm, vertical sep=2cm}, width=${(0.9 / f.cols).toFixed(2)}\\textwidth]`, ...body, '\\end{groupplot}'] : body;
  return [...head, ...group, '\\end{tikzpicture}', ''].join('\n');
}

export { BUILTINS };
