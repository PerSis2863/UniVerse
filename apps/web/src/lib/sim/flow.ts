// Hyperion Simulate → Fluids (M408, the owner's Ansys ask): a wind tunnel. Air (any fluid) flows from the left past a
// shape; the lattice Boltzmann method (D2Q9, one relaxation time) moves "packets" of fluid between the cells of a grid
// and lets them collide, which together behave like the Navier–Stokes equations. The shape's cells bounce the packets
// back (a wall that grips the fluid), and the momentum they give it is the force on the shape: drag and lift, as the
// coefficients Cd and Cl. Everything is in lattice units: the inflow speed U, the shape's size D (cells across) and the
// Reynolds number Re = U·D/ν set the viscosity; the flow looks the same as any real one at that Re.

export type ShapeKind = 'cylinder' | 'airfoil' | 'square' | 'plate';
export interface FlowShape { kind: ShapeKind; angle: number; thickness: number; camber: number }
export interface FlowSettings { nx: number; ny: number; re: number; shape: FlowShape }

const CX = [0, 1, 0, -1, 0, 1, -1, -1, 1], CY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];
/** The inflow speed (lattice units: well below the lattice's speed of sound, 0.577). */
export const U = 0.08;

/** The shape's outline as points (lattice cells), centred at (cx, cy), D across (the frontal size for Cd). */
export function shapeOutline(s: FlowShape, cx: number, cy: number, D: number): [number, number][] {
  const rot = (pts: [number, number][], px: number, py: number) => {
    const a = (-s.angle * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    return pts.map(([x, y]): [number, number] => [px + (x - px) * c - (y - py) * sn, py + (x - px) * sn + (y - py) * c]);
  };
  if (s.kind === 'cylinder') return Array.from({ length: 96 }, (_, k) => [cx + (D / 2) * Math.cos((k * Math.PI) / 48), cy + (D / 2) * Math.sin((k * Math.PI) / 48)]);
  if (s.kind === 'square') return rot([[cx - D / 2, cy - D / 2], [cx + D / 2, cy - D / 2], [cx + D / 2, cy + D / 2], [cx - D / 2, cy + D / 2]], cx, cy);
  if (s.kind === 'plate') { const h = Math.max(2, D * 0.12); return rot([[cx - h / 2, cy - D / 2], [cx + h / 2, cy - D / 2], [cx + h / 2, cy + D / 2], [cx - h / 2, cy + D / 2]], cx, cy); }
  // A NACA 4-digit wing section: chord 2.5 D, thickness and camber as a share of it, turned about its quarter chord.
  const C = 2.5 * D, t = s.thickness / 100, m = s.camber / 100, p = 0.4, x0 = cx - C / 2, upper: [number, number][] = [], lower: [number, number][] = [];
  for (let k = 0; k <= 60; k++) {
    const b = (k / 60) * Math.PI, x = (1 - Math.cos(b)) / 2;
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const yc = m ? (x < p ? (m / (p * p)) * (2 * p * x - x * x) : (m / ((1 - p) ** 2)) * (1 - 2 * p + 2 * p * x - x * x)) : 0;
    const dyc = m ? (x < p ? ((2 * m) / (p * p)) * (p - x) : ((2 * m) / ((1 - p) ** 2)) * (p - x)) : 0, th = Math.atan(dyc);
    upper.push([x0 + C * (x - yt * Math.sin(th)), cy + C * (yc + yt * Math.cos(th))]);
    lower.push([x0 + C * (x + yt * Math.sin(th)), cy + C * (yc - yt * Math.cos(th))]);
  }
  return rot([...upper, ...lower.reverse().slice(1, -1)], x0 + C / 4, cy);
}

const inPoly = (p: [number, number][], x: number, y: number) => {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

export class Tunnel {
  readonly nx: number; readonly ny: number;
  f: Float32Array; private g: Float32Array;
  readonly solid: Uint8Array;
  readonly outline: [number, number][];
  /** The shape's size across the flow (cells), for Cd and Re. */
  readonly D: number;
  readonly omega: number;
  steps = 0;
  /** The force on the shape at the last step (lattice units), and Cd and Cl from it. */
  fx = 0; fy = 0;
  constructor(readonly set: FlowSettings) {
    const { nx, ny } = set;
    this.nx = nx; this.ny = ny;
    const n = nx * ny;
    this.f = new Float32Array(9 * n); this.g = new Float32Array(9 * n); this.solid = new Uint8Array(n);
    // A little off the middle: a perfectly symmetric start would keep its wake from ever starting to sway.
    const size = ny * 0.2, cx = nx * 0.26, cy = ny / 2 + 0.37;
    this.outline = shapeOutline(set.shape, cx, cy, size);
    let lo = Infinity, hi = -Infinity;
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (inPoly(this.outline, x + 0.5, y + 0.5)) { this.solid[y * nx + x] = 1; lo = Math.min(lo, y); hi = Math.max(hi, y); }
    this.D = Number.isFinite(lo) ? hi - lo + 1 : size;
    // Re = U·D/ν, ν = (τ − ½)/3; τ kept above 0.505 for stability.
    const nu = (U * this.D) / Math.max(1, set.re), tau = Math.max(0.505, 3 * nu + 0.5);
    this.omega = 1 / tau;
    for (let c = 0; c < n; c++) for (let i = 0; i < 9; i++) this.f[i * n + c] = this.solid[c] ? 0 : eq(i, 1, U, 0);
  }
  get reActual() { return (U * this.D) / ((1 / this.omega - 0.5) / 3); }
  get cd() { return (2 * this.fx) / (U * U * this.D); }
  get cl() { return (2 * this.fy) / (U * U * this.D); }

  /** Cells next to the shape (they need the bounce-back); the rest take the fast path. */
  private near: Uint8Array | null = null;
  private nearShape() {
    const { nx, ny, solid } = this, near = new Uint8Array(nx * ny);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) for (let i = 1; i < 9; i++) {
      const sx = x - CX[i], sy = (y - CY[i] + ny) % ny;
      if (sx >= 0 && sx < nx && solid[sy * nx + sx]) near[y * nx + x] = 1;
    }
    return near;
  }

  /** One step: every cell pulls its packets from its neighbours (bouncing off the shape), then they collide. */
  step() {
    const { nx, ny, f, g, solid, omega } = this, n = nx * ny;
    const near = (this.near ??= this.nearShape());
    let fx = 0, fy = 0;
    const fi = new Float64Array(9);
    const n2 = 2 * n, n3 = 3 * n, n4 = 4 * n, n5 = 5 * n, n6 = 6 * n, n7 = 7 * n, n8 = 8 * n;
    for (let y = 0; y < ny; y++) {
      const rowD = ((y - 1 + ny) % ny) * nx, rowU = ((y + 1) % ny) * nx, row = y * nx;
      for (let x = 0; x < nx; x++) {
        const c = row + x;
        if (solid[c]) continue;
        let f0: number, f1: number, f2: number, f3: number, f4: number, f5: number, f6: number, f7: number, f8: number;
        if (x > 0 && x < nx - 1 && !near[c]) {
          // The fast path: open water all round.
          f0 = f[c]; f1 = f[n + row + x - 1]; f2 = f[n2 + rowD + x]; f3 = f[n3 + row + x + 1]; f4 = f[n4 + rowU + x];
          f5 = f[n5 + rowD + x - 1]; f6 = f[n6 + rowD + x + 1]; f7 = f[n7 + rowU + x + 1]; f8 = f[n8 + rowU + x - 1];
        } else {
          if (x === 0) for (let i = 0; i < 9; i++) fi[i] = eq(i, 1, U, 0); // inflow: steady flow at speed U
          else for (let i = 0; i < 9; i++) {
            let sx = x - CX[i], sy = y - CY[i];
            if (sy < 0) sy += ny; else if (sy >= ny) sy -= ny; // the top and bottom wrap round
            if (sx >= nx) sx = nx - 1; // outflow: as the last column
            const sc = sy * nx + sx;
            if (solid[sc]) {
              // Bounced back off the shape: the packet that left this cell towards it returns, pushing the shape.
              const back = f[OPP[i] * n + c];
              fi[i] = back;
              fx += 2 * back * CX[OPP[i]]; fy += 2 * back * CY[OPP[i]];
            } else fi[i] = f[i * n + sc];
          }
          f0 = fi[0]; f1 = fi[1]; f2 = fi[2]; f3 = fi[3]; f4 = fi[4]; f5 = fi[5]; f6 = fi[6]; f7 = fi[7]; f8 = fi[8];
        }
        const rho = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8;
        const ux = (f1 - f3 + f5 - f6 - f7 + f8) / rho, uy = (f2 - f4 + f5 + f6 - f7 - f8) / rho;
        const uu = 1.5 * (ux * ux + uy * uy), a = omega * rho;
        const w0 = (4 / 9) * a, w1 = a / 9, w5 = a / 36;
        const e1 = 3 * ux, e2 = 3 * uy, e5 = 3 * (ux + uy), e6 = 3 * (uy - ux);
        g[c] = f0 + (w0 * (1 - uu) - omega * f0);
        g[n + c] = f1 + (w1 * (1 + e1 + 0.5 * e1 * e1 - uu) - omega * f1);
        g[n2 + c] = f2 + (w1 * (1 + e2 + 0.5 * e2 * e2 - uu) - omega * f2);
        g[n3 + c] = f3 + (w1 * (1 - e1 + 0.5 * e1 * e1 - uu) - omega * f3);
        g[n4 + c] = f4 + (w1 * (1 - e2 + 0.5 * e2 * e2 - uu) - omega * f4);
        g[n5 + c] = f5 + (w5 * (1 + e5 + 0.5 * e5 * e5 - uu) - omega * f5);
        g[n6 + c] = f6 + (w5 * (1 + e6 + 0.5 * e6 * e6 - uu) - omega * f6);
        g[n7 + c] = f7 + (w5 * (1 - e5 + 0.5 * e5 * e5 - uu) - omega * f7);
        g[n8 + c] = f8 + (w5 * (1 - e6 + 0.5 * e6 * e6 - uu) - omega * f8);
      }
    }
    this.f = g; this.g = f;
    this.fx = fx; this.fy = fy;
    this.steps++;
  }

  /** Speed, pressure or swirl (vorticity) at each cell (0 in the shape). */
  field(kind: 'speed' | 'pressure' | 'vorticity', out = new Float32Array(this.nx * this.ny)): Float32Array {
    const { nx, ny, f, solid } = this, n = nx * ny, ux = new Float32Array(n), uy = new Float32Array(n), rho = new Float32Array(n);
    for (let c = 0; c < n; c++) {
      if (solid[c]) continue;
      let r = 0, a = 0, b = 0;
      for (let i = 0; i < 9; i++) { const v = f[i * n + c]; r += v; a += CX[i] * v; b += CY[i] * v; }
      rho[c] = r; ux[c] = a / r; uy[c] = b / r;
    }
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const c = y * nx + x;
      if (solid[c]) { out[c] = 0; continue; }
      if (kind === 'speed') out[c] = Math.hypot(ux[c], uy[c]) / U;
      else if (kind === 'pressure') out[c] = ((rho[c] - 1) / 3) / (0.5 * U * U); // as a pressure coefficient
      else {
        const xp = Math.min(nx - 1, x + 1), xm = Math.max(0, x - 1), yp = (y + 1) % ny, ym = (y - 1 + ny) % ny;
        out[c] = ((uy[y * nx + xp] - uy[y * nx + xm]) / 2 - (ux[yp * nx + x] - ux[ym * nx + x]) / 2) * (this.D / U);
      }
    }
    return out;
  }

  /** The velocity at a point (bilinear between cells), for tracer particles. */
  velocity(px: number, py: number): [number, number] {
    const { nx, ny, f } = this, n = nx * ny;
    const x0 = Math.max(0, Math.min(nx - 2, Math.floor(px - 0.5))), y0 = Math.max(0, Math.min(ny - 2, Math.floor(py - 0.5))), tx = px - 0.5 - x0, ty = py - 0.5 - y0;
    let vx = 0, vy = 0;
    for (const [dx, dy, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]] as const) {
      const c = (y0 + dy) * nx + x0 + dx;
      if (this.solid[c]) continue;
      let r = 0, a = 0, b = 0;
      for (let i = 0; i < 9; i++) { const v = f[i * n + c]; r += v; a += CX[i] * v; b += CY[i] * v; }
      vx += (w * a) / r; vy += (w * b) / r;
    }
    return [vx, vy];
  }
}

function eq(i: number, rho: number, ux: number, uy: number) {
  const cu = 3 * (CX[i] * ux + CY[i] * uy);
  return W[i] * rho * (1 + cu + 0.5 * cu * cu - 1.5 * (ux * ux + uy * uy));
}

/** How often a signal swings (crossings of its mean, upwards), per step: for the wake's shedding (Strouhal number). */
export function swingRate(v: number[]): number | null {
  if (v.length < 40) return null;
  const mean = v.reduce((s, x) => s + x, 0) / v.length, ups: number[] = [];
  for (let i = 1; i < v.length; i++) if (v[i - 1] < mean && v[i] >= mean) ups.push(i);
  if (ups.length < 3) return null;
  return (ups.length - 1) / (ups[ups.length - 1] - ups[0]);
}
