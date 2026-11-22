// Hyperion Simulate (M404): the solver for the large, sparse, symmetric systems a mesh gives (K u = f). The nodes are
// numbered so neighbours get near numbers (reverse Cuthill–McKee), which keeps every column of the matrix short (its
// "skyline"); the matrix is then factored once as L·D·Lᵀ in place, after which each solve is quick (vibration modes
// solve many times with one factor).

/** A numbering of nodes (order[k] = the node that comes k-th) that keeps neighbours close: reverse Cuthill–McKee. */
export function rcm(adj: number[][]): Int32Array {
  const n = adj.length, seen = new Uint8Array(n), order: number[] = [];
  const deg = (i: number) => adj[i].length;
  const bfs = (s: number) => {
    const dist = new Int32Array(n).fill(-1), q = [s];
    dist[s] = 0;
    for (let h = 0; h < q.length; h++) for (const v of adj[q[h]]) if (dist[v] < 0) { dist[v] = dist[q[h]] + 1; q.push(v); }
    return { q, dist };
  };
  for (let s0 = 0; s0 < n; s0++) {
    if (seen[s0]) continue;
    // A far-away start: from the least connected node of this piece, twice to its farthest node.
    let s = s0;
    for (const v of bfs(s0).q) if (deg(v) < deg(s)) s = v;
    for (let k = 0; k < 2; k++) { const { q, dist } = bfs(s); const far = dist[q[q.length - 1]]; s = q.filter((v) => dist[v] === far).sort((a, b) => deg(a) - deg(b))[0]; }
    const q = [s];
    seen[s] = 1;
    for (let h = 0; h < q.length; h++) {
      const next = adj[q[h]].filter((v) => !seen[v]).sort((a, b) => deg(a) - deg(b));
      for (const v of next) { seen[v] = 1; q.push(v); }
    }
    order.push(...q);
  }
  return Int32Array.from(order.reverse());
}

export class Skyline {
  readonly start: Int32Array;
  readonly a: Float64Array;
  readonly d: Float64Array;
  private factored = false;
  /** `first[j]`: the first row stored in column j (the matrix's skyline). */
  constructor(readonly n: number, readonly first: Int32Array) {
    this.start = new Int32Array(n + 1);
    for (let j = 0; j < n; j++) this.start[j + 1] = this.start[j] + (j - first[j] + 1);
    this.a = new Float64Array(this.start[n]);
    this.d = new Float64Array(n);
  }
  get size() { return this.start[this.n]; }
  add(i: number, j: number, v: number) {
    if (i > j) { const t = i; i = j; j = t; }
    this.a[this.start[j] + i - this.first[j]] += v;
  }
  diag(j: number) { return this.a[this.start[j] + j - this.first[j]]; }
  /** Holds a value at 0: its row and column emptied and `diag` (1) on the diagonal (0 for a mass matrix). */
  fix(rows: Uint8Array, diag = 1) {
    const { n, first, start, a } = this;
    for (let j = 0; j < n; j++) {
      const fj = first[j], sj = start[j];
      if (rows[j]) { for (let i = fj; i < j; i++) a[sj + i - fj] = 0; a[sj + j - fj] = diag; continue; }
      for (let i = fj; i < j; i++) if (rows[i]) a[sj + i - fj] = 0;
    }
  }
  /** The matrix times x (before `factor`: it reads the matrix itself). */
  mul(x: Float64Array): Float64Array {
    const { n, first, start, a } = this, y = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const fj = first[j], sj = start[j], xj = x[j];
      let s = 0;
      for (let i = fj; i < j; i++) { const v = a[sj + i - fj]; y[i] += v * xj; s += v * x[i]; }
      y[j] += s + a[sj + j - fj] * xj;
    }
    return y;
  }
  /** L·D·Lᵀ in place. Throws when the part can still move (a pivot vanishes). */
  factor() {
    const { n, first, start, a, d } = this;
    for (let j = 0; j < n; j++) {
      const fj = first[j], sj = start[j], orig = Math.abs(a[sj + j - fj]);
      for (let i = fj + 1; i < j; i++) {
        const fi = first[i], si = start[i], k0 = Math.max(fi, fj);
        let s = 0;
        for (let k = k0; k < i; k++) s += a[si + k - fi] * a[sj + k - fj];
        a[sj + i - fj] -= s;
      }
      let djj = a[sj + j - fj];
      for (let i = fj; i < j; i++) { const g = a[sj + i - fj], l = g / d[i]; a[sj + i - fj] = l; djj -= l * g; }
      if (!(Math.abs(djj) > 1e-10 * Math.max(orig, 1e-300))) throw new MechanismError(j);
      d[j] = djj;
      a[sj + j - fj] = 1;
    }
    this.factored = true;
  }
  /** x with K x = b (after `factor`). */
  solve(b: Float64Array): Float64Array {
    if (!this.factored) throw new Error('factor first');
    const { n, first, start, a, d } = this, y = Float64Array.from(b);
    for (let j = 0; j < n; j++) { const fj = first[j], sj = start[j]; let s = 0; for (let i = fj; i < j; i++) s += a[sj + i - fj] * y[i]; y[j] -= s; }
    for (let j = 0; j < n; j++) y[j] /= d[j];
    for (let j = n - 1; j >= 0; j--) { const fj = first[j], sj = start[j], yj = y[j]; for (let i = fj; i < j; i++) y[i] -= a[sj + i - fj] * yj; }
    return y;
  }
}

/** The part isn't held: some way it can move or turn freely (the unknown where it showed). */
export class MechanismError extends Error {
  constructor(readonly at: number) { super('The part isn’t held firmly: it can still slide or turn. Add a support (a fixed edge, or slides on two edges).'); }
}
