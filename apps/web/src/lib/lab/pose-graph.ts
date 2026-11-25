// Hyperion's pose graph (M484b), pure: robot poses [x y heading] as nodes, measured moves between them as edges, and
// Gauss–Newton to find the poses that agree best with every edge at once. Used by SLAM when the robot recognises a place
// it has been before (a loop closure): that one extra edge pulls the whole path, and so the map, back into shape.
// The normal equations are sparse (one 3 × 3 block per node and per edge), solved by conjugate gradients with a
// block-diagonal preconditioner, so graphs of thousands of poses take milliseconds. M484c: loop closures may be marked
// robust, and then a wrong one is weighed down (dynamic covariance scaling) instead of bending the map.

export type Pose = [number, number, number];
export interface Edge {
  i: number; j: number; z: Pose; info: [number, number, number];
  /** M484c: a loop closure that might be wrong. Such edges are weighed down by dynamic covariance scaling (DCS) when
   * they disagree with the rest of the graph, so one bad match can't bend the whole map. */
  robust?: boolean;
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Pose b seen from pose a (in a's frame). */
export function relative(a: Pose, b: Pose): Pose {
  const c = Math.cos(a[2]), s = Math.sin(a[2]), dx = b[0] - a[0], dy = b[1] - a[1];
  return [c * dx + s * dy, -s * dx + c * dy, wrap(b[2] - a[2])];
}
/** Pose a moved by z (z in a's frame). */
export const compose = (a: Pose, z: Pose): Pose => [a[0] + Math.cos(a[2]) * z[0] - Math.sin(a[2]) * z[1], a[1] + Math.sin(a[2]) * z[0] + Math.cos(a[2]) * z[1], wrap(a[2] + z[2])];

/** The total weighted squared error of the edges. */
export function graphError(nodes: Pose[], edges: Edge[]) {
  let e2 = 0;
  for (const ed of edges) { const r = relative(nodes[ed.i], nodes[ed.j]), e = [r[0] - ed.z[0], r[1] - ed.z[1], wrap(r[2] - ed.z[2])]; e2 += ed.info[0] * e[0] ** 2 + ed.info[1] * e[1] ** 2 + ed.info[2] * e[2] ** 2; }
  return e2;
}

const chi2 = (nodes: Pose[], ed: Edge) => { const r = relative(nodes[ed.i], nodes[ed.j]), e = [r[0] - ed.z[0], r[1] - ed.z[1], wrap(r[2] - ed.z[2])]; return ed.info[0] * e[0] ** 2 + ed.info[1] * e[1] ** 2 + ed.info[2] * e[2] ** 2; };
/** Dynamic covariance scaling (Agarwal et al., 2013): a robust edge's weight is s² with s = min(1, 2Φ / (Φ + χ²)), so an
 * edge that agrees keeps its full weight and one far off fades towards nothing. Plain edges keep 1. Plain DCS trusts
 * the starting poses; `optimise` anneals Φ so a badly drifted start doesn't dismiss the good closures too. */
export const dcsWeights = (nodes: Pose[], edges: Edge[], phi = 1) => edges.map((ed) => (ed.robust ? Math.min(1, (2 * phi) / (phi + chi2(nodes, ed))) ** 2 : 1));
/** Gauss–Newton on the graph, node `fixed` held where it is. Returns new poses. Robust edges are re-weighed by DCS at
 * every step (`phi`, default 1: about one standard deviation's worth of disagreement is tolerated in full). */
export function optimise(start: Pose[], edges: Edge[], o: { iterations?: number; fixed?: number; phi?: number } = {}): Pose[] {
  const n = start.length, N = 3 * n, fixed = o.fixed ?? 0, anyRobust = edges.some((e) => e.robust);
  let x = start.map((p) => [...p] as Pose);
  for (let it = 0; it < (o.iterations ?? (anyRobust ? 40 : 8)); it++) {
    // Graduated: Φ starts ten thousand times larger and halves each step down to its value, so a closure isn't
    // dismissed only because the path it should fix starts far off; the wrong ones stand out as the rest agree.
    const phiNow = (o.phi ?? 1) * Math.max(1, 1e4 * 0.5 ** it), wts = anyRobust ? dcsWeights(x, edges, phiNow) : null;
    // Blocks of H: the diagonal per node, one off-diagonal per edge.
    const diag = Array.from({ length: n }, () => new Float64Array(9)), off: { i: number; j: number; B: Float64Array }[] = [], b = new Float64Array(N);
    edges.forEach((ed, q) => {
      const a = x[ed.i], c = x[ed.j], ca = Math.cos(a[2]), sa = Math.sin(a[2]), dx = c[0] - a[0], dy = c[1] - a[1];
      const r: Pose = [ca * dx + sa * dy, -sa * dx + ca * dy, wrap(c[2] - a[2])], e = [r[0] - ed.z[0], r[1] - ed.z[1], wrap(r[2] - ed.z[2])];
      // ∂e/∂a and ∂e/∂c (rows: x, y, θ of the error; columns: x, y, θ of the pose).
      const A = [-ca, -sa, -sa * dx + ca * dy, sa, -ca, -ca * dx - sa * dy, 0, 0, -1];
      const C = [ca, sa, 0, -sa, ca, 0, 0, 0, 1];
      const W = wts ? ed.info.map((v) => v * wts[q]) : ed.info;
      const JtWJ = (P: number[], Q: number[]) => { const o2 = new Float64Array(9); for (let r1 = 0; r1 < 3; r1++) for (let c1 = 0; c1 < 3; c1++) { let s = 0; for (let k = 0; k < 3; k++) s += P[k * 3 + r1] * W[k] * Q[k * 3 + c1]; o2[r1 * 3 + c1] = s; } return o2; };
      const Haa = JtWJ(A, A), Hcc = JtWJ(C, C), Hac = JtWJ(A, C);
      for (let k = 0; k < 9; k++) { diag[ed.i][k] += Haa[k]; diag[ed.j][k] += Hcc[k]; }
      off.push({ i: ed.i, j: ed.j, B: Hac });
      for (let r1 = 0; r1 < 3; r1++) { let sa2 = 0, sc2 = 0; for (let k = 0; k < 3; k++) { sa2 += A[k * 3 + r1] * W[k] * e[k]; sc2 += C[k * 3 + r1] * W[k] * e[k]; } b[3 * ed.i + r1] += sa2; b[3 * ed.j + r1] += sc2; }
    });
    // Hold the fixed node: a stiff prior keeps it where it is.
    for (let k = 0; k < 3; k++) diag[fixed][k * 4] += 1e9;
    const mul = (v: Float64Array) => {
      const out = new Float64Array(N);
      for (let i = 0; i < n; i++) for (let r1 = 0; r1 < 3; r1++) { let s = 0; for (let c1 = 0; c1 < 3; c1++) s += diag[i][r1 * 3 + c1] * v[3 * i + c1]; out[3 * i + r1] += s; }
      for (const { i, j, B } of off) for (let r1 = 0; r1 < 3; r1++) for (let c1 = 0; c1 < 3; c1++) { out[3 * i + r1] += B[r1 * 3 + c1] * v[3 * j + c1]; out[3 * j + c1] += B[r1 * 3 + c1] * v[3 * i + r1]; }
      return out;
    };
    // The block-diagonal preconditioner: each node's 3 × 3 block inverted.
    const inv = diag.map((D) => {
      const [a, b1, c, d, e, f, g, h, k] = D, det = a * (e * k - f * h) - b1 * (d * k - f * g) + c * (d * h - e * g) || 1e-12;
      return [(e * k - f * h) / det, (c * h - b1 * k) / det, (b1 * f - c * e) / det, (f * g - d * k) / det, (a * k - c * g) / det, (c * d - a * f) / det, (d * h - e * g) / det, (b1 * g - a * h) / det, (a * e - b1 * d) / det];
    });
    const prec = (v: Float64Array) => { const out = new Float64Array(N); for (let i = 0; i < n; i++) for (let r1 = 0; r1 < 3; r1++) { let s = 0; for (let c1 = 0; c1 < 3; c1++) s += inv[i][r1 * 3 + c1] * v[3 * i + c1]; out[3 * i + r1] = s; } return out; };
    // Solve H dx = −b by preconditioned conjugate gradients.
    const dxv = new Float64Array(N), rr = Float64Array.from(b, (v) => -v);
    const p = Float64Array.from(prec(rr));
    let z = p.slice(), rz = rr.reduce((s, v, k) => s + v * z[k], 0);
    const r0 = Math.sqrt(rr.reduce((s, v) => s + v * v, 0));
    for (let k = 0; k < Math.max(200, 4 * n) && rz > 0; k++) {
      const Ap = mul(p), alpha = rz / (p.reduce((s, v, q) => s + v * Ap[q], 0) || 1e-300);
      for (let q = 0; q < N; q++) { dxv[q] += alpha * p[q]; rr[q] -= alpha * Ap[q]; }
      if (Math.sqrt(rr.reduce((s, v) => s + v * v, 0)) < 1e-10 * (r0 || 1)) break;
      z = prec(rr);
      const rz2 = rr.reduce((s, v, q) => s + v * z[q], 0);
      for (let q = 0; q < N; q++) p[q] = z[q] + (rz2 / rz) * p[q];
      rz = rz2;
    }
    x = x.map((pp, i) => [pp[0] + dxv[3 * i], pp[1] + dxv[3 * i + 1], wrap(pp[2] + dxv[3 * i + 2])] as Pose);
    if (Math.max(...Array.from(dxv, Math.abs)) < 1e-6 && phiNow === (o.phi ?? 1)) break;
  }
  return x;
}
