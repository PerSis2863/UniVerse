// Hyperion Simulate → Fields (M548): electromagnetics in a flat cross-section, as engineering software's 2D magnetic and
// electric solvers do it, by finite elements on a square grid (bilinear cells, solved by conjugate gradients).
// Magnetic: the field of coils (current into or out of the page), permanent magnets and iron, for things long out of
// the page (a motor's slice, a busbar, an electromagnet). The unknown is the magnetic vector potential A (Wb/m), with
// ∇·(ν∇A) = −J − ∇×(ν₀·Br); B = (∂A/∂y, −∂A/∂x); its contours are the field lines; A = 0 on the box (no flux leaves).
// The force on a part comes from Maxwell's stress around it. Electric: electrodes held at voltages in materials of any
// permittivity, the unknown the voltage V with ∇·(ε∇V) = 0; E = −∇V; the box's sides let the field out (no charge on
// them), so two electrodes' capacitance is 2W/ΔV². Everything per metre of depth.

export type FieldMode = 'magnetic' | 'electric';
export type RegionKind = 'coil' | 'magnet' | 'iron' | 'electrode' | 'dielectric';
/** A rectangle or a disc (`round`) in millimetres. coil: `value` A/mm² (minus: out of the page); magnet: `value` T
 * (remanence) pointing at `angle` degrees; iron: `value` relative permeability; electrode: `value` volts; dielectric:
 * `value` relative permittivity. Later regions are drawn over earlier ones. */
export interface Region { id: string; kind: RegionKind; x: number; y: number; w: number; h: number; round?: boolean; value: number; angle?: number }
export interface FieldModel { mode: FieldMode; width: number; height: number; regions: Region[] }

export interface FieldResult {
  nx: number; ny: number; h: number;
  /** The potential at the grid's nodes ((nx+1)·(ny+1), row by row from the bottom): A (Wb/m) or V (volts). */
  pot: Float64Array;
  /** The field at the cells' middles (nx·ny): B (T) or E (V/m), x and y and size. */
  fx: Float64Array; fy: Float64Array; mag: Float64Array;
  /** Which region (index, −1 none) fills each cell. */
  owner: Int16Array;
  /** Energy stored (J/m), the largest field, and the force on each region (N/m) from Maxwell's stress around it. */
  energy: number; peak: number; forces: { id: string; fx: number; fy: number }[];
  /** Electric, exactly two electrodes at different voltages: their capacitance (F/m). */
  capacitance: number | null;
  iterations: number;
}

export const MU0 = 4e-7 * Math.PI, EPS0 = 8.8541878128e-12;

