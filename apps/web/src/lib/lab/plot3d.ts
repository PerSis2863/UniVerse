import { LabError } from './parse';
import { mat, numel, scalar, toMat, type Mat, type Value } from './values';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { add, colour, esc, gfx, isPairName, label, markerSvg, outward, PALETTE, points, style, tex, ticks, vec, type Axes, type Box, type Grid, type Ink, type Series } from './plot';
import { hex, hexAt, MAP_NAMES, mapOf, png, rgbAt } from './colormap';

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

  // Surfaces: every face, far ones first (at most ~90 × 90 faces a surface; bigger ones are sampled). Smooth shading
  // splits each face into up to 4 × 4 smaller ones with blended colours; lights shade each face by its slope.
  const faces: { d: number; s: string }[] = [];
  const eye = [ce * sa, -ce * ca, se];
  const [ka, kd, ks, shine] = ax.material;
  const lit = ax.lighting !== 'none' && ax.lights.length > 0;
  const shade = (rgb: [number, number, number], n: number[]): [number, number, number] => {
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    let nn = n.map((v) => v / len);
    if (nn[0] * eye[0] + nn[1] * eye[1] + nn[2] * eye[2] < 0) nn = nn.map((v) => -v); // both sides lit, as MATLAB does
    let diff = 0, spec = 0;
    for (const L of ax.lights) {
      const nl = nn[0] * L[0] + nn[1] * L[1] + nn[2] * L[2];
      if (nl <= 0) continue;
      diff += nl;
      const r = nn.map((v, i) => 2 * nl * v - L[i]);
      spec += Math.max(0, r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2]) ** shine;
    }
    const k = ka + kd * diff;
    return rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * k + 255 * ks * spec * 0.3)))) as [number, number, number];
  };
  for (const g of surfs) {
    const pick = (n: number) => { const step = Math.max(1, Math.ceil((n - 1) / 90)); const idx: number[] = []; for (let k = 0; k < n - 1; k += step) idx.push(k); idx.push(n - 1); return idx; };
    const ri = pick(g.r), cj = pick(g.c);
    const sub = g.smooth && g.kind === 'surf' ? Math.max(1, Math.min(4, Math.floor(Math.sqrt(14000 / Math.max(1, (ri.length - 1) * (cj.length - 1)))))) : 1;
    const zv = (k: number) => { const z = g.z[k]; return ax.zlim && (z < ax.zlim[0] || z > ax.zlim[1]) ? NaN : z; };
    const cv = g.cdata ?? g.z;
    const alpha = g.alpha < 1 ? ` fill-opacity="${g.alpha}"` : '';
    // Smooth lighting blends normals between corners (as Gouraud lighting does): one normal per corner from its neighbours.
    const vn = new Map<string, number[]>();
    const P = (q: number, a: number) => { const k = cj[a] * g.r + ri[q]; return [nx(g.x[k]), ny(g.y[k]), nz(zv(k))]; };
    const normalAt = (q: number, a: number) => {
      const key = `${q},${a}`;
      let n = vn.get(key);
      if (!n) {
        const du = P(q, Math.min(cj.length - 1, a + 1)).map((v, i) => v - P(q, Math.max(0, a - 1))[i]);
        const dw = P(Math.min(ri.length - 1, q + 1), a).map((v, i) => v - P(Math.max(0, q - 1), a)[i]);
        n = [du[1] * dw[2] - du[2] * dw[1], du[2] * dw[0] - du[0] * dw[2], du[0] * dw[1] - du[1] * dw[0]];
        const l = Math.hypot(n[0], n[1], n[2]) || 1;
        n = n.map((v) => v / l);
        vn.set(key, n);
      }
      return n;
    };
    for (let a = 0; a < cj.length - 1; a++) for (let q = 0; q < ri.length - 1; q++) {
      const ks4 = [cj[a] * g.r + ri[q], cj[a + 1] * g.r + ri[q], cj[a + 1] * g.r + ri[q + 1], cj[a] * g.r + ri[q + 1]];
      if (ks4.some((k) => !Number.isFinite(zv(k)) || !Number.isFinite(g.x[k]) || !Number.isFinite(g.y[k]))) continue;
      const N = ks4.map((k) => [nx(g.x[k]), ny(g.y[k]), nz(zv(k))]), V = ks4.map((k) => cv[k]);
      // A point and a colour value inside the face, u along the columns and w along the rows.
      const B = (u: number, w: number) => [0, 1, 2].map((i) => (1 - u) * (1 - w) * N[0][i] + u * (1 - w) * N[1][i] + u * w * N[2][i] + (1 - u) * w * N[3][i]);
      const Cv = (u: number, w: number) => (1 - u) * (1 - w) * V[0] + u * (1 - w) * V[1] + u * w * V[2] + (1 - u) * w * V[3];
      for (let su = 0; su < sub; su++) for (let sw = 0; sw < sub; sw++) {
        const u0 = su / sub, u1 = (su + 1) / sub, w0 = sw / sub, w1 = (sw + 1) / sub;
        const P3 = [B(u0, w0), B(u1, w0), B(u1, w1), B(u0, w1)];
        const ps = P3.map((p) => S(p[0], p[1], p[2]));
        const d = (ps[0][2] + ps[1][2] + ps[2][2] + ps[3][2]) / 4;
        let rgb = rgbAt(cmap, cl0, cl1, Cv((u0 + u1) / 2, (w0 + w1) / 2));
        if (!rgb) continue;
        if (lit && g.kind === 'surf') {
          let n: number[];
          if (g.smooth) {
            const cn = [normalAt(q, a), normalAt(q, a + 1), normalAt(q + 1, a + 1), normalAt(q + 1, a)];
            // Corners' normals may point to opposite sides of a fold: turn them all towards the first before blending.
            const ref = cn[0];
            const aligned = cn.map((v) => (v[0] * ref[0] + v[1] * ref[1] + v[2] * ref[2] < 0 ? v.map((x) => -x) : v));
            const u = (u0 + u1) / 2, w = (w0 + w1) / 2;
            n = [0, 1, 2].map((i) => (1 - u) * (1 - w) * aligned[0][i] + u * (1 - w) * aligned[1][i] + u * w * aligned[2][i] + (1 - u) * w * aligned[3][i]);
          } else {
            const d1 = P3[2].map((v, i) => v - P3[0][i]), d2 = P3[3].map((v, i) => v - P3[1][i]);
            n = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]];
          }
          rgb = shade(rgb, n);
        }
        const col = hex(rgb);
        const path = `M${ps.map(pt).join(' L')} Z`;
        faces.push({ d, s: g.kind === 'mesh' ? `<path d="${path}" fill="${c.bg}" stroke="${col}"/>` : g.edges ? `<path d="${path}" fill="${col}"${alpha} stroke="#18181b" stroke-opacity="0.35"/>` : `<path d="${path}" fill="${col}"${alpha} stroke="${col}"/>` });
      }
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
    return { kind: 'line', x, y, color: line ?? st.color ?? '#18181b', level: line || st.color ? undefined : L, value: L, dash: st.dash && st.dash !== 'none' ? st.dash : '', marker: null, width, label: null, size: 6 } as Series;
  }).filter((s) => s.x.length);
  return { g, levels, lines, range: r };
}

