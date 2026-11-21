import { LabError } from './parse';
import { mat, numel, scalar, toMat, type Mat, type Value } from './values';
import { BUILTINS, type Builtin } from './builtins';
import { textOf } from './interp';
import { add, colour, esc, gfx, isPairName, label, markerSvg, outward, PALETTE, points, style, tex, ticks, vec, type Axes, type Box, type Grid, type Ink, type Series } from './plot';
import { hexAt, MAP_NAMES, mapOf, png, rgbAt } from './colormap';

// UniVerse Lab's 3D plots and images (M379): surf, mesh, plot3, scatter3, contour, contourf, imagesc, image, pcolor,
// colour maps and colour bars, view and shading. Surfaces are drawn as SVG faces sorted far to near (each face whole,
// so it stays sharp at any size); images and filled contours as a small PNG inside the SVG.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const finite = (v: number[]) => v.filter(Number.isFinite);
const minmax = (v: number[]): [number, number] | null => { let lo = Infinity, hi = -Infinity; for (const x of v) if (Number.isFinite(x)) { if (x < lo) lo = x; if (x > hi) hi = x; } return lo <= hi ? [lo, hi] : null; };

/** Whether the axes are drawn in 3D: surfaces, 3D lines, or a turned view. */
export const is3d = (ax: Axes) => ax.grids.some((g) => g.kind === 'surf' || g.kind === 'mesh') || ax.series.some((s) => s.z) || (!!ax.view && !(ax.view[0] === 0 && ax.view[1] === 90));

/** The colour scale: clim / caxis, or the range of everything coloured by value. */
export function crange(ax: Axes): [number, number] {
  if (ax.clim) return ax.clim;
  const vals: number[] = [];
  for (const g of ax.grids) if (!g.direct) { const r = minmax(g.cdata ?? g.z); if (r) vals.push(...r); }
  for (const s of ax.series) { if (s.cv) { const r = minmax(s.cv); if (r) vals.push(...r); } if (s.level !== undefined) vals.push(s.level); }
  if (ax.zrange) vals.push(...ax.zrange);
  const r = minmax(vals);
  return r ? (r[0] === r[1] ? [r[0] - 1, r[1] + 1] : r) : [0, 1];
}

// ——— Images and filled contours (2D) ———

/** An image or filled contour as an <image> holding a PNG, placed on the axes. */
export function imageSvg(g: Grid, X: (v: number) => number, Y: (v: number) => number, cmap: number[][], c0: number, c1: number): string {
  if (g.kind !== 'image' && g.kind !== 'filled') return '';
  const half = (v: number[]) => (v.length > 1 ? (v[v.length - 1] - v[0]) / (v.length - 1) / 2 : 0.5);
  const hx = half(g.x), hy = half(g.y);
  const left = X(g.x[0] - hx), right = X(g.x[g.c - 1] + hx), top = Y(g.y[0] - hy), bottom = Y(g.y[g.r - 1] + hy);
  // Rows go top to bottom on screen: flip them when the first row is drawn lowest (y up, as with contourf).
  const flip = top > bottom;
  const up = g.kind === 'filled' ? Math.max(1, Math.min(6, Math.floor(200 / Math.max(g.r, g.c)))) : 1;
  const W = g.kind === 'filled' ? (g.c - 1) * up + 1 : g.c, H = g.kind === 'filled' ? (g.r - 1) * up + 1 : g.r;
  const px = new Uint8Array(W * H * 4);
  const levels = g.levels ?? [];
  const band = (v: number) => { let k = 0; while (k < levels.length && v >= levels[k]) k++; const lo = k ? levels[k - 1] : c0, hi = k < levels.length ? levels[k] : c1; return (lo + hi) / 2; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const row = flip ? H - 1 - y : y;
    let v: number;
    if (g.kind === 'filled') {
      // Bilinear between the four nearest values, then the band it falls in.
      const fi = row / up, fj = x / up, i = Math.min(g.r - 2, Math.floor(fi)), j = Math.min(g.c - 2, Math.floor(fj)), ti = fi - i, tj = fj - j;
      const z = (a: number, b: number) => g.z[(j + b) * g.r + i + a];
      v = band((z(0, 0) * (1 - tj) + z(0, 1) * tj) * (1 - ti) + (z(1, 0) * (1 - tj) + z(1, 1) * tj) * ti);
    } else v = g.z[x * g.r + row];
    const rgb = g.direct ? (Number.isFinite(v) ? cmap[Math.max(0, Math.min(cmap.length - 1, Math.round(v) - 1))].map((t) => Math.round(t * 255)) : null) : rgbAt(cmap, c0, c1, v);
    if (!rgb) continue;
    const o = (y * W + x) * 4;
    px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = Math.round(g.alpha * 255);
  }
  const [x0, x1] = [Math.min(left, right), Math.max(left, right)], [y0, y1] = [Math.min(top, bottom), Math.max(top, bottom)];
  // For a filled contour the pixel centres sit on the data points, so the picture spans exactly the data.
  const [fx0, fx1, fy0, fy1] = g.kind === 'filled' ? [X(g.x[0]), X(g.x[g.c - 1]), Y(g.y[0]), Y(g.y[g.r - 1])] : [x0, x1, y0, y1];
  const ix = Math.min(fx0, fx1), iy = Math.min(fy0, fy1), iw = Math.abs(fx1 - fx0), ih = Math.abs(fy1 - fy0);
  return `<image x="${ix.toFixed(2)}" y="${iy.toFixed(2)}" width="${iw.toFixed(2)}" height="${ih.toFixed(2)}" preserveAspectRatio="none"${g.kind === 'image' ? ' style="image-rendering:pixelated"' : ''} href="${png(W, H, px)}"/>`;
}

