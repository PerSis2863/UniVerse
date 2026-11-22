import { LabError } from './parse';
import { mat, numel, scalar, toMat, type Mat, type Value } from './values';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { add, blankAxes, colour, esc, gfx, isPairName, label, markerSvg, outward, PALETTE, style, tex, ticks, vec, type Axes, type Box, type Ink, type Series } from './plot';

// Hyperion's other plot kinds (M381): text, errorbar, pie, fill / patch / rectangle, line, polarplot, boxplot,
// yyaxis, sgtitle, tick positions and names, xline / yline, and plots straight from a formula (fsurf, fmesh,
// fcontour, fimplicit, fplot3). Bars (stacked, horizontal) are in plot.ts with the other bars.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const lead = (a: Value[]) => { const out: Value[] = []; for (const v of a) { if (v.k === 'str') break; out.push(v); } return out; };
/** Adds to the current axes without starting afresh (line, patch, rectangle, text, xline and yline do this in MATLAB). */
const keep = (lab: Lab, s: Series[]) => { const ax = gfx(lab).axes(); ax.series.push(...s); gfx(lab).changed(); };
const nextOn = (ax: Axes) => PALETTE[(ax.series.length + ax.next) % PALETTE.length];

// ——— text ———
def('text', (a, _n, lab) => {
  const nums = lead(a);
  if (nums.length < 2 || nums.length === a.length) throw new LabError("text needs a place and the words: text(x, y, 'label').");
  const xs = vec(nums[0]), ys = vec(nums[1]), zs = nums[2] ? vec(nums[2]) : null;
  const what = a[nums.length];
  const words = what.k === 'cell' ? what.d.map((v) => textOf(v)) : [textOf(what)];
  let color: string | null = null, size = 11, align: 'start' | 'middle' | 'end' = 'start';
  for (let i = nums.length + 1; i < a.length - 1; i += 2) {
    const n = a[i].k === 'str' ? (a[i] as { v: string }).v.toLowerCase() : '';
    if (n === 'color') color = colour(a[i + 1]);
    else if (n === 'fontsize') size = Math.max(6, Math.min(48, scalar(a[i + 1]) * 1.1));
    else if (n === 'horizontalalignment') { const v = textOf(a[i + 1]).toLowerCase(); align = v === 'center' ? 'middle' : v === 'right' ? 'end' : 'start'; }
  }
  const ax = gfx(lab).axes();
  xs.forEach((x, i) => ax.texts.push({ x, y: ys[i] ?? ys[0], ...(zs ? { z: zs[i] ?? zs[0] } : {}), s: words[i] ?? words[0], color, size, align }));
  gfx(lab).changed();
  return [];
});

// ——— errorbar ———
def('errorbar', (a, _n, lab) => {
  const nums = lead(a).map((v) => vec(v));
  // errorbar(y, e), errorbar(x, y, e), errorbar(x, y, neg, pos)
  const [x, y, neg, pos] = nums.length === 2 ? [nums[0].map((_, i) => i + 1), nums[0], nums[1], nums[1]] : nums.length === 3 ? [nums[0], nums[1], nums[2], nums[2]] : nums.length >= 4 ? [nums[0], nums[1], nums[2], nums[3]] : [];
  if (!y) throw new LabError('errorbar needs the values and their errors: errorbar(x, y, err).');
  const fit = (e: number[]) => (e.length === 1 ? y.map(() => e[0]) : e);
  if ([x, fit(neg), fit(pos)].some((v) => v.length !== y.length)) throw new LabError('x, y and the errors must be the same length.');
  const ax = gfx(lab).axes();
  const s: Series = { kind: 'line', x, y, err: [fit(neg), fit(pos)], color: PALETTE[((ax.hold ? ax.series.length : 0) + ax.next) % PALETTE.length], dash: '', marker: null, width: 1.5, label: null, size: 6, ...style(a.slice(nums.length), {}) };
  add(lab, [s]);
  return [];
});