/** 'ShowText', 'on' after the data writes each line's level on it. */
const showText = (a: Value[]) => a.some((v, i) => v.k === 'str' && /^showtext$/i.test(v.v) && a[i + 1]?.k === 'str' && /^on$/i.test(textOf(a[i + 1])));
/** MATLAB's contour matrix: for each line a column [level; points] then its points as [x; y] columns. */
function contourMatrix(lines: Series[]) {
  const cols: number[][] = [];
  for (const s of lines) for (const run of runs(s)) { cols.push([s.value ?? 0, run.length]); for (const [x, y] of run) cols.push([x, y]); }
  const C = mat(2, cols.length);
  cols.forEach((c, j) => { C.d[2 * j] = c[0]; C.d[2 * j + 1] = c[1]; });
  return C;
}
const runs = (s: Series) => { const out: [number, number][][] = []; let cur: [number, number][] = []; s.x.forEach((x, i) => { if (!Number.isFinite(x) || !Number.isFinite(s.y[i])) { if (cur.length) out.push(cur); cur = []; } else cur.push([x, s.y[i]]); }); if (cur.length) out.push(cur); return out; };

def('contour contour3', (a, nout, lab) => {
  const { g, lines, range } = contours(a, 'contour');
  add(lab, lines);
  const ax = gfx(lab).axes();
  ax.zrange = range;
  ax.tight = [Math.min(...finite(g.x)), Math.max(...finite(g.x)), Math.min(...finite(g.y)), Math.max(...finite(g.y))];
  if (showText(a)) ax.clabel = true;
  return nout > 0 ? [contourMatrix(lines), mat(1, 1, [1])] : [];
});
def('contourf', (a, nout, lab) => {
  const { g, levels, lines, range } = contours(a, 'contourf');
  const xs = Array.from({ length: g.c }, (_, j) => g.x[j * g.r]), ys = Array.from({ length: g.r }, (_, i) => g.y[i]);
  const black = lines.map((s) => (s.level !== undefined ? { ...s, level: undefined, color: '#18181b', width: 0.6 } : s));
  add(lab, black, [{ kind: 'filled', r: g.r, c: g.c, x: xs, y: ys, z: g.z, levels, edges: false, alpha: 1 }]);
  const ax = gfx(lab).axes();
  ax.zrange = range;
  ax.tight = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (showText(a)) ax.clabel = true;
  return nout > 0 ? [contourMatrix(black), mat(1, 1, [1])] : [];
});
/** clabel(C, h) (or clabel(C), clabel(h)): write each contour line's level on it. */
def('clabel', (_a, _n, lab) => { gfx(lab).axes().clabel = true; gfx(lab).changed(); return []; });