/** A colour bar in `b` with its scale on the right. */
export function colorbarSvg(b: Box, cmap: number[][], c0: number, c1: number, c: Ink): string {
  const px = new Uint8Array(cmap.length * 4);
  cmap.forEach((row, k) => { const o = (cmap.length - 1 - k) * 4; px[o] = Math.round(row[0] * 255); px[o + 1] = Math.round(row[1] * 255); px[o + 2] = Math.round(row[2] * 255); px[o + 3] = 255; });
  const out = [`<image x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" preserveAspectRatio="none" href="${png(1, cmap.length, px)}"/>`, `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="${c.soft}"/>`];
  for (const t of ticks(c0, c1, 6)) {
    if (t < c0 - 1e-12 || t > c1 + 1e-12) continue;
    const y = b.y + b.h - ((t - c0) / (c1 - c0 || 1)) * b.h;
    out.push(`<line x1="${b.x + b.w}" y1="${y}" x2="${b.x + b.w + 4}" y2="${y}" stroke="${c.soft}"/><text x="${b.x + b.w + 7}" y="${y + 4}" fill="${c.soft}" font-size="11">${label(t)}</text>`);
  }
  return out.join('');
}

// ——— 3D ———

const ZS = 0.8; // the box's height against its width and depth (both 2)