// ——— pie ———
def('pie pie3', (a, _n, lab) => {
  const v = vec(a[0]).map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  if (!v.some((x) => x > 0)) throw new LabError('pie needs some positive numbers.');
  let explode = v.map(() => false), labels: string[] = [];
  for (const arg of a.slice(1)) {
    if (arg.k === 'cell') labels = arg.d.map((x) => textOf(x));
    else if (arg.k === 'mat') { const e = [...arg.d]; explode = v.map((_, i) => !!(e[i] ?? 0)); }
  }
  add(lab, []);
  gfx(lab).axes().pie = { v, labels, explode };
  gfx(lab).changed();
  return [];
});

export function drawPie(ax: Axes, b: Box, c: Ink): string {
  const { v, labels, explode } = ax.pie!;
  const total = v.reduce((p, q) => p + q, 0), frac = total < 1 ? v : v.map((x) => x / total);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.max(20, Math.min(b.w, b.h) / 2 - 34);
  const out: string[] = [];
  let at = Math.PI / 2;
  frac.forEach((f, i) => {
    if (f <= 0) return;
    const a0 = at, a1 = at + f * 2 * Math.PI, mid = (a0 + a1) / 2;
    at = a1;
    const dx = explode[i] ? Math.cos(mid) * R * 0.1 : 0, dy = explode[i] ? -Math.sin(mid) * R * 0.1 : 0;
    const P = (t: number, r = R) => `${(cx + dx + r * Math.cos(t)).toFixed(2)},${(cy + dy - r * Math.sin(t)).toFixed(2)}`;
    const col = PALETTE[i % PALETTE.length];
    out.push(f >= 0.9999 ? `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${col}"/>` : `<path d="M${(cx + dx).toFixed(2)},${(cy + dy).toFixed(2)} L${P(a0)} A${R},${R} 0 ${f > 0.5 ? 1 : 0} 0 ${P(a1)} Z" fill="${col}" stroke="${c.bg}" stroke-width="1.5" stroke-linejoin="round"/>`);
    const text = labels[i] ?? (f * 100 < 1 ? '< 1%' : `${Math.round(f * 100)}%`);
    const lx = cx + dx + (R + 16) * Math.cos(mid), ly = cy + dy - (R + 16) * Math.sin(mid);
    out.push(`<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" fill="${c.ink}" font-size="12" text-anchor="${Math.cos(mid) > 0.15 ? 'start' : Math.cos(mid) < -0.15 ? 'end' : 'middle'}">${esc(tex(text))}</text>`);
  });
  if (ax.title) out.push(`<text x="${cx}" y="${b.y - 12}" fill="${c.ink}" font-size="14" font-weight="600" text-anchor="middle">${esc(tex(ax.title))}</text>`);
  return out.join('');
}
export function pieTikz(ax: Axes, name: (hex: string) => string, inGroup: boolean): string[] {
  if (inGroup) return ['% A pie chart is written out only when it is the figure’s one plot.'];
  const { v, labels, explode } = ax.pie!;
  const total = v.reduce((p, q) => p + q, 0), frac = total < 1 ? v : v.map((x) => x / total);
  const out: string[] = [];
  let at = 90;
  frac.forEach((f, i) => {
    if (f <= 0) return;
    const a0 = at, a1 = at + f * 360, mid = (a0 + a1) / 2;
    at = a1;
    const text = (labels[i] ?? `${f * 100 < 1 ? '$<$1' : Math.round(f * 100)}\\%`).replace(/%(?!$)/g, '\\%');
    out.push(`\\begin{scope}[shift={(${mid.toFixed(1)}:${explode[i] ? 0.3 : 0}cm)}]`, `\\fill[${name(PALETTE[i % PALETTE.length])}, draw=white, line width=1pt] (0,0) -- (${a0.toFixed(1)}:3cm) arc[start angle=${a0.toFixed(1)}, end angle=${a1.toFixed(1)}, radius=3cm] -- cycle;`, `\\node at (${mid.toFixed(1)}:3.6cm) {${text}};`, '\\end{scope}');
  });
  if (ax.title) out.push(`\\node[above, font=\\bfseries] at (0,3.9cm) {${ax.title}};`);
  return out;
}

