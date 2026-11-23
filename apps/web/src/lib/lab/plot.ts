import { LabError } from './parse';
import { mat, numel, scalar, toMat, type Value } from './values';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { hexAt, mapOf } from './colormap';
import { colorbarSvg, contourLabels, crange, draw3d, gridTikz, imageSvg, is3d, labelTikz } from './plot3d';
import { drawPie, drawPolar, pieTikz } from './plot2d';

// Hyperion's figures (M375): plot, scatter, bar, stairs, stem, area, histogram, fplot, log axes, subplot, hold,
// titles, labels, legends, grids and limits, drawn as SVG (sharp at any size, light or dark), and written out as
// LaTeX pgfplots code (our own version of what matlab2tikz does for MATLAB figures). Our own colours, not MATLAB's.

export type Kind = 'line' | 'scatter' | 'bar' | 'barh' | 'stairs' | 'stem' | 'area' | 'fill';
/** A line or points; `z` makes it 3D (plot3, scatter3), `level` colours it from the colour map (contour lines), `cv`
 * colours each point (scatter with a colour per point); `value` is a contour line's level, for its labels (clabel). */
export interface Series { kind: Kind; x: number[]; y: number[]; z?: number[]; level?: number; value?: number; cv?: number[]; filled?: boolean; err?: [number[], number[]]; base?: number[]; edge?: string; fa?: number; color: string; dash: '' | '--' | ':' | '-.' | 'none'; marker: string | null; width: number; label: string | null; size: number }
/** A surface or mesh (x, y, z all r×c, column by column), or an image / filled contour (x: c column centres, y: r row
 * centres, z: r×c values; `direct` images index the colour map, `levels` band a filled contour, `rgb` holds a full-colour
 * picture's red, green and blue pages from 0 to 1, M382). */
export interface Grid { kind: 'surf' | 'mesh' | 'image' | 'filled'; r: number; c: number; x: number[]; y: number[]; z: number[]; cdata?: number[]; levels?: number[]; direct?: boolean; edges: boolean; alpha: number; smooth?: boolean; rgb?: number[] }
/** Text placed on the axes (text). */
export interface Note { x: number; y: number; z?: number; s: string; color: string | null; size: number; align: 'start' | 'middle' | 'end' }
/** A line across the whole axes at x = v or y = v (xline, yline). */
export interface Ref { axis: 'x' | 'y'; v: number; color: string; dash: Series['dash']; label: string }
export interface Axes { series: Series[]; grids: Grid[]; title: string; xlabel: string; ylabel: string; zlabel: string; legend: string[] | null; grid: boolean; hold: boolean; xlim: [number, number] | null; ylim: [number, number] | null; zlim: [number, number] | null; equal: boolean; logx: boolean; logy: boolean; next: number; view: [number, number] | null; colorbar: boolean; clim: [number, number] | null; zrange: [number, number] | null; revY: boolean; tight: [number, number, number, number] | null; lights: number[][]; lighting: 'flat' | 'gouraud' | 'none'; material: [number, number, number, number]; clabel: boolean;
  texts: Note[]; refs: Ref[]; pie: { v: number[]; labels: string[]; explode: boolean[] } | null; polar: boolean; twin: Axes | null; side: 'left' | 'right';
  xticks: number[] | null; yticks: number[] | null; xtl: string[] | null; ytl: string[] | null; visible: boolean }
export interface Figure { id: number; rows: number; cols: number; axes: Map<number, Axes>; current: number; name: string; cmap: number[][]; title: string }

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
    if (!f) { f = { id: id ?? (Math.max(0, ...this.figures.map((x) => x.id)) + 1), rows: 1, cols: 1, axes: new Map(), current: 1, name: '', cmap: mapOf('hyperion')!, title: '' }; this.figures.push(f); }
    this.current = f;
    return f;
  }
  axes(): Axes {
    const a = this.main();
    return a.side === 'right' && a.twin ? a.twin : a;
  }
  /** The axes itself, whichever side of yyaxis is chosen (titles, x labels and limits belong to it). */
  main(): Axes {
    const f = this.current ?? this.figure();
    let a = f.axes.get(f.current);
    if (!a) { a = blankAxes(); f.axes.set(f.current, a); }
    return a;
  }
  changed() { this.onChange?.(); }
}
export const blankAxes = (): Axes => ({ series: [], grids: [], title: '', xlabel: '', ylabel: '', zlabel: '', legend: null, grid: false, hold: false, xlim: null, ylim: null, zlim: null, equal: false, logx: false, logy: false, next: 0, view: null, colorbar: false, clim: null, zrange: null, revY: false, tight: null, lights: [], lighting: 'flat', material: [0.3, 0.6, 0.9, 10], clabel: false, texts: [], refs: [], pie: null, polar: false, twin: null, side: 'left', xticks: null, yticks: null, xtl: null, ytl: null, visible: true });

export const gfx = (lab: Lab): Graphics => {
  const g = lab.host.graphics;
  if (!(g instanceof Graphics)) throw new LabError('Figures aren’t available here.');
  return g;
};
export const vec = (v: Value) => [...toMat(v).d];
const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };

/** Line specs like 'r--o' or 'k:'; then name–value pairs ('LineWidth', 2, 'Color', 'g', 'DisplayName', 'data'). */
export function style(args: Value[], base: Partial<Series>): Partial<Series> {
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
export function colour(v: Value): string {
  if (v.k === 'str') return LETTER[v.v] ?? NAMED[v.v.toLowerCase()] ?? (/^#[0-9a-f]{6}$/i.test(v.v) ? v.v : PALETTE[0]);
  const d = vec(v).map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255));
  if (d.length !== 3) throw new LabError('A colour is a letter like \'r\', a name, or [r g b] from 0 to 1.');
  return `#${d.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
/** Adds series to the current axes (replacing them unless "hold on"). */
export function add(lab: Lab, list: Series[], grids: Grid[] = []) {
  const g = gfx(lab), a = g.axes();
  // A new plot starts the axes afresh, keeping hold and the two sides of yyaxis.
  if (!a.hold) { const keep = { hold: a.hold, twin: a.twin, side: a.side, next: a.next }; Object.assign(a, blankAxes(), keep); }
  for (const s of list) a.series.push(s);
  for (const s of grids) a.grids.push(s);
  g.changed();
}
export const nextColour = (lab: Lab) => { const a = gfx(lab).axes(); const n = (a.hold ? a.series.length : 0) + a.next; return PALETTE[n % PALETTE.length]; };

function seriesFrom(args: Value[], lab: Lab, kind: Kind): Series[] {
  // plot(y), plot(x, y), plot(x, y, spec, x2, y2, spec2, …), with a matrix y giving one line per column.
  const out: Series[] = [];
  let i = 0, n = (gfx(lab).axes().hold ? gfx(lab).axes().series.length : 0) + gfx(lab).axes().next;
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
export const isPairName = (v: Value) => v.k === 'str' && /^(linewidth|color|displayname|markersize|marker|linestyle|markerfacecolor|facecolor)$/i.test(v.v);

def('plot', (a, _n, lab) => { if (!a.length) throw new LabError('plot needs something to draw, like plot(x, y).'); add(lab, seriesFrom(a, lab, 'line')); return []; });
def('scatter', (a, _n, lab) => { const s = seriesFrom(a.slice(0, 2), lab, 'scatter'); points(s, a.slice(2)); add(lab, s); return []; });
/** scatter's size, colour (one, or a value per point from the colour map) and 'filled'. */
export function points(s: Series[], a: Value[]) {
  const nums = a.filter((v, i) => v.k !== 'str' && a.slice(0, i).every((w) => w.k !== 'str'));
  const st = style(a.filter((v) => v.k === 'str' && !/^filled$/i.test(v.v)), {});
  s.forEach((x) => Object.assign(x, st));
  if (nums[0] && numel(nums[0]) === 1) s.forEach((x) => { x.size = Math.sqrt(scalar(nums[0])); });
  if (nums[1]) { const c = vec(nums[1]); if (c.length === 3 && s[0]?.x.length !== 3) s.forEach((x) => { x.color = colour(nums[1]); }); else if (c.length === s[0]?.x.length) s.forEach((x) => { x.cv = c; }); }
  if (a.some((v) => v.k === 'str' && /^filled$/i.test(v.v))) s.forEach((x) => { x.filled = true; });
}
/** bar / barh: a matrix gives a group per row; 'stacked' piles them (negative parts below zero, as MATLAB does). */
for (const kind of ['bar', 'barh'] as const) {
  def(kind, (a, _n, lab) => {
    const stacked = a.some((v) => v.k === 'str' && /^stacked$/i.test(v.v));
    const args = a.filter((v) => !(v.k === 'str' && /^(stacked|grouped|hist|histc)$/i.test(v.v)));
    // A lone number after the data is the bars' width (taken as given: drawn at 0.8).
    const clean = args.filter((v, i) => !(i > 0 && v.k === 'mat' && numel(v) === 1 && args[i - 1].k === 'mat' && numel(args[i - 1]) > 1));
    const list = seriesFrom(clean, lab, kind).map((s) => ({ ...s, dash: 'none' as const, marker: null }));
    if (stacked && list.length > 1) {
      const up = list[0].y.map(() => 0), down = list[0].y.map(() => 0);
      for (const s of list) s.base = s.y.map((v, i) => { const b = v >= 0 ? up[i] : down[i]; if (v >= 0) up[i] += v; else down[i] += v; return b; });
    }
    add(lab, list);
    return [];
  });
}
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
const text = (key: 'title' | 'xlabel' | 'ylabel' | 'zlabel') => (a: Value[], _n: number, lab: Lab) => { (key === 'ylabel' ? gfx(lab).axes() : gfx(lab).main())[key] = a[0] ? textOf(a[0]) : ''; gfx(lab).changed(); return []; };
BUILTINS.title = text('title'); BUILTINS.xlabel = text('xlabel'); BUILTINS.ylabel = text('ylabel'); BUILTINS.zlabel = text('zlabel');
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
def('zlim', (a, _n, lab) => { const v = vec(a[0]); gfx(lab).axes().zlim = [v[0], v[1]]; gfx(lab).changed(); return []; });
def('axis', (a, _n, lab) => {
  const ax = gfx(lab).axes();
  for (const v of a) {
    if (v.k === 'str') {
      const w = v.v.toLowerCase();
      if (w === 'equal' || w === 'square' || w === 'image') ax.equal = true;
      else if (w === 'ij') ax.revY = true;
      else if (w === 'off' || w === 'on') ax.visible = w === 'on';
      else if (w === 'xy') ax.revY = false;
      else if (w === 'tight' || w === 'auto' || w === 'normal') { ax.xlim = null; ax.ylim = null; ax.zlim = null; ax.equal = false; }
    } else { const d = vec(v); if (d.length >= 4) { ax.xlim = [d[0], d[1]]; ax.ylim = [d[2], d[3]]; } if (d.length >= 6) ax.zlim = [d[4], d[5]]; }
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
def('gca', (_a, _n, lab) => [mat(1, 1, [gfx(lab).current?.id ?? gfx(lab).figure().id])]);
def('set', (a, _n, lab) => {
  // set(gca, 'XLim', [0 10], 'YGrid', 'on', …): limits and grids change the current axes.
  // shortcut: other properties (FontSize, LineWidth…) are accepted and change nothing yet.
  const ax = gfx(lab).axes();
  for (let i = 1; i + 1 < a.length; i += 2) {
    const k = a[i].k === 'str' ? (a[i] as { v: string }).v.toLowerCase() : '', v = a[i + 1];
    if (k === 'xlim' || k === 'ylim' || k === 'zlim') { const x = vec(v); ax[k] = [x[0], x[1]]; }
    else if (k === 'xgrid' || k === 'ygrid' || k === 'zgrid') ax.grid = onOff([v], true);
  }
  gfx(lab).changed();
  return [];
});


// ——— Drawing: ticks, then SVG ———

/** "Nice" tick positions covering [lo, hi] (steps of 1, 2 or 5 × 10ⁿ). */
export function ticks(lo: number, hi: number, want = 6): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / want, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 5, 10].map((m) => m * mag).find((s) => (hi - lo) / s <= want) ?? 10 * mag;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + step * 1e-9; t += step) out.push(+t.toPrecision(12));
  return out;
}
export const label = (t: number) => { const a = Math.abs(t); return a !== 0 && (a >= 1e5 || a < 1e-3) ? t.toExponential(1).replace('e+', 'e') : String(+t.toPrecision(6)); };
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** A little TeX in labels: x^2, x_1 and Greek names (\alpha), as Unicode. */
export function tex(s: string): string {
  const greek: Record<string, string> = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω', Delta: 'Δ', Omega: 'Ω', Sigma: 'Σ', infty: '∞', pm: '±', cdot: '·', times: '×', leq: '≤', geq: '≥', circ: '°' };
  const sup: Record<string, string> = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', '+': '⁺', n: 'ⁿ' };
  const sub: Record<string, string> = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
  return s.replace(/\\([A-Za-z]+)/g, (m, w: string) => greek[w] ?? m)
    .replace(/\^\{([^}]*)\}|\^(.)/g, (m, g: string | undefined, c: string | undefined) => [...(g ?? c ?? '')].map((ch) => sup[ch] ?? ch).join(''))
    .replace(/_\{([^}]*)\}|_(.)/g, (m, g: string | undefined, c: string | undefined) => [...(g ?? c ?? '')].map((ch) => sub[ch] ?? ch).join(''));
}

export interface Box { x: number; y: number; w: number; h: number }
/** `uid` keeps each drawing's clip names its own (two figures on one page must not share them). */
export interface Ink { ink: string; soft: string; line: string; bg: string; uid?: string }
let drawings = 0;
const DASH: Record<string, string> = { '': '', '--': '6 4', ':': '1.5 3', '-.': '6 3 1.5 3', none: '' };

/** One figure as SVG text, `width` × `height` pixels. */
export function renderSvg(f: Figure, width: number, height: number, dark = false): string {
  const ink = dark ? '#e4e4e7' : '#18181b', soft = dark ? '#a1a1aa' : '#52525b', line = dark ? '#3f3f46' : '#d4d4d8', bg = dark ? '#18181b' : '#ffffff';
  const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Inter, system-ui, sans-serif"><rect width="${width}" height="${height}" fill="${bg}"/>`];
  const head = f.title ? 30 : 0;
  if (f.title) parts.push(`<text x="${width / 2}" y="21" fill="${ink}" font-size="15" font-weight="600" text-anchor="middle">${esc(tex(f.title))}</text>`);
  const cw = width / f.cols, ch = (height - head) / f.rows;
  for (let p = 1; p <= f.rows * f.cols; p++) {
    const ax = f.axes.get(p);
    if (!ax) continue;
    const col = (p - 1) % f.cols, rowi = Math.floor((p - 1) / f.cols), y0 = head + rowi * ch;
    // 3D axes, pies and polar plots keep their labels inside, so they take the whole cell.
    const three = is3d(ax), round = !!ax.pie || ax.polar, top = ax.title ? 34 : 16, right = ax.twin ? 52 : 0;
    const box: Box = three || round ? { x: col * cw + 12, y: y0 + top, w: cw - 24 - (ax.colorbar ? 56 : 0), h: ch - top - 8 } : { x: col * cw + 58, y: y0 + top, w: cw - 58 - 18 - right - (ax.colorbar ? 64 : 0), h: ch - top - (ax.xlabel ? 52 : 34) };
    if (box.w < 40 || box.h < 40) continue;
    const c: Ink = { ink, soft, line, bg, uid: `f${++drawings}` };
    if (ax.pie) parts.push(drawPie(ax, box, c));
    else if (ax.polar) parts.push(drawPolar(ax, box, c));
    else if (three) parts.push(draw3d(ax, box, c, f.cmap));
    else if (ax.twin) {
      // yyaxis: both sides share x; the right side's numbers and name sit on the right.
      const a = extent(ax).x, b = extent(ax.twin).x, xr: [number, number] = ax.xlim ?? [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
      parts.push(drawAxes(ax, box, c, f.cmap, { xr }), drawAxes(ax.twin, box, c, f.cmap, { xr, right: true }));
    } else parts.push(drawAxes(ax, box, c, f.cmap));
  }
  parts.push('</svg>');
  return parts.join('');
}