export function draw3d(ax: Axes, b: Box, c: Ink, cmap: number[][]): string {
  const surfs = ax.grids.filter((g) => g.kind === 'surf' || g.kind === 'mesh');
  const lines = ax.series;
  const all = (pick: (g: Grid) => number[], pickS: (s: Series) => number[]) => [...surfs.flatMap((g) => finite(pick(g))), ...lines.flatMap((s) => finite(pickS(s)))];
  const span = (v: number[], lim: [number, number] | null): [number, number] => {
    if (lim) return lim;
    const r = minmax(v);
    if (!r) return [0, 1];
    return r[0] === r[1] ? outward(r[0] - 1, r[1] + 1) : outward(r[0], r[1]);
  };
  const [x0, x1] = span(all((g) => g.x, (s) => s.x), ax.xlim), [y0, y1] = span(all((g) => g.y, (s) => s.y), ax.ylim), [z0, z1] = span(all((g) => g.z, (s) => s.z ?? [0]), ax.zlim);
  const [cl0, cl1] = crange(ax);
  const [az, el] = (ax.view ?? [-37.5, 30]).map((d) => (d * Math.PI) / 180);
  const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
  // MATLAB's own viewing transform: az turns about z from −y, el lifts the eye.
  const proj = (x: number, y: number, z: number) => [ca * x + sa * y, -se * sa * x + se * ca * y + ce * z, ce * sa * x - ce * ca * y + se * z];
  const nx = (v: number) => ((v - x0) / (x1 - x0 || 1)) * 2 - 1, ny = (v: number) => ((v - y0) / (y1 - y0 || 1)) * 2 - 1, nz = (v: number) => (((v - z0) / (z1 - z0 || 1)) * 2 - 1) * ZS;
  const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-ZS, ZS].map((z) => proj(x, y, z))));
  const sx = corners.map((p) => p[0]), sy = corners.map((p) => p[1]);
  const pad = Math.min(34, Math.max(14, b.w * 0.09));
  const scale = Math.min((b.w - 2 * pad) / (Math.max(...sx) - Math.min(...sx) || 1), (b.h - 2 * pad) / (Math.max(...sy) - Math.min(...sy) || 1));
  const cx = b.x + b.w / 2 - (scale * (Math.max(...sx) + Math.min(...sx))) / 2, cy = b.y + b.h / 2 + (scale * (Math.max(...sy) + Math.min(...sy))) / 2;
  /** A normalised point (−1…1, −1…1, −ZS…ZS) on screen: [x, y, depth] (bigger depth is nearer). */
  const S = (x: number, y: number, z: number) => { const p = proj(x, y, z); return [cx + scale * p[0], cy - scale * p[1], p[2]]; };
  const f2 = (n: number) => n.toFixed(1);
  const pt = (p: number[]) => `${f2(p[0])},${f2(p[1])}`;
  const out: string[] = [];

  // The three walls at the back, with grid lines at the ticks.
  const xb = ce * sa <= 0 ? 1 : -1, yb = ca * ce >= 0 ? 1 : -1, zb = se >= 0 ? -ZS : ZS;
  const xt = ticks(x0, x1, 5).filter((t) => t >= x0 - 1e-9 && t <= x1 + 1e-9), yt = ticks(y0, y1, 5).filter((t) => t >= y0 - 1e-9 && t <= y1 + 1e-9), zt = ticks(z0, z1, 5).filter((t) => t >= z0 - 1e-9 && t <= z1 + 1e-9);
  const wall = (pts: number[][]) => `<path d="M${pts.map(pt).join(' L')} Z" fill="${c.bg}" stroke="${c.line}" stroke-width="0.8"/>`;
  const seg = (a: number[], q: number[]) => `M${pt(a)} L${pt(q)}`;
  out.push(wall([S(-1, -1, zb), S(1, -1, zb), S(1, 1, zb), S(-1, 1, zb)]), wall([S(xb, -1, -ZS), S(xb, 1, -ZS), S(xb, 1, ZS), S(xb, -1, ZS)]), wall([S(-1, yb, -ZS), S(1, yb, -ZS), S(1, yb, ZS), S(-1, yb, ZS)]));
  const gl: string[] = [];
  for (const t of xt) { const v = nx(t); gl.push(seg(S(v, -1, zb), S(v, 1, zb)), seg(S(v, yb, -ZS), S(v, yb, ZS))); }
  for (const t of yt) { const v = ny(t); gl.push(seg(S(-1, v, zb), S(1, v, zb)), seg(S(xb, v, -ZS), S(xb, v, ZS))); }
  for (const t of zt) { const v = nz(t); gl.push(seg(S(xb, -1, v), S(xb, 1, v)), seg(S(-1, yb, v), S(1, yb, v))); }
  out.push(`<path d="${gl.join(' ')}" fill="none" stroke="${c.line}" stroke-width="0.6"/>`);

  // Surfaces: every face, far ones first (at most ~90 × 90 faces a surface; bigger ones are sampled).
  const faces: { d: number; s: string }[] = [];
  for (const g of surfs) {
    const pick = (n: number) => { const step = Math.max(1, Math.ceil((n - 1) / 90)); const idx: number[] = []; for (let k = 0; k < n - 1; k += step) idx.push(k); idx.push(n - 1); return idx; };
    const ri = pick(g.r), cj = pick(g.c);
    const zv = (k: number) => { const z = g.z[k]; return ax.zlim && (z < ax.zlim[0] || z > ax.zlim[1]) ? NaN : z; };
    const P = new Map<number, number[]>();
    const at = (k: number) => { let p = P.get(k); if (!p) { p = S(nx(g.x[k]), ny(g.y[k]), nz(zv(k))); P.set(k, p); } return p; };
    const cv = g.cdata ?? g.z;
    for (let a = 0; a < cj.length - 1; a++) for (let q = 0; q < ri.length - 1; q++) {
      const ks = [cj[a] * g.r + ri[q], cj[a + 1] * g.r + ri[q], cj[a + 1] * g.r + ri[q + 1], cj[a] * g.r + ri[q + 1]];
      if (ks.some((k) => !Number.isFinite(zv(k)) || !Number.isFinite(g.x[k]) || !Number.isFinite(g.y[k]))) continue;
      const ps = ks.map(at);
      const d = (ps[0][2] + ps[1][2] + ps[2][2] + ps[3][2]) / 4;
      const col = hexAt(cmap, cl0, cl1, (cv[ks[0]] + cv[ks[1]] + cv[ks[2]] + cv[ks[3]]) / 4);
      const path = `M${ps.map(pt).join(' L')} Z`;
      const alpha = g.alpha < 1 ? ` fill-opacity="${g.alpha}"` : '';
      faces.push({ d, s: g.kind === 'mesh' ? `<path d="${path}" fill="${c.bg}" stroke="${col}"/>` : g.edges ? `<path d="${path}" fill="${col}"${alpha} stroke="#18181b" stroke-opacity="0.35"/>` : `<path d="${path}" fill="${col}"${alpha} stroke="${col}"/>` });
    }
  }
  faces.sort((p, q) => p.d - q.d);
  if (faces.length) out.push(`<g stroke-width="0.5" stroke-linejoin="round">${faces.map((f) => f.s).join('')}</g>`);

  // Lines and points in 3D (drawn over the surfaces).
  for (const s0 of lines) {
    const s = s0.level !== undefined ? { ...s0, color: hexAt(cmap, cl0, cl1, s0.level) } : s0;
    const z = s.z ?? s.x.map(() => z0);
    const ps = s.x.map((x, i) => (Number.isFinite(x) && Number.isFinite(s.y[i]) && Number.isFinite(z[i]) ? S(nx(x), ny(s.y[i]), nz(z[i])) : null));
    if (s.dash !== 'none') {
      let d = '', pen = false;
      for (const p of ps) { if (!p) { pen = false; continue; } d += `${pen ? ' L' : ' M'}${pt(p)}`; pen = true; }
      out.push(`<path d="${d.trim()}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linejoin="round" stroke-linecap="round"/>`);
    }
    if (s.marker) ps.forEach((p, i) => { if (p) out.push(markerSvg(s.marker!, p[0], p[1], s.size / 2 + 0.5, s.cv ? hexAt(cmap, cl0, cl1, s.cv[i]) : s.color, s.filled)); });
  }

  // The axes' edges at the front, their ticks and names.
  const fy = -yb, fx = -xb;
  out.push(`<path d="${seg(S(-1, fy, zb), S(1, fy, zb))} ${seg(S(fx, -1, zb), S(fx, 1, zb))}" stroke="${c.soft}" fill="none"/>`);
  const txt = (p: number[], s: string, anchor = 'middle', size = 11, fill = c.soft) => `<text x="${f2(p[0])}" y="${f2(p[1] + 4)}" fill="${fill}" font-size="${size}" text-anchor="${anchor}">${s}</text>`;
  const side = (p: number[]) => (p[0] < cx - 4 ? 'end' : p[0] > cx + 4 ? 'start' : 'middle');
  for (const t of xt) { const p = S(nx(t), fy * 1.16, zb); out.push(txt(p, label(t), side(p))); }
  for (const t of yt) { const p = S(fx * 1.16, ny(t), zb); out.push(txt(p, label(t), side(p))); }
  // z on the vertical edge furthest left on screen.
  const edge = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => ({ x, y, sx: S(x, y, 0)[0] })).sort((p, q) => p.sx - q.sx)[0];
  if (Math.abs(ce) > 0.05) {
    out.push(`<path d="${seg(S(edge.x, edge.y, -ZS), S(edge.x, edge.y, ZS))}" stroke="${c.soft}" fill="none"/>`);
    for (const t of zt) { const p = S(edge.x, edge.y, nz(t)); out.push(txt([p[0] - 8, p[1]], label(t), 'end')); }
  }
  if (ax.xlabel) { const p = S(0, fy * 1.42, zb); out.push(txt(p, esc(tex(ax.xlabel)), side(p), 12, c.ink)); }
  if (ax.ylabel) { const p = S(fx * 1.42, 0, zb); out.push(txt(p, esc(tex(ax.ylabel)), side(p), 12, c.ink)); }
  if (ax.zlabel && Math.abs(ce) > 0.05) { const p = S(edge.x, edge.y, 0); out.push(`<text transform="translate(${f2(p[0] - 44)} ${f2(p[1])}) rotate(-90)" fill="${c.ink}" font-size="12" text-anchor="middle">${esc(tex(ax.zlabel))}</text>`); }
  if (ax.title) out.push(`<text x="${b.x + b.w / 2}" y="${b.y - 12}" fill="${c.ink}" font-size="14" font-weight="600" text-anchor="middle">${esc(tex(ax.title))}</text>`);
  if (ax.colorbar) out.push(colorbarSvg({ x: b.x + b.w + 14, y: b.y + pad, w: 14, h: b.h - 2 * pad }, cmap, cl0, cl1, c));
  return out.join('');
}

