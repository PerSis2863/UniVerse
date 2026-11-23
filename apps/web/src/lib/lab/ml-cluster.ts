import type { Rows } from './ml';

// Hyperion's tree-style (hierarchical) clustering (M420, the owner: "tree-style clustering"): distances between rows
// (pdist), joining the two nearest groups again and again (linkage, by the Lance–Williams update for single, complete,
// average, weighted, centroid, median and Ward), cutting the tree into groups (cluster), how faithfully the tree keeps
// the distances (cophenet), how unusual each join is (inconsistent), and the dendrogram's layout.

export type Metric = 'euclidean' | 'squaredeuclidean' | 'seuclidean' | 'cityblock' | 'chebychev' | 'minkowski' | 'cosine' | 'correlation' | 'hamming';
export type Method = 'single' | 'complete' | 'average' | 'weighted' | 'centroid' | 'median' | 'ward';
export const METRICS: Metric[] = ['euclidean', 'squaredeuclidean', 'seuclidean', 'cityblock', 'chebychev', 'minkowski', 'cosine', 'correlation', 'hamming'];
export const METHODS: Method[] = ['single', 'complete', 'average', 'weighted', 'centroid', 'median', 'ward'];
export const MAX_ROWS = 2000;

/** Distances between every pair of rows, in the order (1,2), (1,3), …, (1,n), (2,3), … */
export function pdist(X: Rows, metric: Metric = 'euclidean', p = 2): Float64Array {
  const n = X.length, m = X[0]?.length ?? 0, out = new Float64Array((n * (n - 1)) / 2);
  let scale: number[] | null = null;
  if (metric === 'seuclidean') {
    scale = Array.from({ length: m }, (_, j) => { const mu = X.reduce((s, r) => s + r[j], 0) / n, v = X.reduce((s, r) => s + (r[j] - mu) ** 2, 0) / Math.max(1, n - 1); return v > 0 ? 1 / v : 1; });
  }
  const centred = metric === 'correlation' ? X.map((r) => { const mu = r.reduce((s, v) => s + v, 0) / m; return r.map((v) => v - mu); }) : X;
  let k = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = centred[i], b = centred[j];
    let d = 0;
    if (metric === 'cosine' || metric === 'correlation') {
      let ab = 0, aa = 0, bb = 0;
      for (let q = 0; q < m; q++) { ab += a[q] * b[q]; aa += a[q] ** 2; bb += b[q] ** 2; }
      d = 1 - ab / Math.sqrt(aa * bb || 1);
    } else if (metric === 'chebychev') { for (let q = 0; q < m; q++) d = Math.max(d, Math.abs(a[q] - b[q])); }
    else if (metric === 'cityblock') { for (let q = 0; q < m; q++) d += Math.abs(a[q] - b[q]); }
    else if (metric === 'minkowski') { for (let q = 0; q < m; q++) d += Math.abs(a[q] - b[q]) ** p; d **= 1 / p; }
    else if (metric === 'hamming') { for (let q = 0; q < m; q++) d += a[q] !== b[q] ? 1 : 0; d /= m; }
    else { for (let q = 0; q < m; q++) d += (scale ? scale[q] : 1) * (a[q] - b[q]) ** 2; if (metric !== 'squaredeuclidean') d = Math.sqrt(d); }
    out[k++] = d;
  }
  return out;
}
/** The number of rows behind a list of pair distances. */
export const rowsFor = (len: number) => { const n = Math.round((1 + Math.sqrt(1 + 8 * len)) / 2); return (n * (n - 1)) / 2 === len ? n : -1; };

/** Joins the two nearest groups until one is left. Each row of the result: the two groups joined (1…n are the rows,
 * n + k the group made by row k) and how far apart they were. Centroid, median and Ward work on squared distances
 * and report plain ones. */