// ——— fill, patch, rectangle, line ———
function shapeStyle(s: Series, rest: Value[]) {
  for (let i = 0; i < rest.length - 1; i++) {
    const n = rest[i]; if (n.k !== 'str') continue;
    const name = n.v.toLowerCase(), v = rest[i + 1];
    if (name === 'facecolor') { if (v.k === 'str' && /^none$/i.test(v.v)) s.fa = 0; else s.color = colour(v); i++; }
    else if (name === 'edgecolor') { s.edge = v.k === 'str' && /^none$/i.test(v.v) ? 'none' : colour(v); i++; }
    else if (name === 'facealpha') { s.fa = Math.max(0, Math.min(1, scalar(v))); i++; }
    else if (name === 'linewidth') { s.width = scalar(v); i++; }
    else if (name === 'linestyle') { const ls = textOf(v); s.dash = ls === '-' ? '' : (ls as Series['dash']); i++; }
  }
}
/** fill / patch input: x, y and a colour (a letter, a name, [r g b], or a number taken from the colour map). */
function polygons(a: Value[], lab: Lab): { list: Series[]; rest: Value[] } {
  const list: Series[] = [];
  let i = 0;
  const ax = gfx(lab).axes();
  while (i + 2 < a.length + 1 && a[i] && a[i].k !== 'str' && a[i + 1] && a[i + 1].k !== 'str' && a[i + 2]) {
    const X = toMat(a[i]), Y = toMat(a[i + 1]), C = a[i + 2];
    if (C.k === 'str' && isPairName(C)) break;
    i += 3;
    if (X.d.length !== Y.d.length) throw new LabError('x and y must be the same length.');
    // A matrix gives one shape per column.
    const cols = X.r > 1 && X.c > 1 ? X.c : 1, rows = X.d.length / cols;
    const x: number[] = [], y: number[] = [];
    for (let j = 0; j < cols; j++) { if (j) { x.push(NaN); y.push(NaN); } x.push(...X.d.subarray(j * rows, (j + 1) * rows)); y.push(...Y.d.subarray(j * rows, (j + 1) * rows)); }
    const byMap = C.k === 'mat' && numel(C) === 1;
    list.push({ kind: 'fill', x, y, color: byMap ? '#000000' : C.k === 'str' || numel(C) === 3 ? colour(C) : nextOn(ax), ...(byMap ? { level: scalar(C) } : {}), dash: '', marker: null, width: 0.8, label: null, size: 6 });
  }
  if (!list.length) throw new LabError("fill needs x, y and a colour: fill(x, y, 'g').");
  const rest = a.slice(i);
  for (const s of list) shapeStyle(s, rest);
  if (list.some((s) => s.level !== undefined)) { const lv = list.map((s) => s.level ?? 0); const r = [Math.min(...lv), Math.max(...lv)]; ax.zrange = r[0] === r[1] ? [r[0] - 1, r[1] + 1] : [r[0], r[1]]; }
  return { list, rest };
}
def('fill', (a, _n, lab) => { const { list } = polygons(a, lab); const ax = gfx(lab).axes(); const zr = ax.zrange; add(lab, list); gfx(lab).axes().zrange = zr; return []; });
def('patch', (a, _n, lab) => { keep(lab, polygons(a, lab).list); return []; });
def('rectangle', (a, _n, lab) => {
  let pos = [0, 0, 1, 1], curve = [0, 0];
  for (let i = 0; i < a.length - 1; i++) { const n = a[i]; if (n.k !== 'str') continue; if (/^position$/i.test(n.v)) pos = vec(a[i + 1]); else if (/^curvature$/i.test(n.v)) { const v = vec(a[i + 1]); curve = [v[0], v[1] ?? v[0]]; } }
  const [x, y, w, h] = pos;
  const rx = (Math.max(0, Math.min(1, curve[0])) * w) / 2, ry = (Math.max(0, Math.min(1, curve[1])) * h) / 2;
  const xs: number[] = [], ys: number[] = [];
  // Rounded corners as quarter ellipses (curvature [1 1] makes an ellipse).
  const corners: [number, number, number][] = [[x + w - rx, y + h - ry, 0], [x + rx, y + h - ry, Math.PI / 2], [x + rx, y + ry, Math.PI], [x + w - rx, y + ry, (3 * Math.PI) / 2]];
  for (const [cx, cy, a0] of corners) for (let k = 0; k <= 8; k++) { const t = a0 + (k / 8) * (Math.PI / 2); xs.push(cx + rx * Math.cos(t)); ys.push(cy + ry * Math.sin(t)); }
  const s: Series = { kind: 'fill', x: xs, y: ys, color: '#ffffff', fa: 0, edge: '#18181b', dash: '', marker: null, width: 1, label: null, size: 6 };
  shapeStyle(s, a);
  if (a.some((v, i) => v.k === 'str' && /^facecolor$/i.test(v.v) && !(a[i + 1]?.k === 'str' && /^none$/i.test(textOf(a[i + 1]))))) s.fa = s.fa === 0 ? 1 : s.fa;
  keep(lab, [s]);
  return [];
});
def('line', (a, _n, lab) => {
  const nums = lead(a);
  if (nums.length < 2) throw new LabError('line needs x and y: line([0 1], [0 1]).');
  const ax = gfx(lab).axes();
  const s: Series = { kind: 'line', x: vec(nums[0]), y: vec(nums[1]), ...(nums[2] ? { z: vec(nums[2]) } : {}), color: nextOn(ax), dash: '', marker: null, width: 1.5, label: null, size: 6, ...style(a.slice(nums.length), {}) };
  if (s.x.length !== s.y.length) throw new LabError('x and y must be the same length.');
  keep(lab, [s]);
  return [];
});