// ——— LaTeX for grids ———

export function gridTikz(g: Grid, three: boolean): string {
  const p = (v: number) => (Number.isFinite(v) ? +v.toPrecision(6) : NaN);
  if (g.kind === 'surf' || g.kind === 'mesh') {
    // One scan line per column of the grid, blank lines between them (pgfplots' own layout).
    const cols = Array.from({ length: g.c }, (_, j) => Array.from({ length: g.r }, (_, i) => { const k = j * g.r + i; return `(${p(g.x[k])},${p(g.y[k])},${p(g.z[k])})`; }).join(' '));
    const o = g.kind === 'mesh' ? 'mesh' : `surf, shader=${g.edges ? 'faceted' : 'flat'}`;
    return `\\addplot3[${o}${three ? '' : ', view={0}{90}'}${g.alpha < 1 ? `, opacity=${g.alpha}` : ''}] coordinates {\n${cols.join('\n\n')}\n};`;
  }
  // Images and filled contours: a matrix plot, one cell per value (x varies along each row).
  const rows = Array.from({ length: g.r }, (_, i) => Array.from({ length: g.c }, (_, j) => `(${p(g.x[j])},${p(g.y[i])}) [${p(g.z[j * g.r + i])}]`).join(' '));
  return `\\addplot[matrix plot*, point meta=explicit, mesh/cols=${g.c}] coordinates {\n${rows.join('\n')}\n};`;
}