/** Which cells a region fills. */
function inside(r: Region, x: number, y: number) {
  if (r.round) { const rx = r.w / 2, ry = r.h / 2; return ((x - r.x - rx) / rx) ** 2 + ((y - r.y - ry) / ry) ** 2 <= 1; }
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** The grid: square cells about `cells` across the longer side. */
export function gridOf(m: FieldModel, cells = 160) {
  const h = Math.max(m.width, m.height) / cells;
  return { h, nx: Math.max(4, Math.round(m.width / h)), ny: Math.max(4, Math.round(m.height / h)) };
}

// The bilinear square's stiffness for ∫∇u·∇w (independent of size), nodes counter-clockwise from the bottom left.
const KQ = [[4, -1, -2, -1], [-1, 4, -1, -2], [-2, -1, 4, -1], [-1, -2, -1, 4]].map((r) => r.map((v) => v / 6));
// Each corner's side: x −1 left, +1 right; y −1 bottom, +1 top.
const SX = [-1, 1, 1, -1], SY = [-1, -1, 1, 1];

export function solveFields(m: FieldModel, cells = 160): FieldResult {
  const { h: hmm, nx, ny } = gridOf(m, cells), h = hmm / 1000, W = nx + 1, nn = W * (ny + 1);
  const magnetic = m.mode === 'magnetic';
  const owner = new Int16Array(nx * ny).fill(-1), coef = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const cx = (i + 0.5) * hmm, cy = (j + 0.5) * hmm, c = j * nx + i;
    for (let k = m.regions.length - 1; k >= 0; k--) if (inside(m.regions[k], cx, cy)) { owner[c] = k; break; }
    const r = owner[c] >= 0 ? m.regions[owner[c]] : null;
    // ν = 1/μ for magnetic (iron divides it), ε for electric (dielectrics multiply it).
    coef[c] = magnetic ? (r?.kind === 'iron' ? 1 / (MU0 * Math.max(1, r.value)) : 1 / MU0) : EPS0 * (r?.kind === 'dielectric' ? Math.max(1, r.value) : 1);
  }
  const node = (i: number, j: number) => j * W + i;
  const corners = (i: number, j: number) => [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)];
  // Loads and held nodes.
  const f = new Float64Array(nn), fixed = new Uint8Array(nn), x = new Float64Array(nn);
  if (magnetic) {
    for (let i = 0; i <= nx; i++) { fixed[node(i, 0)] = 1; fixed[node(i, ny)] = 1; }
    for (let j = 0; j <= ny; j++) { fixed[node(0, j)] = 1; fixed[node(nx, j)] = 1; }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = j * nx + i, r = owner[c] >= 0 ? m.regions[owner[c]] : null;
    if (!r) continue;
    const q = corners(i, j);
    if (magnetic && r.kind === 'coil') for (const n of q) f[n] += (r.value * 1e6 * h * h) / 4;
    if (magnetic && r.kind === 'magnet') {
      const a = ((r.angle ?? 0) * Math.PI) / 180, bx = r.value * Math.cos(a), by = r.value * Math.sin(a);
      // ∫ ν₀·Br·curl(w) over the cell, curl w = (∂w/∂y, −∂w/∂x), each corner's slope integral ±h/2.
      q.forEach((n, k) => { f[n] += (bx * SY[k] * h / 2 - by * SX[k] * h / 2) / MU0; });
    }
    if (!magnetic && r.kind === 'electrode') for (const n of q) { fixed[n] = 1; x[n] = r.value; }
  }
  if (!magnetic && !fixed.some((v) => v)) throw new Error('Add an electrode: electric fields come from voltages.');
  // K·x, cell by cell (the matrix is never stored).
  const mul = (u: Float64Array, out: Float64Array) => {
    out.fill(0);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = coef[j * nx + i], q = corners(i, j);
      for (let a = 0; a < 4; a++) { let s = 0; for (let b = 0; b < 4; b++) s += KQ[a][b] * u[q[b]]; out[q[a]] += k * s; }
    }
  };
  const diag = new Float64Array(nn);
  // The held values move to the right-hand side; then conjugate gradients with Jacobi on the free nodes.
  const solveWith = (tol: number) => {
  diag.fill(0);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = coef[j * nx + i]; for (const n of corners(i, j)) diag[n] += k * KQ[0][0]; }
  const kx = new Float64Array(nn);
  mul(x, kx);
  const r = new Float64Array(nn), z = new Float64Array(nn), p = new Float64Array(nn), ap = new Float64Array(nn);
  for (let n = 0; n < nn; n++) r[n] = fixed[n] ? 0 : f[n] - kx[n];
  const bnorm = Math.sqrt(r.reduce((s, v) => s + v * v, 0)) || 1;
  for (let n = 0; n < nn; n++) { z[n] = fixed[n] ? 0 : r[n] / diag[n]; p[n] = z[n]; }
  let rz = 0;
  for (let n = 0; n < nn; n++) rz += r[n] * z[n];
  let it = 0;
  for (; it < 4 * nn && rz !== 0; it++) {
    mul(p, ap);
    let pap = 0;
    for (let n = 0; n < nn; n++) { if (fixed[n]) ap[n] = 0; pap += p[n] * ap[n]; }
    if (!(pap > 0)) break;
    const al = rz / pap;
    let rr = 0;
    for (let n = 0; n < nn; n++) { x[n] += al * p[n]; r[n] -= al * ap[n]; rr += r[n] * r[n]; }
    if (Math.sqrt(rr) < tol * bnorm) { it++; break; }
    let rz2 = 0;
    for (let n = 0; n < nn; n++) { z[n] = fixed[n] ? 0 : r[n] / diag[n]; rz2 += r[n] * z[n]; }
    const be = rz2 / rz;
    rz = rz2;
    for (let n = 0; n < nn; n++) p[n] = z[n] + be * p[n];
  }
  return it;
  };
  let it = solveWith(1e-10);
  // Iron saturates (M548): straight up to Bsat, then as air on top of it (B = Bsat + μ₀(H − Hsat)). Solved again with
  // each iron cell's ν = H/B from its field, half-way each time, until no cell's ν moves 1%.
  const BSAT = 2;
  const ironCells = magnetic ? [...owner.keys()].filter((c) => owner[c] >= 0 && m.regions[owner[c]].kind === 'iron') : [];
  for (let round = 0; round < 25 && ironCells.length; round++) {
    let moved = 0;
    for (const c of ironCells) {
      const i = c % nx, j = (c - i) / nx, [a, b, c2, d] = corners(i, j);
      const B = Math.hypot((x[b] + x[c2] - x[a] - x[d]) / (2 * h), (x[d] + x[c2] - x[a] - x[b]) / (2 * h));
      const lin = 1 / (MU0 * Math.max(1, m.regions[owner[c]].value));
      const want = B <= BSAT ? lin : (BSAT * lin + (B - BSAT) / MU0) / B, next = coef[c] + 0.5 * (want - coef[c]);
      moved = Math.max(moved, Math.abs(next - coef[c]) / coef[c]);
      coef[c] = next;
    }
    if (moved < 0.01) break;
    // Each round starts from the last answer.
    it += solveWith(1e-9);
  }
  // The field at the cells' middles, the energy and the peak.
  const fx = new Float64Array(nx * ny), fy = new Float64Array(nx * ny), mag = new Float64Array(nx * ny);
  let energy = 0, peak = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const [a, b, c2, d] = corners(i, j), dx = (x[b] + x[c2] - x[a] - x[d]) / (2 * h), dy = (x[d] + x[c2] - x[a] - x[b]) / (2 * h), c = j * nx + i;
    if (magnetic) { fx[c] = dy; fy[c] = -dx; } else { fx[c] = -dx; fy[c] = -dy; }
    mag[c] = Math.hypot(fx[c], fy[c]);
    peak = Math.max(peak, mag[c]);
    const o = owner[c] >= 0 ? m.regions[owner[c]] : null;
    // Magnetic energy ½·B·H (a magnet's own remanence left out: its share is the field's in the air); electric ½·ε·E².
    energy += (magnetic ? 0.5 * coef[c] * mag[c] ** 2 : 0.5 * coef[c] * mag[c] ** 2) * h * h * (magnetic && o?.kind === 'magnet' ? 0 : 1);
  }
  // Maxwell's stress around each region's box (one cell outside it, in whatever is there).
  const forces = m.regions.map((rg) => {
    const i0 = Math.max(0, Math.floor(rg.x / hmm) - 1), i1 = Math.min(nx - 1, Math.ceil((rg.x + rg.w) / hmm)), j0 = Math.max(0, Math.floor(rg.y / hmm) - 1), j1 = Math.min(ny - 1, Math.ceil((rg.y + rg.h) / hmm));
    let Fx = 0, Fy = 0;
    const k = magnetic ? 1 / MU0 : EPS0;
    const add = (i: number, j: number, nxo: number, nyo: number, w: number) => {
      const c = j * nx + i, X = fx[c], Y = fy[c], s2 = (X * X + Y * Y) / 2;
      Fx += k * ((X * X - s2) * nxo + X * Y * nyo) * h * w; Fy += k * (X * Y * nxo + (Y * Y - s2) * nyo) * h * w;
    };
    // The loop runs through the cells' middles: each side is one cell shorter than its cells (trapezoid weights).
    for (let i = i0; i <= i1; i++) { const w = i === i0 || i === i1 ? 0.5 : 1; add(i, j0, 0, -1, w); add(i, j1, 0, 1, w); }
    for (let j = j0; j <= j1; j++) { const w = j === j0 || j === j1 ? 0.5 : 1; add(i0, j, -1, 0, w); add(i1, j, 1, 0, w); }
    return { id: rg.id, fx: Fx, fy: Fy };
  });
  let capacitance: number | null = null;
  const els = m.regions.filter((rg) => rg.kind === 'electrode');
  if (!magnetic && els.length === 2 && els[0].value !== els[1].value) capacitance = (2 * energy) / (els[0].value - els[1].value) ** 2;
  return { nx, ny, h: hmm, pot: x, fx, fy, mag, owner, energy, peak, forces, capacitance, iterations: it };
}