// ——— Polar plots ———
for (const [names, kind] of [['polarplot polar', 'line'], ['polarscatter', 'scatter']] as const) {
  def(names, (a, _n, lab) => {
    const nums = lead(a);
    if (nums.length < 2) throw new LabError(`${names.split(' ')[0]} needs angles (in radians) and distances: polarplot(theta, rho).`);
    const th = vec(nums[0]), rho = vec(nums[1]);
    if (th.length !== rho.length) throw new LabError('The angles and distances must be the same length.');
    const ax = gfx(lab).axes();
    const s: Series = { kind, x: th, y: rho, color: PALETTE[((ax.hold ? ax.series.length : 0) + ax.next) % PALETTE.length], dash: kind === 'scatter' ? 'none' : '', marker: kind === 'scatter' ? 'o' : null, width: 1.5, label: null, size: 6, ...style(a.slice(2), {}) };
    add(lab, [s]);
    gfx(lab).axes().polar = true;
    gfx(lab).changed();
    return [];
  });
}
def('rlim', (a, _n, lab) => { const v = vec(a[0]); gfx(lab).axes().ylim = [v[0], v[1]]; gfx(lab).changed(); return []; });

export function drawPolar(ax: Axes, b: Box, c: Ink): string {
  const rs = ax.series.flatMap((s) => s.y.filter((v) => Number.isFinite(v) && v >= 0));
  const rmax = ax.ylim?.[1] ?? outward(0, Math.max(1e-9, ...rs))[1];
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2 + 4, R = Math.max(20, Math.min(b.w, b.h) / 2 - 26);
  const P = (t: number, r: number) => [cx + (R * Math.min(r, rmax) * Math.cos(t)) / rmax, cy - (R * Math.min(r, rmax) * Math.sin(t)) / rmax];
  const out: string[] = [];
  const rt = ticks(0, rmax, 4).filter((t) => t > 0 && t <= rmax + 1e-12);
  for (const t of rt) out.push(`<circle cx="${cx}" cy="${cy}" r="${((R * t) / rmax).toFixed(2)}" fill="none" stroke="${c.line}" stroke-width="0.8"/>`);
  for (let d = 0; d < 360; d += 30) {
    const t = (d * Math.PI) / 180, [x, y] = P(t, rmax), [lx, ly] = [cx + (R + 14) * Math.cos(t), cy - (R + 14) * Math.sin(t)];
    out.push(`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${c.line}" stroke-width="0.8"/><text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" fill="${c.soft}" font-size="11" text-anchor="middle">${d}°</text>`);
  }
  out.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${c.soft}"/>`);
  for (const t of rt) { const [x, y] = P((80 * Math.PI) / 180, t); out.push(`<text x="${(x + 3).toFixed(1)}" y="${(y - 3).toFixed(1)}" fill="${c.soft}" font-size="10">${label(t)}</text>`); }
  for (const s of ax.series) {
    const pts = s.x.map((t, i) => (Number.isFinite(t) && Number.isFinite(s.y[i]) && s.y[i] >= 0 ? P(t, s.y[i]) : null));
    if (s.dash !== 'none') {
      let d = '', pen = false;
      for (const p of pts) { if (!p) { pen = false; continue; } d += `${pen ? ' L' : ' M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`; pen = true; }
      out.push(`<path d="${d.trim()}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linejoin="round"/>`);
    }
    if (s.marker) pts.forEach((p) => { if (p) out.push(markerSvg(s.marker!, p[0], p[1], s.size / 2 + 0.5, s.color, s.filled)); });
  }
  if (ax.title) out.push(`<text x="${cx}" y="${b.y - 12}" fill="${c.ink}" font-size="14" font-weight="600" text-anchor="middle">${esc(tex(ax.title))}</text>`);
  return out.join('');
}