/** The levels written on contour lines: once per line long enough, along it, with a halo so the line doesn't cross it. */
export function contourLabels(ax: Axes, X: (v: number) => number, Y: (v: number) => number, c: Ink): string {
  const out: string[] = [];
  for (const s of ax.series) {
    if (s.value === undefined) continue;
    for (const run of runs(s)) {
      const pts = run.map(([x, y]) => [X(x), Y(y)]);
      const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
      const total = seg.reduce((p, q) => p + q, 0);
      if (total < 60) continue;
      let k = 0, walked = 0;
      while (k < seg.length - 1 && walked + seg[k] < total / 2) walked += seg[k++];
      const [p, q] = [pts[k], pts[k + 1]];
      const t = seg[k] ? (total / 2 - walked) / seg[k] : 0;
      let ang = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
      if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
      const x = p[0] + t * (q[0] - p[0]), y = p[1] + t * (q[1] - p[1]);
      out.push(`<text transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${ang.toFixed(1)})" dy="3.5" text-anchor="middle" font-size="10" fill="${c.ink}" stroke="${c.bg}" stroke-width="3" paint-order="stroke">${label(+s.value.toPrecision(3))}</text>`);
    }
  }
  return out.join('');
}
/** The same labels as pgfplots nodes, at the middle point of each line. */
export function labelTikz(ax: Axes): string[] {
  const out: string[] = [];
  for (const s of ax.series) {
    if (s.value === undefined) continue;
    for (const run of runs(s)) if (run.length >= 6) { const [x, y] = run[run.length >> 1]; out.push(`\\node[font=\\scriptsize, fill=white, inner sep=1pt] at (axis cs:${+x.toPrecision(6)},${+y.toPrecision(6)}) {${+s.value.toPrecision(3)}};`); }
  }
  return out;
}