export function extent(ax: Axes): { x: [number, number]; y: [number, number] } {
  const fin = (v: number, log: boolean) => Number.isFinite(v) && (!log || v > 0);
  const rx: number[] = [], ry: number[] = [];
  for (const s of ax.series) {
    const tops = s.y.map((v, i) => v + (s.base?.[i] ?? 0));
    // Horizontal bars: positions go up the y axis, lengths along x.
    if (s.kind === 'barh') { ry.push(...s.x); rx.push(0, ...tops, ...(s.base ?? [])); continue; }
    rx.push(...s.x); ry.push(...tops, ...(s.base ?? []));
    if (s.err) s.y.forEach((v, i) => ry.push(v - s.err![0][i], v + s.err![1][i]));
  }
  const xs = rx.filter((v) => fin(v, ax.logx)), ys = ry.filter((v) => fin(v, ax.logy));
  if (ax.series.some((s) => s.kind === 'bar' || s.kind === 'area' || s.kind === 'stem')) ys.push(0);
  const span = (v: number[], log: boolean): [number, number] => {
    if (!v.length) return [0, 1];
    let lo = Math.min(...v), hi = Math.max(...v);
    if (lo === hi) { lo -= log ? lo / 2 : 1; hi += log ? hi : 1; }
    return [lo, hi];
  };
  if (ax.tight) {
    const [a0, a1, b0, b1] = ax.tight;
    return { x: ax.xlim ?? [Math.min(a0, ...xs), Math.max(a1, ...xs)], y: ax.ylim ?? [Math.min(b0, ...ys), Math.max(b1, ...ys)] };
  }
  let x = ax.xlim ?? span(xs, ax.logx), y = ax.ylim ?? span(ys, ax.logy);
  // Bars need half a bar of room at each end.
  const bars = ax.series.filter((s) => s.kind === 'bar');
  if (bars.length && !ax.xlim) { const gap = barWidth(bars[0].x); x = [x[0] - gap / 2, x[1] + gap / 2]; }
  const hbars = ax.series.filter((s) => s.kind === 'barh');
  if (hbars.length && !ax.ylim) { const gap = barWidth(hbars[0].x); y = [y[0] - gap / 2, y[1] + gap / 2]; if (!ax.xlim) x = outward(x[0], x[1]); return { x, y }; }
  // y rounds out to the next tidy numbers (as MATLAB's automatic limits do); x stays tight to the data for lines,
  // with a little room for scatter points.
  if (!ax.ylim && !ax.logy) y = outward(y[0], y[1]);
  if (!ax.xlim && !ax.logx && ax.series.some((s) => s.kind === 'scatter')) x = outward(x[0], x[1]);
  return { x, y };
}
export function outward(lo: number, hi: number): [number, number] {
  const t = ticks(lo, hi), step = t.length > 1 ? t[1] - t[0] : 1;
  return [Math.floor(lo / step + 1e-9) * step, Math.ceil(hi / step - 1e-9) * step];
}
const barWidth = (x: number[]) => (x.length > 1 ? Math.min(...x.slice(1).map((v, i) => v - x[i]).filter((d) => d > 0)) : 1);