// ——— boxplot ———
/** A percentile as MATLAB's boxplot takes it (points at (i − ½)/n, straight lines between, ends held). */
const pct = (sorted: number[], p: number) => {
  const n = sorted.length, pos = (p / 100) * n - 0.5;
  if (pos <= 0) return sorted[0];
  if (pos >= n - 1) return sorted[n - 1];
  const i = Math.floor(pos);
  return sorted[i] + (pos - i) * (sorted[i + 1] - sorted[i]);
};
def('boxplot', (a, _n, lab) => {
  const X = toMat(a[0]);
  let groups: { name: string; v: number[] }[];
  const second = a[1] && !(a[1].k === 'str' && isPairName(a[1])) && !(a[1].k === 'str' && /^labels$/i.test(a[1].v)) ? a[1] : null;
  if (second) {
    // boxplot(x, g): one box per group (numbers or names).
    const g = second.k === 'cell' ? second.d.map((v) => textOf(v)) : [...toMat(second).d].map(String);
    const order = [...new Set(g)];
    groups = order.map((name) => ({ name, v: [...X.d].filter((_, i) => g[i] === name) }));
  } else if (X.r === 1 || X.c === 1) groups = [{ name: '1', v: [...X.d] }];
  else groups = Array.from({ length: X.c }, (_, j) => ({ name: String(j + 1), v: [...X.d.subarray(j * X.r, (j + 1) * X.r)] }));
  const li = a.findIndex((v) => v.k === 'str' && /^labels$/i.test(v.v));
  if (li >= 0 && a[li + 1]?.k === 'cell') (a[li + 1] as { d: Value[] }).d.forEach((v, i) => { if (groups[i]) groups[i].name = textOf(v); });
  const out: Series[] = [];
  const blue = PALETTE[0], red = '#dc2626', grey = '#52525b';
  const base = { dash: '' as const, marker: null, width: 1, label: null, size: 6 };
  groups.forEach((g, k) => {
    const v = g.v.filter(Number.isFinite).sort((p, q) => p - q);
    if (!v.length) return;
    const x = k + 1, q1 = pct(v, 25), q2 = pct(v, 50), q3 = pct(v, 75), w = 1.5 * (q3 - q1);
    const inside = v.filter((t) => t >= q1 - w && t <= q3 + w), lo = inside[0] ?? q1, hi = inside[inside.length - 1] ?? q3;
    const bw = 0.25;
    out.push({ ...base, kind: 'fill', x: [x - bw, x + bw, x + bw, x - bw], y: [q1, q1, q3, q3], color: blue, fa: 0, edge: blue });
    out.push({ ...base, kind: 'line', x: [x - bw, x + bw], y: [q2, q2], color: red, width: 1.5 });
    out.push({ ...base, kind: 'line', x: [x, x, NaN, x, x, NaN, x - bw / 2, x + bw / 2, NaN, x - bw / 2, x + bw / 2], y: [q3, hi, NaN, q1, lo, NaN, hi, hi, NaN, lo, lo], color: grey, dash: '--' });
    const far = v.filter((t) => t < q1 - w || t > q3 + w);
    if (far.length) out.push({ ...base, kind: 'scatter', x: far.map(() => x), y: far, color: red, dash: 'none', marker: '+' });
  });
  add(lab, out);
  const ax = gfx(lab).axes();
  ax.xticks = groups.map((_, k) => k + 1);
  ax.xtl = groups.map((g) => g.name);
  ax.xlim = [0.5, groups.length + 0.5];
  gfx(lab).changed();
  return [];
});