export function linkage(D: Float64Array, method: Method = 'single'): [number, number, number][] {
  const n = rowsFor(D.length);
  if (n < 2) throw new Error('linkage needs the distances between at least two rows.');
  if (n > MAX_ROWS) throw new Error(`linkage here joins at most ${MAX_ROWS.toLocaleString()} rows.`);
  const sq = method === 'centroid' || method === 'median' || method === 'ward', M = new Float64Array(n * n);
  let k = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const v = sq ? D[k] ** 2 : D[k]; M[i * n + j] = v; M[j * n + i] = v; k++; }
  const size = new Array(n).fill(1), id = Array.from({ length: n }, (_, i) => i + 1), alive = new Array(n).fill(true);
  // Each row's nearest live neighbour.
  const nn = new Int32Array(n), nd = new Float64Array(n);
  const refresh = (i: number) => { let b = -1, bd = Infinity; for (let j = 0; j < n; j++) if (j !== i && alive[j] && M[i * n + j] < bd) { bd = M[i * n + j]; b = j; } nn[i] = b; nd[i] = bd; };
  for (let i = 0; i < n; i++) refresh(i);
  const Z: [number, number, number][] = [];
  for (let step = 0; step < n - 1; step++) {
    let a = -1;
    for (let i = 0; i < n; i++) if (alive[i] && (a < 0 || nd[i] < nd[a])) a = i;
    const b = nn[a], dab = M[a * n + b], na = size[a], nb = size[b];
    Z.push([Math.min(id[a], id[b]), Math.max(id[a], id[b]), sq ? Math.sqrt(Math.max(0, dab)) : dab]);
    // The joined group lives on in a's place.
    alive[b] = false;
    for (let c = 0; c < n; c++) {
      if (!alive[c] || c === a) continue;
      const dac = M[a * n + c], dbc = M[b * n + c], nc = size[c];
      let v: number;
      switch (method) {
        case 'single': v = Math.min(dac, dbc); break;
        case 'complete': v = Math.max(dac, dbc); break;
        case 'average': v = (na * dac + nb * dbc) / (na + nb); break;
        case 'weighted': v = (dac + dbc) / 2; break;
        case 'centroid': v = (na * dac + nb * dbc) / (na + nb) - (na * nb * dab) / (na + nb) ** 2; break;
        case 'median': v = dac / 2 + dbc / 2 - dab / 4; break;
        default: v = ((na + nc) * dac + (nb + nc) * dbc - nc * dab) / (na + nb + nc);
      }
      M[a * n + c] = v; M[c * n + a] = v;
    }
    size[a] = na + nb; id[a] = n + step + 1;
    for (let c = 0; c < n; c++) if (alive[c] && (c === a || nn[c] === a || nn[c] === b || M[c * n + a] < nd[c])) refresh(c);
  }
  return Z;
}

/** The rows under each group: for leaves 1…n and groups n+1…2n−1. */
function members(Z: [number, number, number][], n: number) {
  const m: number[][] = Array.from({ length: n }, (_, i) => [i]);
  for (const [a, b] of Z) m.push([...m[a - 1], ...m[b - 1]]);
  return m;
}
/** Group numbers 1…k for each row, from joining while `keep(row k)` says so (in the tree's order). Groups are numbered
 * by their first row. */
function cut(Z: [number, number, number][], n: number, joined: boolean[]) {
  const parent = Array.from({ length: 2 * n - 1 }, (_, i) => i), find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  Z.forEach(([a, b], k) => { if (joined[k]) { parent[find(a - 1)] = n + k; parent[find(b - 1)] = n + k; } });
  const label = new Map<number, number>(), out: number[] = [];
  for (let i = 0; i < n; i++) { const r = find(i); if (!label.has(r)) label.set(r, label.size + 1); out.push(label.get(r)!); }
  return out;
}
/** At most k groups: the last k − 1 joins undone. */
export const clusterMax = (Z: [number, number, number][], k: number) => { const n = Z.length + 1; return cut(Z, n, Z.map((_, i) => i < n - Math.max(1, Math.min(n, k)))); };
/** Groups joined below a height (with every join under them too). */
export function clusterCutoff(Z: [number, number, number][], c: number, by: number[] = Z.map((r) => r[2])) {
  const n = Z.length + 1, ok = new Array(Z.length).fill(false);
  Z.forEach(([a, b], k) => { const sub = (x: number) => x <= n || ok[x - n - 1]; ok[k] = by[k] <= c && sub(a) && sub(b); });
  return cut(Z, n, ok);
}
/** How unusual each join's height is against the joins just below it (to `depth` levels): mean, spread, count and
 * the coefficient (height − mean)/spread. */