// ——— Commands ———

const leading = (a: Value[]) => { const out: Mat[] = []; for (const v of a) { if (v.k === 'str') break; out.push(toMat(v)); } return out; };
const isVec = (m: Mat) => m.r === 1 || m.c === 1;

/** surf / mesh / contour input: Z, or X, Y, Z with X and Y as vectors or full grids. */
function surface(nums: Mat[], what: string): Pick<Grid, 'r' | 'c' | 'x' | 'y' | 'z'> {
  const Z = nums.length >= 3 ? nums[2] : nums[0];
  if (!Z || Z.r < 2 || Z.c < 2) throw new LabError(`${what} needs a matrix Z of at least 2×2, like ${what}(peaks(30)).`);
  const r = Z.r, c = Z.c, x = new Array<number>(r * c), y = new Array<number>(r * c);
  const X = nums.length >= 3 ? nums[0] : null, Y = nums.length >= 3 ? nums[1] : null;
  if (X && !(isVec(X) ? X.d.length === c : X.r === r && X.c === c)) throw new LabError(`X must have ${c} values (one per column of Z) or be the same size as Z.`);
  if (Y && !(isVec(Y) ? Y.d.length === r : Y.r === r && Y.c === c)) throw new LabError(`Y must have ${r} values (one per row of Z) or be the same size as Z.`);
  for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) {
    const k = j * r + i;
    x[k] = X ? (isVec(X) ? X.d[j] : X.d[k]) : j + 1;
    y[k] = Y ? (isVec(Y) ? Y.d[i] : Y.d[k]) : i + 1;
  }
  return { r, c, x, y, z: [...Z.d] };
}
/** Options after the data: 'EdgeColor', 'none'; 'FaceAlpha', 0.5. */
function faceOpts(rest: Value[]) {
  let edges = true, alpha = 1;
  for (let i = 0; i < rest.length - 1; i++) {
    const n = rest[i]; if (n.k !== 'str') continue;
    if (/^edgecolor$/i.test(n.v)) { edges = !(rest[i + 1].k === 'str' && /^none$/i.test(textOf(rest[i + 1]))); i++; }
    else if (/^(facealpha|alpha)$/i.test(n.v)) { alpha = Math.max(0, Math.min(1, scalar(rest[i + 1]))); i++; }
  }
  return { edges, alpha };
}

for (const [names, kind] of [['surf surfc surface', 'surf'], ['mesh meshc meshz waterfall', 'mesh']] as const) {
  def(names, (a, _n, lab) => {
    const nums = leading(a);
    const g = surface(nums, kind);
    const cdata = nums.length === 4 && nums[3].d.length === g.z.length ? [...nums[3].d] : nums.length === 2 && nums[1].d.length === g.z.length ? [...nums[1].d] : undefined;
    add(lab, [], [{ kind, ...g, cdata, ...faceOpts(a.slice(nums.length)) }]);
    return [];
  });
}

def('plot3', (a, _n, lab) => {
  const ax = gfx(lab).axes();
  let i = 0, n = ax.hold ? ax.series.length : 0;
  const out: Series[] = [];
  while (i + 2 < a.length && a[i].k !== 'str' && a[i + 1].k !== 'str' && a[i + 2].k !== 'str') {
    const x = vec(a[i]), y = vec(a[i + 1]), z = vec(a[i + 2]);
    i += 3;
    if (x.length !== y.length || y.length !== z.length) throw new LabError(`x, y and z must be the same length (got ${x.length}, ${y.length} and ${z.length}).`);
    const spec = a[i]?.k === 'str' && !isPairName(a[i]) ? [a[i++]] : [];
    out.push({ kind: 'line', x, y, z, color: PALETTE[n++ % PALETTE.length], dash: '', marker: null, width: 1.5, label: null, size: 6, ...style(spec, {}) } as Series);
  }
  if (!out.length) throw new LabError('plot3 needs x, y and z, like plot3(cos(t), sin(t), t).');
  const rest = a.slice(i);
  if (rest.length) { const st = style(rest, {}); for (const s of out) Object.assign(s, st); }
  add(lab, out);
  return [];
});
def('scatter3', (a, _n, lab) => {
  if (a.length < 3) throw new LabError('scatter3 needs x, y and z.');
  const x = vec(a[0]), y = vec(a[1]), z = vec(a[2]);
  if (x.length !== y.length || y.length !== z.length) throw new LabError('x, y and z must be the same length.');
  const ax = gfx(lab).axes();
  const s: Series[] = [{ kind: 'scatter', x, y, z, color: PALETTE[(ax.hold ? ax.series.length : 0) % PALETTE.length], dash: 'none', marker: 'o', width: 1.5, label: null, size: 6 }];
  points(s, a.slice(3));
  add(lab, s);
  return [];
});