/** The contour lines of the potential (field lines for magnetic, equipotentials for electric) as segments in mm. */
export function contours(res: FieldResult, count = 24): [number, number, number, number][] {
  const { nx, ny, h, pot } = res, W = nx + 1;
  let lo = Infinity, hi = -Infinity;
  for (const v of pot) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!(hi > lo)) return [];
  const out: [number, number, number, number][] = [];
  for (let k = 1; k < count; k++) {
    const t = lo + ((hi - lo) * k) / count;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = [pot[j * W + i], pot[j * W + i + 1], pot[(j + 1) * W + i + 1], pot[(j + 1) * W + i]];
      const P = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      const cut: [number, number][] = [];
      for (let e = 0; e < 4; e++) {
        const a = v[e], b = v[(e + 1) % 4];
        if ((a < t) !== (b < t)) { const s = (t - a) / (b - a), [x0, y0] = P[e], [x1, y1] = P[(e + 1) % 4]; cut.push([(x0 + s * (x1 - x0)) * h, (y0 + s * (y1 - y0)) * h]); }
      }
      if (cut.length >= 2) out.push([cut[0][0], cut[0][1], cut[1][0], cut[1][1]]);
      if (cut.length === 4) out.push([cut[2][0], cut[2][1], cut[3][0], cut[3][1]]);
    }
  }
  return out;
}