// ——— Two y axes, figure titles, ticks, reference lines ———
def('yyaxis', (a, _n, lab) => {
  const g = gfx(lab), f = g.current ?? g.figure();
  let ax = f.axes.get(f.current);
  if (!ax) { ax = blankAxes(); f.axes.set(f.current, ax); }
  const side = a[0] ? textOf(a[0]).toLowerCase() : '';
  if (side !== 'left' && side !== 'right') throw new LabError('yyaxis is left or right.');
  ax.side = side;
  // The right side starts with the second colour, as MATLAB's does.
  if (side === 'right' && !ax.twin) ax.twin = { ...blankAxes(), next: 1 };
  g.changed();
  return [];
});
def('sgtitle suptitle', (a, _n, lab) => { const g = gfx(lab); (g.current ?? g.figure()).title = a[0] ? textOf(a[0]) : ''; g.changed(); return []; });
for (const axis of ['x', 'y', 'z'] as const) {
  def(`${axis}ticks`, (a, nout, lab) => {
    const ax = gfx(lab).axes();
    if (axis === 'z') return [];
    const key = axis === 'x' ? 'xticks' : 'yticks';
    if (a[0]?.k === 'str') ax[key] = null; // 'auto'
    else if (a[0]) ax[key] = [...new Set(vec(a[0]))].sort((p, q) => p - q);
    gfx(lab).changed();
    return nout > 0 || !a.length ? [mat(1, (ax[key] ?? []).length, ax[key] ?? [])] : [];
  });
  def(`${axis}ticklabels`, (a, _n, lab) => {
    const ax = gfx(lab).axes();
    if (axis === 'z') return [];
    const key = axis === 'x' ? 'xtl' : 'ytl';
    const v = a[0];
    ax[key] = !v || (v.k === 'str' && /^auto$/i.test(v.v)) ? null : v.k === 'cell' ? v.d.map((x) => textOf(x)) : v.k === 'str' ? v.v.split('|') : [...toMat(v).d].map((x) => label(x));
    gfx(lab).changed();
    return [];
  });
  def(`${axis}tickangle ${axis}tickformat`, () => []);
}
for (const axis of ['x', 'y'] as const) {
  // xline(v), xline(v, 'r--'), xline(v, ':', 'label'), with name–value pairs ('Color', 'LineWidth', 'Label').
  def(`${axis}line`, (a, _n, lab) => {
    if (!a[0]) throw new LabError(`${axis}line needs a value: ${axis}line(0).`);
    let spec: Partial<Series> = {}, name = '', i = 1;
    if (a[i]?.k === 'str' && !isPairName(a[i]) && /^[-:.rgbcmykw]{1,4}$/.test((a[i] as { v: string }).v)) spec = style([a[i++]], {});
    if (a[i] && (a[i].k === 'cell' || (a[i].k === 'str' && !isPairName(a[i]) && !/^label$/i.test((a[i] as { v: string }).v)))) { const v = a[i++]; name = v.k === 'cell' ? textOf(v.d[0]) : textOf(v); }
    const rest = a.slice(i), li = rest.findIndex((v) => v.k === 'str' && /^label$/i.test(v.v));
    if (li >= 0 && rest[li + 1]) name = textOf(rest[li + 1]);
    const pairs = style(rest.filter((_, k) => k !== li && k !== li + 1), {});
    const ax = gfx(lab).axes();
    for (const v of vec(a[0])) ax.refs.push({ axis, v, color: pairs.color ?? spec.color ?? '#52525b', dash: (pairs.dash ?? spec.dash) === 'none' ? '' : (pairs.dash ?? spec.dash ?? ''), label: name });
    gfx(lab).changed();
    return [];
  });
}
def('cla', (_a, _n, lab) => { const g = gfx(lab), f = g.current ?? g.figure(); f.axes.set(f.current, blankAxes()); g.changed(); return []; });