// Contours: marching squares on each cell, the pieces joined into lines.
/** The lines where z = level, as polylines [x, y, x, y, …]. */
export function isolines(g: Pick<Grid, 'r' | 'c' | 'x' | 'y' | 'z'>, level: number): number[][] {
  const segs: number[][] = [];
  const { r, x, y, z } = g;
  for (let j = 0; j < g.c - 1; j++) for (let i = 0; i < r - 1; i++) {
    const k = [j * r + i, (j + 1) * r + i, (j + 1) * r + i + 1, j * r + i + 1]; // around the cell
    const v = k.map((q) => z[q]);
    if (v.some((t) => !Number.isFinite(t))) continue;
    // Always from the lower index, so two cells sharing an edge get exactly the same point.
    const cut = (e: number) => { const a = Math.min(k[e], k[(e + 1) % 4]), b = Math.max(k[e], k[(e + 1) % 4]), va = z[a], vb = z[b], t = (level - va) / (vb - va); return [x[a] + t * (x[b] - x[a]), y[a] + t * (y[b] - y[a])]; };
    const crosses = [0, 1, 2, 3].filter((e) => (v[e] < level) !== (v[(e + 1) % 4] < level));
    if (crosses.length === 2) segs.push([...cut(crosses[0]), ...cut(crosses[1])]);
    else if (crosses.length === 4) {
      // A saddle: the middle decides which corners belong together.
      const mid = (v[0] + v[1] + v[2] + v[3]) / 4;
      if ((mid < level) === (v[0] < level)) segs.push([...cut(0), ...cut(1)], [...cut(2), ...cut(3)]);
      else segs.push([...cut(3), ...cut(0)], [...cut(1), ...cut(2)]);
    }
  }
  // Join pieces that share an end (dropping scraps of no length, where a line passes exactly through a point).
  const key = (a: number, b: number) => `${a.toPrecision(10)},${b.toPrecision(10)}`;
  const kept = segs.filter((q) => key(q[0], q[1]) !== key(q[2], q[3]));
  segs.length = 0; segs.push(...kept);
  const byEnd = new Map<string, number[]>();
  segs.forEach((s, n) => { for (const kk of [key(s[0], s[1]), key(s[2], s[3])]) { const l = byEnd.get(kk); if (l) l.push(n); else byEnd.set(kk, [n]); } });
  const used = new Array<boolean>(segs.length).fill(false);
  const next = (px: number, py: number) => { for (const n of byEnd.get(key(px, py)) ?? []) if (!used[n]) { used[n] = true; const s = segs[n]; return key(s[0], s[1]) === key(px, py) ? [s[2], s[3]] : [s[0], s[1]]; } return null; };
  const out: number[][] = [];
  segs.forEach((s, n) => {
    if (used[n]) return;
    used[n] = true;
    const line = [...s];
    for (let p = next(line[line.length - 2], line[line.length - 1]); p; p = next(line[line.length - 2], line[line.length - 1])) line.push(...p);
    for (let p = next(line[0], line[1]); p; p = next(line[0], line[1])) line.unshift(...p);
    out.push(line);
  });
  return out;
}