function drawAxes(ax: Axes, b: Box, c: Ink, cmap: number[][], o: { xr?: [number, number]; right?: boolean } = {}): string {
  const e = extent(ax);
  const [x0, x1] = o.xr ?? e.x, [y0, y1] = e.y;
  let { w, h } = b; const { x: bx, y: by } = b;
  if (ax.equal) { const sx = w / (x1 - x0), sy = h / (y1 - y0), s = Math.min(sx, sy); w = (x1 - x0) * s; h = (y1 - y0) * s; }
  const lx = (v: number) => (ax.logx ? Math.log10(v) : v), ly = (v: number) => (ax.logy ? Math.log10(v) : v);
  const X = (v: number) => bx + ((lx(v) - lx(x0)) / (lx(x1) - lx(x0) || 1)) * w;
  const Y = (v: number) => (ax.revY ? by + ((ly(v) - ly(y0)) / (ly(y1) - ly(y0) || 1)) * h : by + h - ((ly(v) - ly(y0)) / (ly(y1) - ly(y0) || 1)) * h);
  const [c0, c1] = crange(ax);
  const out: string[] = [];
  const xt = ax.xticks ?? (ax.logx ? decades(x0, x1) : ticks(x0, x1)), yt = ax.yticks ?? (ax.logy ? decades(y0, y1) : ticks(y0, y1));
  const show = ax.visible, main = !o.right;
  const id = `${c.uid ?? 'c'}_${Math.round(bx)}_${Math.round(by)}${o.right ? 'r' : ''}`;
  out.push(`<defs><clipPath id="${id}"><rect x="${bx}" y="${by}" width="${w}" height="${h}"/></clipPath></defs>`);
  if (ax.grid && show) {
    if (main) for (const t of xt) if (t >= x0 && t <= x1) out.push(`<line x1="${X(t)}" y1="${by}" x2="${X(t)}" y2="${by + h}" stroke="${c.line}" stroke-width="0.8"/>`);
    for (const t of yt) if (t >= y0 && t <= y1) out.push(`<line x1="${bx}" y1="${Y(t)}" x2="${bx + w}" y2="${Y(t)}" stroke="${c.line}" stroke-width="0.8"/>`);
  }
  out.push(`<g clip-path="url(#${id})">`);
  for (const g of ax.grids) out.push(imageSvg(g, X, Y, cmap, c0, c1));
  // Grouped bars sit side by side; stacked bars (with a base) share their place.
  const grouped = (k: Kind) => ax.series.filter((s) => s.kind === k && !s.base);
  ax.series.forEach((s0) => {
    const s = s0.level !== undefined ? { ...s0, color: hexAt(cmap, c0, c1, s0.level) } : s0;
    const ok = (x: number, y: number) => Number.isFinite(x) && Number.isFinite(y) && (!ax.logx || x > 0) && (!ax.logy || y > 0);
    const pts = s.x.map((x, i) => [x, s.y[i]] as const).filter(([x, y]) => ok(x, y));
    const dash = DASH[s.dash] ? ` stroke-dasharray="${DASH[s.dash]}"` : '';
    if (s.kind === 'bar' || s.kind === 'barh') {
      const g = grouped(s.kind), k = Math.max(0, g.indexOf(s0)), n = s.base ? 1 : g.length || 1, full = barWidth(s.x) * 0.8, bw = full / n;
      s.x.forEach((p, i) => {
        const len = s.y[i], from = s.base?.[i] ?? 0;
        if (!Number.isFinite(p) || !Number.isFinite(len)) return;
        const a = p - full / 2 + k * bw, z = a + bw, lo = Math.min(from, from + len), hi = Math.max(from, from + len);
        const r = s.kind === 'bar' ? { x: X(a), y: Y(hi), w: X(z) - X(a), h: Y(lo) - Y(hi) } : { x: X(lo), y: Y(z), w: X(hi) - X(lo), h: Y(a) - Y(z) };
        out.push(`<rect x="${r.x}" y="${Math.min(r.y, r.y + r.h)}" width="${Math.max(0.5, Math.abs(r.w))}" height="${Math.max(0, Math.abs(r.h))}" fill="${s.color}" fill-opacity="0.85"/>`);
      });
      return;
    }
    if (s.kind === 'fill') {
      // Each NaN-separated run is one shape.
      const shapes: string[] = []; let cur = '';
      s.x.forEach((x, i) => { if (!ok(x, s.y[i])) { if (cur) shapes.push(`${cur} Z`); cur = ''; return; } cur += `${cur ? ' L' : 'M'}${X(x).toFixed(2)},${Y(s.y[i]).toFixed(2)}`; });
      if (cur) shapes.push(`${cur} Z`);
      const edge = s.edge ?? c.ink;
      out.push(`<path d="${shapes.join(' ')}" fill="${s.color}" fill-opacity="${s.fa ?? 1}" stroke="${edge}" stroke-width="${edge === 'none' ? 0 : s.width}" stroke-linejoin="round"${dash}/>`);
      return;
    }
    if (s.kind === 'area' && pts.length) out.push(`<path d="M${X(pts[0][0])},${Y(0)} ${pts.map(([x, y]) => `L${X(x)},${Y(y)}`).join(' ')} L${X(pts[pts.length - 1][0])},${Y(0)} Z" fill="${s.color}" fill-opacity="0.25"/>`);
    if (s.kind === 'stem') for (const [x, y] of pts) out.push(`<line x1="${X(x)}" y1="${Y(0)}" x2="${X(x)}" y2="${Y(y)}" stroke="${s.color}" stroke-width="${s.width}"/>`);
    if (s.err) s.x.forEach((x, i) => {
      const y = s.y[i], lo = y - s.err![0][i], hi = y + s.err![1][i];
      if (!ok(x, y) || !Number.isFinite(lo) || !Number.isFinite(hi)) return;
      const px = X(x);
      out.push(`<path d="M${px},${Y(lo)} V${Y(hi)} M${px - 4},${Y(lo)} H${px + 4} M${px - 4},${Y(hi)} H${px + 4}" stroke="${s.color}" stroke-width="1" fill="none"/>`);
    });
    if (s.dash !== 'none' && s.kind !== 'stem' && pts.length > 1) {
      // A NaN breaks the line, as in MATLAB.
      const runs: string[] = []; let cur = '';
      s.x.forEach((x, i) => { const y = s.y[i]; if (!Number.isFinite(x) || !Number.isFinite(y)) { if (cur) runs.push(cur); cur = ''; return; } if (s.kind === 'stairs' && cur) cur += ` H${X(x)}`; cur += `${cur ? ' L' : 'M'}${X(x).toFixed(2)},${Y(y).toFixed(2)}`; });
      if (cur) runs.push(cur);
      out.push(`<path d="${runs.join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linejoin="round" stroke-linecap="round"${dash}/>`);
    }
    if (s.marker) s.x.forEach((x, i) => { const y = s.y[i]; if (!ok(x, y)) return; const col = s.cv ? hexAt(cmap, c0, c1, s.cv[i]) : s.color; out.push(markerSvg(s.marker!, X(x), Y(y), s.size / 2 + 0.5, col, s.filled)); });
  });
  if (ax.clabel) out.push(contourLabels(ax, X, Y, c));
  for (const r of ax.refs) {
    const d = DASH[r.dash] ? ` stroke-dasharray="${DASH[r.dash]}"` : '';
    if (r.axis === 'x') out.push(`<line x1="${X(r.v)}" y1="${by}" x2="${X(r.v)}" y2="${by + h}" stroke="${r.color}" stroke-width="1.2"${d}/>${r.label ? `<text transform="translate(${X(r.v) - 4} ${by + 6}) rotate(-90)" text-anchor="end" font-size="11" fill="${r.color}">${esc(tex(r.label))}</text>` : ''}`);
    else out.push(`<line x1="${bx}" y1="${Y(r.v)}" x2="${bx + w}" y2="${Y(r.v)}" stroke="${r.color}" stroke-width="1.2"${d}/>${r.label ? `<text x="${bx + w - 6}" y="${Y(r.v) - 5}" text-anchor="end" font-size="11" fill="${r.color}">${esc(tex(r.label))}</text>` : ''}`);
  }
  out.push('</g>');
  for (const t of ax.texts) out.push(`<text x="${X(t.x)}" y="${Y(t.y) + t.size * 0.35}" fill="${t.color ?? c.ink}" font-size="${t.size}" text-anchor="${t.align}">${esc(tex(t.s))}</text>`);
  const tickText = (t: number, i: number, log: boolean, names: string[] | null) => esc(names ? (names[i] ?? '') : log ? `10${tex(`^{${Math.round(Math.log10(t))}}`)}` : label(t));
  if (show) {
    if (main) {
      out.push(`<rect x="${bx}" y="${by}" width="${w}" height="${h}" fill="none" stroke="${c.soft}" stroke-width="1"/>`);
      xt.forEach((t, i) => { if (t >= x0 - 1e-12 && t <= x1 + 1e-12) out.push(`<line x1="${X(t)}" y1="${by + h}" x2="${X(t)}" y2="${by + h - 5}" stroke="${c.soft}"/><text x="${X(t)}" y="${by + h + 16}" fill="${c.soft}" font-size="11" text-anchor="middle">${tickText(t, i, ax.logx, ax.xtl)}</text>`); });
    }
    const edge = o.right ? bx + w : bx, inward = o.right ? -5 : 5;
    yt.forEach((t, i) => { if (t >= y0 - 1e-12 && t <= y1 + 1e-12) out.push(`<line x1="${edge}" y1="${Y(t)}" x2="${edge + inward}" y2="${Y(t)}" stroke="${c.soft}"/><text x="${o.right ? edge + 7 : edge - 7}" y="${Y(t) + 4}" fill="${c.soft}" font-size="11" text-anchor="${o.right ? 'start' : 'end'}">${tickText(t, i, ax.logy, ax.ytl)}</text>`); });
    if (main && ax.xlabel) out.push(`<text x="${bx + w / 2}" y="${by + h + 38}" fill="${c.ink}" font-size="12" text-anchor="middle">${esc(tex(ax.xlabel))}</text>`);
    if (ax.ylabel) out.push(`<text transform="translate(${o.right ? edge + 46 : edge - 44} ${by + h / 2}) rotate(${o.right ? 90 : -90})" fill="${c.ink}" font-size="12" text-anchor="middle">${esc(tex(ax.ylabel))}</text>`);
  }
  if (ax.title) out.push(`<text x="${bx + w / 2}" y="${by - 12}" fill="${c.ink}" font-size="14" font-weight="600" text-anchor="middle">${esc(tex(ax.title))}</text>`);
  if (ax.colorbar && main) out.push(colorbarSvg({ x: bx + w + 14, y: by, w: 14, h }, cmap, c0, c1, c));
  const names = ax.legend ?? (ax.series.some((s) => s.label) ? ax.series.map((s, i) => s.label ?? `data${i + 1}`) : null);
  if (names?.length && main) {
    const lw = Math.max(...names.map((n) => n.length)) * 6.6 + 40, lh = names.length * 18 + 8;
    out.push(`<g transform="translate(${bx + w - lw - 8} ${by + 8})"><rect width="${lw}" height="${lh}" rx="6" fill="${c.bg}" fill-opacity="0.92" stroke="${c.line}"/>`);
    names.forEach((n, i) => { const s = ax.series[i]; if (!s) return; const yy = 14 + i * 18; out.push(s.kind === 'bar' || s.kind === 'barh' || s.kind === 'area' || s.kind === 'fill' ? `<rect x="8" y="${yy - 6}" width="18" height="10" fill="${s.color}"/>` : `<line x1="8" y1="${yy - 1}" x2="26" y2="${yy - 1}" stroke="${s.color}" stroke-width="${s.dash === 'none' ? 0 : s.width}"${DASH[s.dash] ? ` stroke-dasharray="${DASH[s.dash]}"` : ''}/>${s.marker ? markerSvg(s.marker, 17, yy - 1, 3.5, s.color) : ''}`, `<text x="32" y="${yy + 3}" fill="${c.ink}" font-size="11">${esc(tex(n))}</text>`); });
    out.push('</g>');
  }
  return out.join('');
}
export function decades(lo: number, hi: number) { const out: number[] = []; for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) out.push(10 ** e); return out; }
export function markerSvg(m: string, x: number, y: number, r: number, color: string, filled = false): string {
  const f = `fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="1.3"`;
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

/** One axes' pgfplots options and plots (shared by both sides of yyaxis). */
function axisTikz(ax: Axes, f: Figure, name: (hex: string) => string) {
  const opts: string[] = [];
  if (ax.title) opts.push(`title={${texLabel(ax.title)}}`);
  if (ax.xlabel) opts.push(`xlabel={${texLabel(ax.xlabel)}}`);
  if (ax.ylabel) opts.push(`ylabel={${texLabel(ax.ylabel)}}`);
  if (ax.grid) opts.push('grid=major');
  if (ax.logx) opts.push('xmode=log');
  if (ax.logy) opts.push('ymode=log');
  if (ax.equal) opts.push('axis equal');
  if (!ax.visible) opts.push('hide axis');
  if (ax.xlim) opts.push(`xmin=${ax.xlim[0]}, xmax=${ax.xlim[1]}`);
  if (ax.ylim) opts.push(`ymin=${ax.ylim[0]}, ymax=${ax.ylim[1]}`);
  const list = (v: number[]) => v.map((t) => +t.toPrecision(6)).join(',');
  if (ax.xticks) opts.push(`xtick={${list(ax.xticks)}}`);
  if (ax.yticks) opts.push(`ytick={${list(ax.yticks)}}`);
  if (ax.xtl) opts.push(`xticklabels={${ax.xtl.map((t) => `{${texLabel(t)}}`).join(',')}}`);
  if (ax.ytl) opts.push(`yticklabels={${ax.ytl.map((t) => `{${texLabel(t)}}`).join(',')}}`);
  const three = is3d(ax), [c0, c1] = crange(ax);
  if (three) { const [az, el] = ax.view ?? [-37.5, 30]; opts.push(`view={${az}}{${el}}`); if (ax.zlabel) opts.push(`zlabel={${texLabel(ax.zlabel)}}`); if (ax.zlim) opts.push(`zmin=${ax.zlim[0]}, zmax=${ax.zlim[1]}`); }
  if (ax.revY) opts.push('y dir=reverse');
  if (ax.tight) opts.push('enlargelimits=false', 'axis on top');
  if (ax.grids.length || ax.series.some((s) => s.cv || s.level !== undefined)) {
    opts.push(`colormap={uvmap}{${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => { const row = f.cmap[Math.round((k / 8) * (f.cmap.length - 1))]; return `rgb255=(${row.map((v) => Math.round(v * 255)).join(',')})`; }).join(' ')}}`, `point meta min=${+c0.toPrecision(6)}, point meta max=${+c1.toPrecision(6)}`);
    if (ax.colorbar) opts.push('colorbar');
  }
  for (const k of ['bar', 'barh'] as const) {
    const bars = ax.series.filter((s) => s.kind === k);
    if (!bars.length) continue;
    const stacked = bars.some((s) => s.base);
    opts.push(`${k === 'bar' ? 'ybar' : 'xbar'}${stacked ? ' stacked' : ''}`, `bar width=${(barWidth(bars[0].x) * 0.8 / (stacked ? 1 : bars.length)).toPrecision(3)}`);
  }
  const names = ax.legend ?? (ax.series.some((s) => s.label) ? ax.series.map((s, i) => s.label ?? `data${i + 1}`) : null);
  if (names?.length) opts.push('legend pos=north east', `legend style={font=\\small}`);
  const p = (v: number) => +v.toPrecision(6);
  const plots = [...ax.grids.map((g) => gridTikz(g, three)), ...ax.series.map((s0) => {
    const s = s0.level !== undefined ? { ...s0, color: hexAt(f.cmap, c0, c1, s0.level) } : s0;
    const o = [`color=${name(s.color)}`];
    if (s.kind === 'bar' || s.kind === 'barh') o.push(`fill=${name(s.color)}`);
    if (s.kind === 'area') o.push(`fill=${name(s.color)}, fill opacity=0.25`);
    if (s.kind === 'fill') { o[0] = s.edge === 'none' ? 'draw=none' : `draw=${name(s.edge ?? '#18181b')}`; o.push(`fill=${name(s.color)}`); if ((s.fa ?? 1) < 1) o.push(`fill opacity=${s.fa}`); }
    if (s.kind === 'stairs') o.push('const plot');
    if (s.kind === 'stem') o.push('ycomb');
    if (s.dash === 'none' && s.kind !== 'bar' && s.kind !== 'barh') o.push('only marks');
    else if (PGF_DASH[s.dash]) o.push(PGF_DASH[s.dash]);
    o.push(s.marker ? `mark=${MARK[s.marker] ?? '*'}` : 'mark=none');
    if (s.width !== 1.5 && s.kind !== 'bar' && s.kind !== 'barh') o.push(`line width=${(s.width * 0.5).toPrecision(2)}pt`);
    if (s.cv) o.push('scatter, scatter src=explicit');
    if (s.filled) o.push(`fill=${name(s.color)}`);
    if (s.err) o.push('error bars/.cd, y dir=both, y explicit');
    const z = s.z ?? (three ? s.x.map(() => 0) : null);
    const pts = s.x.map((x, i) => {
      const y = s.y[i];
      if (!Number.isFinite(x) || !Number.isFinite(y) || (z && !Number.isFinite(z[i]))) return '\n';
      // xbar wants (length, position).
      const at = s.kind === 'barh' ? `(${p(y)},${p(x)})` : ax.polar ? `(${p((x * 180) / Math.PI)},${p(y)})` : `(${p(x)},${p(y)}${z ? `,${p(z[i])}` : ''})`;
      const err = s.err ? (s.err[0][i] === s.err[1][i] ? ` +- (0,${p(s.err[1][i])})` : ` += (0,${p(s.err[1][i])}) -= (0,${p(s.err[0][i])})`) : '';
      return `${at}${err}${s.cv ? ` [${p(s.cv[i])}]` : ''}`;
    }).join(' ').replace(/ ?\n ?/g, '\n').replace(/\n+/g, '\n\n').trim();
    return `\\addplot${z ? '3' : ''}[${o.join(', ')}] coordinates {\n${pts}\n}${s.kind === 'fill' ? ' -- cycle' : ''};`;
  })];
  if (ax.clabel) plots.push(...labelTikz(ax));
  for (const t of ax.texts) plots.push(`\\node[${t.align === 'start' ? 'anchor=west' : t.align === 'end' ? 'anchor=east' : 'anchor=center'}${t.color ? `, text=${name(t.color)}` : ''}] at (axis cs:${p(t.x)},${p(t.y)}${t.z !== undefined ? `,${p(t.z)}` : ''}) {${texLabel(t.s)}};`);
  for (const r of ax.refs) {
    const style = [name(r.color), ...(PGF_DASH[r.dash] ? [PGF_DASH[r.dash]] : [])].join(', ');
    plots.push(r.axis === 'x' ? `\\draw[${style}] ({axis cs:${p(r.v)},0}|-{rel axis cs:0,0}) -- ({axis cs:${p(r.v)},0}|-{rel axis cs:0,1});` : `\\draw[${style}] ({rel axis cs:0,0}|-{axis cs:0,${p(r.v)}}) -- ({rel axis cs:1,0}|-{axis cs:0,${p(r.v)}});`);
  }
  const legend = names?.length ? [`\\legend{${names.map((n) => texLabel(n)).join(', ')}}`] : [];
  return { opts, plots, legend };
}

/** The figure as a LaTeX tikzpicture with pgfplots (\usepackage{pgfplots}; subplots need \usepgfplotslibrary{groupplots}). */
export function toTikz(f: Figure): string {
  const colours = new Map<string, string>();
  const name = (hex: string) => { if (!colours.has(hex)) colours.set(hex, `uvcolor${colours.size + 1}`); return colours.get(hex)!; };
  const many = f.rows * f.cols > 1;
  const body: string[] = [];
  let polar = false;
  for (let p = 1; p <= f.rows * f.cols; p++) {
    const ax = f.axes.get(p);
    if (!ax) { if (many) body.push('\\nextgroupplot'); continue; }
    if (ax.pie) { body.push(many ? '\\nextgroupplot[hide axis]' : '', ...pieTikz(ax, name, many)); continue; }
    const { opts, plots, legend } = axisTikz(ax, f, name);
    if (ax.polar) polar = true;
    if (many) { body.push(`\\nextgroupplot[${opts.join(', ')}]`, ...plots, ...legend); continue; }
    const env = ax.polar ? 'polaraxis' : 'axis';
    const xr = ax.twin ? (() => { const a = extent(ax).x, b = extent(ax.twin).x; return ax.xlim ?? [Math.min(a[0], b[0]), Math.max(a[1], b[1])]; })() : null;
    const shared = xr ? [`xmin=${+xr[0].toPrecision(6)}, xmax=${+xr[1].toPrecision(6)}`, 'axis y line*=left'] : [];
    body.push(`\\begin{${env}}[\n  width=0.9\\textwidth, height=0.6\\textwidth,\n  ${[...opts, ...shared].join(',\n  ')}\n]`, ...plots, ...legend, `\\end{${env}}`);
    if (ax.twin && xr) {
      // yyaxis: the right side as a second axis over the same x range.
      const t = axisTikz(ax.twin, f, name);
      body.push(`\\begin{axis}[\n  width=0.9\\textwidth, height=0.6\\textwidth,\n  ${[...t.opts, `xmin=${+xr[0].toPrecision(6)}, xmax=${+xr[1].toPrecision(6)}`, 'axis y line*=right', 'axis x line=none'].join(',\n  ')}\n]`, ...t.plots, '\\end{axis}');
    }
  }
  const defs = [...colours].map(([hex, n]) => `\\definecolor{${n}}{HTML}{${hex.slice(1).toUpperCase()}}`);
  const libs = [many ? '\\usepgfplotslibrary{groupplots}' : '', polar ? '\\usepgfplotslibrary{polar}' : ''].filter(Boolean);
  const head = ['% Made with Hyperion. Needs \\usepackage{pgfplots} and \\pgfplotsset{compat=1.18}' + (libs.length ? `, plus ${libs.join(' and ')}.` : '.'), ...defs, '\\begin{tikzpicture}'];
  const group = many ? [`\\begin{groupplot}[group style={group size=${f.cols} by ${f.rows}, horizontal sep=2cm, vertical sep=2cm}, width=${(0.9 / f.cols).toFixed(2)}\\textwidth]`, ...body, '\\end{groupplot}'] : body;
  const title = f.title ? [`\\node[above, font=\\bfseries] at (current bounding box.north) {${texLabel(f.title)}};`] : [];
  return [...head, ...group.filter((l) => l !== ''), ...title, '\\end{tikzpicture}', ''].join('\n');
}

export { BUILTINS };