// ——— Plots straight from a formula ———
const limits = (a: Value | undefined, n: number): number[] => { const v = a && a.k === 'mat' ? [...a.d] : []; if (v.length >= n) return v; if (v.length === 2 && n === 4) return [v[0], v[1], v[0], v[1]]; return n === 4 ? [-5, 5, -5, 5] : [-5, 5]; };
/** f evaluated on a grid: called once with whole matrices when it handles them, otherwise point by point. */
function onGrid(lab: Lab, f: Value, lim: number[], n: number): Mat[] {
  const X = mat(n, n), Y = mat(n, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { X.d[j * n + i] = lim[0] + ((lim[1] - lim[0]) * j) / (n - 1); Y.d[j * n + i] = lim[2] + ((lim[3] - lim[2]) * i) / (n - 1); }
  let Z: Mat | null = null;
  try { const r = toMat(lab.callFn(f, [X, Y])[0]); if (r.d.length === n * n) Z = mat(n, n, r.d); } catch { Z = null; }
  if (!Z) { Z = mat(n, n); for (let k = 0; k < n * n; k++) Z.d[k] = scalar(lab.callFn(f, [mat(1, 1, [X.d[k]]), mat(1, 1, [Y.d[k]])])[0]); }
  return [X, Y, Z];
}
const fnArg = (v: Value | undefined, what: string) => { if (!v || v.k !== 'fn') throw new LabError(`${what} needs a function, like ${what}(@(x, y) x.^2 + y.^2).`); return v; };
def('fsurf ezsurf', (a, _n, lab) => BUILTINS.surf(onGrid(lab, fnArg(a[0], 'fsurf'), limits(a[1], 4), 35), 0, lab));
def('fmesh ezmesh', (a, _n, lab) => BUILTINS.mesh(onGrid(lab, fnArg(a[0], 'fmesh'), limits(a[1], 4), 35), 0, lab));
def('fcontour ezcontour', (a, _n, lab) => BUILTINS.contour(onGrid(lab, fnArg(a[0], 'fcontour'), limits(a[1], 4), 71), 0, lab));
def('fimplicit ezimplicit', (a, _n, lab) => {
  // The curve where f(x, y) = 0: the zero contour, in one colour.
  const g = onGrid(lab, fnArg(a[0], 'fimplicit'), limits(a[1], 4), 121);
  BUILTINS.contour([...g, mat(1, 2, [0, 0])], 0, lab);
  const ax = gfx(lab).axes();
  const colourNow = PALETTE[(ax.series.length - 1 + ax.next) % PALETTE.length];
  for (const s of ax.series.slice(-1)) { s.level = undefined; s.color = colourNow; s.width = 1.5; }
  ax.zrange = null;
  gfx(lab).changed();
  return [];
});
def('fplot3', (a, _n, lab) => {
  const [fx, fy, fz] = [0, 1, 2].map((k) => fnArg(a[k], 'fplot3'));
  const lim = limits(a[3], 2), n = 300;
  const t = Array.from({ length: n }, (_, k) => lim[0] + ((lim[1] - lim[0]) * k) / (n - 1));
  const at = (f: Value) => t.map((v) => scalar(lab.callFn(f, [mat(1, 1, [v])])[0]));
  return BUILTINS.plot3([mat(1, n, at(fx)), mat(1, n, at(fy)), mat(1, n, at(fz)), ...a.slice(a[3] && a[3].k === 'mat' ? 4 : 3)], 0, lab);
});