export function inconsistent(Z: [number, number, number][], depth = 2) {
  const n = Z.length + 1;
  return Z.map((_, k) => {
    const hs: number[] = [], walk = (row: number, d: number) => { hs.push(Z[row][2]); if (d <= 1) return; for (const c of [Z[row][0], Z[row][1]]) if (c > n) walk(c - n - 1, d - 1); };
    walk(k, depth);
    const mean = hs.reduce((s, v) => s + v, 0) / hs.length, sd = hs.length > 1 ? Math.sqrt(hs.reduce((s, v) => s + (v - mean) ** 2, 0) / (hs.length - 1)) : 0;
    return [mean, sd, hs.length, sd > 0 ? (Z[k][2] - mean) / sd : 0];
  });
}
/** The tree's own distance between each pair (the height where they first share a group), and its correlation with D. */
export function cophenet(Z: [number, number, number][], D?: Float64Array) {
  const n = Z.length + 1, m = members(Z, n), C = new Float64Array((n * (n - 1)) / 2), at = (i: number, j: number) => (i < j ? i * n - (i * (i + 1)) / 2 + (j - i - 1) : j * n - (j * (j + 1)) / 2 + (i - j - 1));
  Z.forEach(([a, b, h]) => { for (const i of m[a - 1]) for (const j of m[b - 1]) C[at(i, j)] = h; });
  if (!D) return { c: NaN, C };
  const mean = (v: Float64Array) => v.reduce((s, x) => s + x, 0) / v.length, mc = mean(C), md = mean(D);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < C.length; i++) { sxy += (C[i] - mc) * (D[i] - md); sxx += (C[i] - mc) ** 2; syy += (D[i] - md) ** 2; }
  return { c: sxy / Math.sqrt(sxx * syy), C };
}
/** The dendrogram's drawing: leaves along x (at most p of them: deeper groups shown as one leaf), each join a ∏ from
 * its two children up to its height, coloured by the group it falls in below `threshold`. */
export function dendrogramLayout(Z: [number, number, number][], p = 30, threshold?: number) {
  const n = Z.length + 1, P = p > 0 ? Math.min(p, n) : n, top = Z.length - (P - 1);
  // Shown leaves: rows, or groups made by the first `top` joins that nothing shown splits.
  const isLeaf = (x: number) => x <= n || x - n - 1 < top, order: number[] = [];
  const visit = (x: number) => { if (isLeaf(x)) { order.push(x); return; } visit(Z[x - n - 1][0]); visit(Z[x - n - 1][1]); };
  visit(2 * n - 1);
  const xOf = new Map<number, number>(), hOf = new Map<number, number>();
  order.forEach((x, i) => { xOf.set(x, i + 1); hOf.set(x, 0); });
  const t = threshold ?? 0.7 * Math.max(...Z.map((r) => r[2])), m = members(Z, n);
  // A join below the threshold takes the colour of its group (the groups the tree falls into when cut there).
  const below = new Array(Z.length).fill(false);
  Z.forEach(([a, b, h], k) => { const sub = (x: number) => x <= n || below[x - n - 1]; below[k] = h < t && sub(a) && sub(b); });
  const groups = cut(Z, n, below), colourOf = new Map<number, number>();
  const links: { x: number[]; y: number[]; colour: number }[] = [];
  for (let k = top; k < Z.length; k++) {
    const [a, b, h] = Z[k], node = n + k + 1;
    xOf.set(node, (xOf.get(a)! + xOf.get(b)!) / 2); hOf.set(node, h);
    let colour = -1;
    if (below[k]) { const g = groups[m[node - 1][0]]; if (!colourOf.has(g)) colourOf.set(g, colourOf.size); colour = colourOf.get(g)!; }
    links.push({ x: [xOf.get(a)!, xOf.get(a)!, xOf.get(b)!, xOf.get(b)!], y: [hOf.get(a)!, h, h, hOf.get(b)!], colour });
  }
  // Shown leaves stand for these rows (the dendrogram's T output): each row's leaf number.
  const leafOf = new Array(n).fill(0);
  order.forEach((x, i) => { for (const r of m[x - 1]) leafOf[r] = i + 1; });
  return { order, links, leafOf, threshold: t };
}