// Arrows: quiver and quiver3, scaled as MATLAB does so the longest fits the spacing of the points.
function arrows(lab: Lab, a: Value[], three: boolean) {
  const nums = leading(a), want = three ? 6 : 4;
  let X: number[], Y: number[], Z: number[] = [], U: number[], V: number[], W: number[] = [], m: number, n: number;
  const take = (k: number) => [...nums[k].d];
  if (nums.length >= want) {
    U = take(three ? 3 : 2); V = take(three ? 4 : 3); if (three) W = take(5);
    const grid = (k: number, other: Mat) => { const v = nums[k]; if (v.d.length === U.length) return [...v.d]; const Um = nums[three ? 3 : 2]; return Array.from({ length: U.length }, (_, idx) => (k === 0 ? v.d[Math.floor(idx / Um.r)] : v.d[idx % Um.r]) ?? other.d[0]); };
    X = grid(0, nums[0]); Y = grid(1, nums[1]); if (three) Z = take(2);
    const Um = nums[three ? 3 : 2]; [m, n] = Um.r === 1 || Um.c === 1 ? [Math.sqrt(U.length), Math.sqrt(U.length)] : [Um.r, Um.c];
  } else if (!three && nums.length >= 2) {
    const Um = nums[0]; U = take(0); V = take(1);
    X = U.map((_, idx) => Math.floor(idx / Um.r) + 1); Y = U.map((_, idx) => (idx % Um.r) + 1);
    [m, n] = Um.r === 1 || Um.c === 1 ? [1, U.length] : [Um.r, Um.c];
  } else throw new LabError(three ? 'quiver3 needs x, y, z and the arrows u, v, w.' : 'quiver needs the arrows u and v, or x, y, u and v.');
  if ([V, X, Y, ...(three ? [Z, W] : [])].some((v) => v.length !== U.length)) throw new LabError('The positions and the arrows must have the same number of values.');
  const s = nums.length > want || (!three && nums.length === 3 && nums.length < want) ? scalar(nums[nums.length - 1]) : 1;
  if (s !== 0) {
    const span = (v: number[]) => { const r = minmax(v); return r ? r[1] - r[0] : 0; };
    const dx = span(X) / n, dy = span(Y) / m, dz = three ? span(Z) / Math.max(m, n) : 0;
    const del = dx * dx + dy * dy + dz * dz;
    if (del > 0) {
      const most = Math.max(...U.map((u, i) => Math.sqrt((u * u + V[i] * V[i] + (three ? W[i] * W[i] : 0)) / del)).filter(Number.isFinite));
      const k = most > 0 ? (s * 0.9) / most : 1;
      U = U.map((u) => u * k); V = V.map((v) => v * k); if (three) W = W.map((w) => w * k);
    }
  }
  const al = 0.33, be = 0.33, x: number[] = [], y: number[] = [], z: number[] = [];
  U.forEach((u, i) => {
    const v = V[i], w = three ? W[i] : 0;
    if (![X[i], Y[i], u, v, w].every(Number.isFinite)) return;
    const tx = X[i] + u, ty = Y[i] + v, tz = (three ? Z[i] : 0) + w;
    x.push(X[i], tx, NaN, tx - al * (u + be * v), tx, tx - al * (u - be * v), NaN);
    y.push(Y[i], ty, NaN, ty - al * (v - be * u), ty, ty - al * (v + be * u), NaN);
    if (three) z.push(Z[i], tz, NaN, tz - al * w, tz, tz - al * w, NaN);
  });
  const ax = gfx(lab).axes();
  const out: Series = { kind: 'line', x, y, ...(three ? { z } : {}), color: PALETTE[(ax.hold ? ax.series.length : 0) % PALETTE.length], dash: '', marker: null, width: 1, label: null, size: 6 };
  Object.assign(out, style(a.slice(nums.length), {}));
  add(lab, [out]);
}
def('quiver', (a, _n, lab) => { arrows(lab, a, false); return []; });
def('quiver3', (a, _n, lab) => { arrows(lab, a, true); return []; });

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
  for (const g of gfx(lab).axes().grids) { g.edges = mode === 'faceted'; g.smooth = mode === 'interp'; }
  gfx(lab).changed();
  return [];
});
def('rotate3d', () => []);