let seq = 0;
const rid = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;
/** Ready-made studies. */
export const FIELD_PRESETS: { id: string; name: string; make: () => FieldModel }[] = [
  { id: 'electromagnet', name: 'Electromagnet lifting a bar', make: () => ({ mode: 'magnetic', width: 200, height: 160, regions: [
    { id: rid(), kind: 'iron', x: 60, y: 70, w: 80, h: 50, value: 2000 }, { id: rid(), kind: 'coil', x: 70, y: 80, w: 20, h: 30, value: 3 },
    { id: rid(), kind: 'coil', x: 110, y: 80, w: 20, h: 30, value: -3 }, { id: rid(), kind: 'iron', x: 90, y: 80, w: 20, h: 40, value: 2000 },
    { id: rid(), kind: 'iron', x: 60, y: 55, w: 80, h: 12, value: 2000 },
  ] }) },
  { id: 'wires', name: 'Two wires side by side', make: () => ({ mode: 'magnetic', width: 200, height: 160, regions: [
    { id: rid(), kind: 'coil', x: 76, y: 76, w: 8, h: 8, round: true, value: 10 }, { id: rid(), kind: 'coil', x: 116, y: 76, w: 8, h: 8, round: true, value: 10 },
  ] }) },
  { id: 'magnets', name: 'Two magnets and a steel plate', make: () => ({ mode: 'magnetic', width: 200, height: 160, regions: [
    { id: rid(), kind: 'magnet', x: 60, y: 60, w: 30, h: 20, value: 1.2, angle: 90 }, { id: rid(), kind: 'magnet', x: 110, y: 60, w: 30, h: 20, value: 1.2, angle: -90 },
    { id: rid(), kind: 'iron', x: 50, y: 85, w: 100, h: 8, value: 1000 },
  ] }) },
  { id: 'capacitor', name: 'Plate capacitor', make: () => ({ mode: 'electric', width: 200, height: 160, regions: [
    { id: rid(), kind: 'electrode', x: 40, y: 92, w: 120, h: 4, value: 100 }, { id: rid(), kind: 'electrode', x: 40, y: 64, w: 120, h: 4, value: 0 },
    { id: rid(), kind: 'dielectric', x: 40, y: 68, w: 60, h: 24, value: 4 },
  ] }) },
  { id: 'cable', name: 'Coaxial cable', make: () => ({ mode: 'electric', width: 160, height: 160, regions: [
    { id: rid(), kind: 'electrode', x: 30, y: 30, w: 100, h: 100, round: true, value: 0 }, { id: rid(), kind: 'dielectric', x: 35, y: 35, w: 90, h: 90, round: true, value: 2.3 },
    { id: rid(), kind: 'electrode', x: 70, y: 70, w: 20, h: 20, round: true, value: 1000 },
  ] }) },
];
export const newRegionId = rid;