function contours(a: Value[], what: string) {
  const nums = leading(a);
  const g = surface(nums.length >= 3 ? nums.slice(0, 3) : nums.slice(0, 1), what);
  const spec = nums.length >= 3 ? nums[3] : nums[1];
  const r = minmax(g.z) ?? [0, 1];
  let levels: number[];
  if (spec && numel(spec) === 1) { const n = Math.max(1, Math.round(spec.d[0])); levels = Array.from({ length: n }, (_, k) => r[0] + ((r[1] - r[0]) * (k + 1)) / (n + 1)); }
  else if (spec) levels = [...new Set(spec.d)].sort((p, q) => p - q);
  else levels = ticks(r[0], r[1], 9).filter((t) => t > r[0] && t < r[1]);
  const rest = a.slice(nums.length);
  let line: string | null = null, width = 1;
  for (let i = 0; i < rest.length - 1; i++) {
    const n = rest[i]; if (n.k !== 'str') continue;
    if (/^linecolor$/i.test(n.v)) { line = rest[i + 1].k === 'str' && /^none$/i.test(textOf(rest[i + 1])) ? 'none' : colour(rest[i + 1]); i++; }
    else if (/^linewidth$/i.test(n.v)) { width = scalar(rest[i + 1]); i++; }
  }
  const spec2 = rest.find((v) => v.k === 'str' && !/^(linecolor|linewidth|showtext|on|off)$/i.test(v.v) && v.v.length <= 4);
  const st = spec2 ? style([spec2], {}) : {};
  const lines: Series[] = line === 'none' ? [] : levels.map((L) => {
    const x: number[] = [], y: number[] = [];
    for (const line of isolines(g, L)) { if (x.length) { x.push(NaN); y.push(NaN); } for (let k = 0; k < line.length; k += 2) { x.push(line[k]); y.push(line[k + 1]); } }
    return { kind: 'line', x, y, color: line ?? st.color ?? '#18181b', level: line || st.color ? undefined : L, dash: st.dash && st.dash !== 'none' ? st.dash : '', marker: null, width, label: null, size: 6 } as Series;
  }).filter((s) => s.x.length);
  return { g, levels, lines, range: r };
}

def('contour contour3', (a, _n, lab) => {
  const { g, lines, range } = contours(a, 'contour');
  add(lab, lines);
  const ax = gfx(lab).axes();
  ax.zrange = range;
  ax.tight = [Math.min(...finite(g.x)), Math.max(...finite(g.x)), Math.min(...finite(g.y)), Math.max(...finite(g.y))];
  return [];
});
def('contourf', (a, _n, lab) => {
  const { g, levels, lines, range } = contours(a, 'contourf');
  const xs = Array.from({ length: g.c }, (_, j) => g.x[j * g.r]), ys = Array.from({ length: g.r }, (_, i) => g.y[i]);
  const black = lines.map((s) => (s.level !== undefined ? { ...s, level: undefined, color: '#18181b', width: 0.6 } : s));
  add(lab, black, [{ kind: 'filled', r: g.r, c: g.c, x: xs, y: ys, z: g.z, levels, edges: false, alpha: 1 }]);
  const ax = gfx(lab).axes();
  ax.zrange = range;
  ax.tight = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return [];
});

/** imagesc(C), imagesc(x, y, C): x and y may be [first last]. */
function imageArgs(a: Value[], what: string) {
  const nums = leading(a);
  const C = nums.length >= 3 ? nums[2] : nums[0];
  if (!C || !C.d.length) throw new LabError(`${what} needs a matrix, like ${what}(magic(8)).`);
  const along = (m: Mat | undefined, n: number) => { if (!m) return Array.from({ length: n }, (_, k) => k + 1); const v = [...m.d]; if (v.length === n) return v; if (v.length === 2) return Array.from({ length: n }, (_, k) => (n === 1 ? v[0] : v[0] + ((v[1] - v[0]) * k) / (n - 1))); throw new LabError(`${what}'s x and y are [first last] or one value per column and row.`); };
  return { C, x: along(nums.length >= 3 ? nums[0] : undefined, C.c), y: along(nums.length >= 3 ? nums[1] : undefined, C.r), rest: a.slice(nums.length) };
}
for (const [name, direct, rev] of [['imagesc', false, true], ['image', true, true], ['pcolor', false, false]] as const) {
  def(name, (a, _n, lab) => {
    // pcolor(X, Y, C) takes full grids; its first row and column give the centres.
    const pc = name === 'pcolor' && leading(a).length >= 3 ? leading(a) : null;
    const { C, x, y, rest } = pc ? { C: pc[2], x: Array.from({ length: pc[2].c }, (_, j) => (isVec(pc[0]) ? pc[0].d[j] : pc[0].d[j * pc[0].r])), y: Array.from({ length: pc[2].r }, (_, i) => (isVec(pc[1]) ? pc[1].d[i] : pc[1].d[i])), rest: a.slice(3) } : imageArgs(a, name);
    const { alpha } = faceOpts(rest);
    add(lab, [], [{ kind: 'image', r: C.r, c: C.c, x, y, z: [...C.d], direct, edges: false, alpha }]);
    const ax = gfx(lab).axes();
    const hx = x.length > 1 ? (x[x.length - 1] - x[0]) / (x.length - 1) / 2 : 0.5, hy = y.length > 1 ? (y[y.length - 1] - y[0]) / (y.length - 1) / 2 : 0.5;
    ax.revY = rev;
    ax.tight = [Math.min(x[0] - hx, x[x.length - 1] + hx), Math.max(x[0] - hx, x[x.length - 1] + hx), Math.min(y[0] - hy, y[y.length - 1] + hy), Math.max(y[0] - hy, y[y.length - 1] + hy)];
    // imagesc(C, [low high]) sets the colour limits.
    if (name === 'imagesc' && leading(a).length === 2 && numel(a[1]) === 2) ax.clim = [toMat(a[1]).d[0], toMat(a[1]).d[1]];
    return [];
  });
}