// Lights (camlight, light, lightangle), lighting and material: each face shaded by its slope against the lights.
const toDir = (azDeg: number, elDeg: number) => { const a = (azDeg * Math.PI) / 180, e = (elDeg * Math.PI) / 180; return [Math.cos(e) * Math.sin(a), -Math.cos(e) * Math.cos(a), Math.sin(e)]; };
const viewOf = (ax: Axes) => ax.view ?? [-37.5, 30];
const addLight = (lab: Lab, dir: number[], nout: number) => { const ax = gfx(lab).axes(); const n = Math.hypot(dir[0], dir[1], dir[2]) || 1; ax.lights.push(dir.map((v) => v / n)); if (ax.lighting === 'none') ax.lighting = 'flat'; gfx(lab).changed(); return nout > 0 ? [mat(1, 1, [ax.lights.length])] : []; };
def('camlight', (a, nout, lab) => {
  const [az, el] = viewOf(gfx(lab).axes());
  const w = a[0]?.k === 'str' ? a[0].v.toLowerCase() : null;
  if (w === 'headlight') return addLight(lab, toDir(az, el), nout);
  if (w === 'left') return addLight(lab, toDir(az - 30, el + 30), nout);
  if (a.length >= 2 && a[0].k !== 'str') return addLight(lab, toDir(az + scalar(a[0]), el + scalar(a[1])), nout);
  return addLight(lab, toDir(az + 30, el + 30), nout);
});
def('light', (a, nout, lab) => {
  const i = a.findIndex((v) => v.k === 'str' && /^position$/i.test(v.v));
  return addLight(lab, i >= 0 && a[i + 1] ? vec(a[i + 1]) : [1, 0, 1], nout);
});
def('lightangle', (a, nout, lab) => addLight(lab, toDir(a[0] ? scalar(a[0]) : 0, a[1] ? scalar(a[1]) : 30), nout));
def('lighting', (a, _n, lab) => {
  const mode = a[0] ? textOf(a[0]).toLowerCase() : 'flat';
  if (!['flat', 'gouraud', 'phong', 'none'].includes(mode)) throw new LabError('lighting is flat, gouraud or none.');
  const ax = gfx(lab).axes();
  ax.lighting = mode === 'none' ? 'none' : mode === 'flat' ? 'flat' : 'gouraud';
  // Gouraud and phong blend across faces: drawn here as smooth shading.
  if (ax.lighting === 'gouraud') for (const g of ax.grids) { g.smooth = true; g.edges = false; }
  gfx(lab).changed();
  return [];
});
const MATERIALS: Record<string, [number, number, number, number]> = { default: [0.3, 0.6, 0.9, 10], shiny: [0.3, 0.6, 0.9, 20], dull: [0.3, 0.8, 0, 10], metal: [0.3, 0.3, 1, 25] };
def('material', (a, _n, lab) => {
  const ax = gfx(lab).axes();
  if (a[0]?.k === 'str') { const m = MATERIALS[a[0].v.toLowerCase()]; if (!m) throw new LabError('material is shiny, dull, metal or default, or [ka kd ks n].'); ax.material = m; }
  else if (a[0]) { const v = vec(a[0]); ax.material = [v[0] ?? 0.3, v[1] ?? 0.6, v[2] ?? 0.9, v[3] ?? 10]; }
  gfx(lab).changed();
  return [];
});
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


// Shapes: sphere, cylinder, ellipsoid give X, Y, Z (with no outputs, they draw the surface).
function shape(lab: Lab, nout: number, r: number, c: number, f: (i: number, j: number) => [number, number, number]) {
  const X = mat(r, c), Y = mat(r, c), Z = mat(r, c);
  for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) { const [x, y, z] = f(i, j); const k = j * r + i; X.d[k] = x; Y.d[k] = y; Z.d[k] = z; }
  if (nout > 0) return [X, Y, Z];
  add(lab, [], [{ kind: 'surf', r, c, x: [...X.d], y: [...Y.d], z: [...Z.d], edges: true, alpha: 1 }]);
  return [];
}
def('sphere', (a, nout, lab) => {
  const n = a[0] ? Math.max(3, Math.round(scalar(a[0]))) : 20;
  return shape(lab, nout, n + 1, n + 1, (i, j) => { const phi = -Math.PI / 2 + (Math.PI * i) / n, th = -Math.PI + (2 * Math.PI * j) / n; return [Math.cos(phi) * Math.cos(th), Math.cos(phi) * Math.sin(th), Math.sin(phi)]; });
});
def('ellipsoid', (a, nout, lab) => {
  if (a.length < 6) throw new LabError('ellipsoid needs the centre and the three radii: ellipsoid(xc, yc, zc, xr, yr, zr).');
  const [xc, yc, zc, xr, yr, zr] = a.slice(0, 6).map((v) => scalar(v)), n = a[6] ? Math.max(3, Math.round(scalar(a[6]))) : 20;
  return shape(lab, nout, n + 1, n + 1, (i, j) => { const phi = -Math.PI / 2 + (Math.PI * i) / n, th = -Math.PI + (2 * Math.PI * j) / n; return [xc + xr * Math.cos(phi) * Math.cos(th), yc + yr * Math.cos(phi) * Math.sin(th), zc + zr * Math.sin(phi)]; });
});
def('cylinder', (a, nout, lab) => {
  // cylinder(r, n): r is the radius along the height (one value, or a profile from bottom to top).
  const r = a[0] ? vec(a[0]) : [1, 1], prof = r.length === 1 ? [r[0], r[0]] : r, n = a[1] ? Math.max(3, Math.round(scalar(a[1]))) : 20;
  return shape(lab, nout, prof.length, n + 1, (i, j) => { const th = (2 * Math.PI * j) / n; return [prof[i] * Math.cos(th), prof[i] * Math.sin(th), i / (prof.length - 1)]; });
});