def('colorbar', (a, _n, lab) => { const ax = gfx(lab).axes(); ax.colorbar = !(a[0]?.k === 'str' && /^(off|hide|delete)$/i.test(a[0].v)); gfx(lab).changed(); return []; });
def('colormap', (a, nout, lab) => {
  const g = gfx(lab), f = g.current ?? g.figure();
  const v = a[0];
  if (v?.k === 'str') {
    const m = mapOf(v.v, a[1] && a[1].k !== 'str' ? Math.max(2, Math.round(scalar(a[1]))) : 256);
    if (!m) throw new LabError(`There's no colour map called “${v.v}”. Try: ${MAP_NAMES.join(', ')}.`);
    f.cmap = m;
  } else if (v) {
    const m = toMat(v);
    if (m.c !== 3 || !m.r) throw new LabError('A colour map is a list of [r g b] rows from 0 to 1.');
    f.cmap = Array.from({ length: m.r }, (_, i) => [0, 1, 2].map((ch) => Math.max(0, Math.min(1, m.d[ch * m.r + i]))));
  }
  g.changed();
  return nout > 0 || !a.length ? [mapMat(f.cmap)] : [];
});
const mapMat = (m: number[][]) => { const o = mat(m.length, 3); m.forEach((row, i) => row.forEach((v, ch) => { o.d[ch * m.length + i] = v; })); return o; };
for (const name of MAP_NAMES.filter((n) => n !== 'lab' && n !== 'default')) def(name, (a) => [mapMat(mapOf(name, a[0] ? Math.max(1, Math.round(scalar(a[0]))) : 256)!)]);
def('caxis clim', (a, nout, lab) => {
  const ax = gfx(lab).axes();
  if (a[0]?.k === 'str') ax.clim = null;
  else if (a[0]) { const v = vec(a[0]); if (v.length !== 2 || !(v[1] > v[0])) throw new LabError('The colour limits are [low high].'); ax.clim = [v[0], v[1]]; }
  gfx(lab).changed();
  return nout > 0 || !a.length ? [mat(1, 2, crange(ax))] : [];
});
def('view', (a, nout, lab) => {
  const ax = gfx(lab).axes();
  if (a.length >= 2) ax.view = [scalar(a[0]), scalar(a[1])];
  else if (a[0]) { const v = vec(a[0]); ax.view = v.length >= 2 ? [v[0], v[1]] : v[0] === 2 ? [0, 90] : [-37.5, 30]; }
  gfx(lab).changed();
  return nout > 0 || !a.length ? [mat(1, 2, ax.view ?? (is3d(ax) ? [-37.5, 30] : [0, 90]))] : [];
});
def('shading', (a, _n, lab) => {
  const mode = a[0] ? textOf(a[0]).toLowerCase() : 'faceted';
  if (!['faceted', 'flat', 'interp'].includes(mode)) throw new LabError('shading is faceted, flat or interp.');
  for (const g of gfx(lab).axes().grids) g.edges = mode === 'faceted';
  gfx(lab).changed();
  return [];
});
def('rotate3d', () => []);
/** peaks: the classic test surface, made of Gaussian bumps. */
def('peaks', (a, nout) => {
  let xs: number[], ys: number[];
  if (a.length >= 2) { xs = vec(a[0]); ys = vec(a[1]); }
  else { const n = a[0] ? (numel(a[0]) > 1 ? 0 : Math.max(2, Math.round(scalar(a[0])))) : 49; xs = n ? Array.from({ length: n }, (_, k) => -3 + (6 * k) / (n - 1)) : vec(a[0]); ys = xs; }
  const full = a.length >= 2 && toMat(a[0]).r > 1 && toMat(a[0]).c > 1;
  const r = full ? toMat(a[0]).r : ys.length, c = full ? toMat(a[0]).c : xs.length;
  const X = mat(r, c), Y = mat(r, c), Z = mat(r, c);
  for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) {
    const k = j * r + i, x = full ? xs[k] : xs[j], y = full ? ys[k] : ys[i];
    X.d[k] = x; Y.d[k] = y;
    Z.d[k] = 3 * (1 - x) ** 2 * Math.exp(-(x ** 2) - (y + 1) ** 2) - 10 * (x / 5 - x ** 3 - y ** 5) * Math.exp(-(x ** 2) - y ** 2) - Math.exp(-((x + 1) ** 2) - y ** 2) / 3;
  }
  return nout >= 3 ? [X, Y, Z] : [Z];
});

