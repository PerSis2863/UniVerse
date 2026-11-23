// Hyperion's DNA and protein tools (M494, the owner's list, group 7: computational biology): a sequence's counts and
// GC content, its complement and reverse complement, translation by the standard genetic code, open reading frames in
// all six frames, pairwise alignment (Needleman–Wunsch for whole sequences, Smith–Waterman for the best local match,
// both with affine gaps by Gotoh's method), BLOSUM62 for proteins, distances between sequences (p-distance,
// Jukes–Cantor) and trees from them (UPGMA, neighbour joining) as Newick text. Pure: no language values here.

export const clean = (s: string) => s.replace(/[\s\d]/g, '');
const COMP: Record<string, string> = { A: 'T', T: 'A', U: 'A', G: 'C', C: 'G', N: 'N', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K', B: 'V', V: 'B', D: 'H', H: 'D' };
export const complement = (s: string) => [...s].map((c) => { const u = c.toUpperCase(), r = COMP[u] ?? c; return c === u ? r : r.toLowerCase(); }).join('');
export const reverseComplement = (s: string) => [...complement(s)].reverse().join('');
export const gcContent = (s: string) => { const t = s.toUpperCase().replace(/[^ACGTU]/g, ''); return t.length ? [...t].filter((c) => c === 'G' || c === 'C').length / t.length : NaN; };
export const counts = (s: string) => { const o: Record<string, number> = { A: 0, C: 0, G: 0, T: 0, Other: 0 }; for (const c of s.toUpperCase().replace(/U/g, 'T')) { if (c in o && c !== 'Other') o[c]++; else if (!/\s/.test(c)) o.Other++; } return o; };

// The standard genetic code, codons in the order TCAG × TCAG × TCAG.
const BASES = 'TCAG', AAS = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
export function codonToAA(codon: string): string {
  const c = codon.toUpperCase().replace(/U/g, 'T');
  const i = BASES.indexOf(c[0]), j = BASES.indexOf(c[1]), k = BASES.indexOf(c[2]);
  return i < 0 || j < 0 || k < 0 ? 'X' : AAS[16 * i + 4 * j + k];
}
/** Translation from `frame` (1–3) to the end, stops as '*'. */
export const translate = (s: string, frame = 1) => { const t = s.toUpperCase().replace(/U/g, 'T'); let out = ''; for (let i = frame - 1; i + 3 <= t.length; i += 3) out += codonToAA(t.slice(i, i + 3)); return out; };

export interface Orf { strand: 1 | -1; frame: number; start: number; stop: number; length: number; protein: string }
/** Open reading frames (ATG … stop) of at least `minCodons` codons on both strands; positions are 1-based on the
 * given strand's own coordinates turned back to the original (start < stop on the forward strand, start > stop on
 * the reverse). The stop codon is included in the span, not in the protein. */
export function orfs(s: string, minCodons = 30): Orf[] {
  const fwd = s.toUpperCase().replace(/U/g, 'T'), n = fwd.length, out: Orf[] = [];
  for (const strand of [1, -1] as const) {
    const t = strand === 1 ? fwd : reverseComplement(fwd);
    for (let f = 0; f < 3; f++) {
      let open = -1;
      for (let i = f; i + 3 <= n; i += 3) {
        const aa = codonToAA(t.slice(i, i + 3));
        if (open < 0 && t.slice(i, i + 3) === 'ATG') open = i;
        else if (open >= 0 && aa === '*') {
          const codons = (i - open) / 3;
          if (codons >= minCodons) {
            const a = open + 1, b = i + 3;
            out.push({ strand, frame: f + 1, start: strand === 1 ? a : n - a + 1, stop: strand === 1 ? b : n - b + 1, length: b - a + 1, protein: translate(t.slice(open, i)) });
          }
          open = -1;
        }
      }
    }
  }
  return out.sort((x, y) => y.length - x.length);
}

// BLOSUM62 (Henikoff and Henikoff 1992).
const B62_AAS = 'ARNDCQEGHILKMFPSTWYVBZX*';
const B62 = `4 -1 -2 -2 0 -1 -1 0 -2 -1 -1 -1 -1 -2 -1 1 0 -3 -2 0 -2 -1 0 -4
-1 5 0 -2 -3 1 0 -2 0 -3 -2 2 -1 -3 -2 -1 -1 -3 -2 -3 -1 0 -1 -4
-2 0 6 1 -3 0 0 0 1 -3 -3 0 -2 -3 -2 1 0 -4 -2 -3 3 0 -1 -4
-2 -2 1 6 -3 0 2 -1 -1 -3 -4 -1 -3 -3 -1 0 -1 -4 -3 -3 4 1 -1 -4
0 -3 -3 -3 9 -3 -4 -3 -3 -1 -1 -3 -1 -2 -3 -1 -1 -2 -2 -1 -3 -3 -2 -4
-1 1 0 0 -3 5 2 -2 0 -3 -2 1 0 -3 -1 0 -1 -2 -1 -2 0 3 -1 -4
-1 0 0 2 -4 2 5 -2 0 -3 -3 1 -2 -3 -1 0 -1 -3 -2 -2 1 4 -1 -4
0 -2 0 -1 -3 -2 -2 6 -2 -4 -4 -2 -3 -3 -2 0 -2 -2 -3 -3 -1 -2 -1 -4
-2 0 1 -1 -3 0 0 -2 8 -3 -3 -1 -2 -1 -2 -1 -2 -2 2 -3 0 0 -1 -4
-1 -3 -3 -3 -1 -3 -3 -4 -3 4 2 -3 1 0 -3 -2 -1 -3 -1 3 -3 -3 -1 -4
-1 -2 -3 -4 -1 -2 -3 -4 -3 2 4 -2 2 0 -3 -2 -1 -2 -1 1 -4 -3 -1 -4
-1 2 0 -1 -3 1 1 -2 -1 -3 -2 5 -1 -3 -1 0 -1 -3 -2 -2 0 1 -1 -4
-1 -1 -2 -3 -1 0 -2 -3 -2 1 2 -1 5 0 -2 -1 -1 -1 -1 1 -3 -1 -1 -4
-2 -3 -3 -3 -2 -3 -3 -3 -1 0 0 -3 0 6 -4 -2 -2 1 3 -1 -3 -3 -1 -4
-1 -2 -2 -1 -3 -1 -1 -2 -2 -3 -3 -1 -2 -4 7 -1 -1 -4 -3 -2 -2 -1 -2 -4
1 -1 1 0 -1 0 0 0 -1 -2 -2 0 -1 -2 -1 4 1 -3 -2 -2 0 0 0 -4
0 -1 0 -1 -1 -1 -1 -2 -2 -1 -1 -1 -1 -2 -1 1 5 -2 -2 0 -1 -1 0 -4
-3 -3 -4 -4 -2 -2 -3 -2 -2 -3 -2 -3 -1 1 -4 -3 -2 11 2 -3 -4 -3 -2 -4
-2 -2 -2 -3 -2 -1 -2 -3 2 -1 -1 -2 -1 3 -3 -2 -2 2 7 -1 -3 -2 -1 -4
0 -3 -3 -3 -1 -2 -2 -3 -3 3 1 -2 1 -1 -2 -2 0 -3 -1 4 -3 -2 -1 -4
-2 -1 3 4 -3 0 1 -1 0 -3 -4 0 -3 -3 -2 0 -1 -4 -3 -3 4 1 -1 -4
-1 0 0 1 -3 3 4 -2 0 -3 -3 1 -1 -3 -1 0 -1 -3 -2 -2 1 4 -1 -4
0 -1 -1 -1 -2 -1 -1 -1 -1 -1 -1 -1 -1 -1 -2 0 0 -2 -1 -1 -1 -1 -1 -4
-4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 1`.split('\n').map((r) => r.trim().split(/\s+/).map(Number));
export type Scorer = (a: string, b: string) => number;
export const blosum62: Scorer = (a, b) => { const i = B62_AAS.indexOf(a.toUpperCase()), j = B62_AAS.indexOf(b.toUpperCase()); return B62[i < 0 ? 22 : i][j < 0 ? 22 : j]; };
/** Nucleotides: +5 for a match, −4 for a mismatch (as NUC44 on A, C, G, T), −2 against N. */
export const nucleotide: Scorer = (a, b) => { const x = a.toUpperCase().replace('U', 'T'), y = b.toUpperCase().replace('U', 'T'); return x === 'N' || y === 'N' ? -2 : x === y ? 5 : -4; };
/** Whether a text is DNA/RNA (only ACGTUN). */
export const isNucleotide = (s: string) => /^[ACGTUN]+$/i.test(s);

export interface Alignment { score: number; top: string; mid: string; bottom: string; start: [number, number]; identity: number }
/** Gotoh's affine-gap dynamic programming: a gap of length L costs open + (L − 1) × extend. Global (Needleman–Wunsch)
 * or local (Smith–Waterman). */
export function align(a: string, b: string, score: Scorer, open = 8, extend = open, local = false): Alignment {
  const n = a.length, m = b.length, NEG = -1e18, W = m + 1, size = (n + 1) * W;
  // M ends in a pair, X in a letter of a against a gap, Y in a gap against a letter of b; P* remember which of the
  // three each came from (3: a local alignment starts here).
  const M = new Float64Array(size).fill(NEG), X = new Float64Array(size).fill(NEG), Y = new Float64Array(size).fill(NEG);
  const PM = new Uint8Array(size), PX = new Uint8Array(size), PY = new Uint8Array(size);
  M[0] = 0;
  for (let i = 1; i <= n; i++) { if (local) { M[i * W] = 0; PM[i * W] = 3; } else { X[i * W] = -open - (i - 1) * extend; PX[i * W] = i > 1 ? 1 : 0; } }
  for (let j = 1; j <= m; j++) { if (local) { M[j] = 0; PM[j] = 3; } else { Y[j] = -open - (j - 1) * extend; PY[j] = j > 1 ? 2 : 0; } }
  if (local) PM[0] = 3;
  const pick = (v: number[]) => { let k = 0; for (let q = 1; q < 3; q++) if (v[q] > v[k]) k = q; return k; };
  let best = 0, bi = 0, bj = 0;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const k = i * W + j, d = k - W - 1, u = k - W, l = k - 1;
    const md = [M[d], X[d], Y[d]], km = pick(md);
    M[k] = md[km] + score(a[i - 1], b[j - 1]); PM[k] = km;
    if (local && M[k] <= 0) { M[k] = 0; PM[k] = 3; }
    const xu = [M[u] - open, X[u] - extend, Y[u] - open], kx = pick(xu); X[k] = xu[kx]; PX[k] = kx;
    const yl = [M[l] - open, X[l] - open, Y[l] - extend], ky = pick(yl); Y[k] = yl[ky]; PY[k] = ky;
    if (local && M[k] > best) { best = M[k]; bi = i; bj = j; }
  }
  let i = local ? bi : n, j = local ? bj : m;
  const end = i * W + j;
  let state = local ? 0 : pick([M[end], X[end], Y[end]]);
  const total = local ? best : [M, X, Y][state][end];
  let top = '', bottom = '', mid = '';
  while (i > 0 || j > 0) {
    const k = i * W + j;
    if (state === 0) {
      if (PM[k] === 3 || (i === 0 && j === 0)) break;
      const s = score(a[i - 1], b[j - 1]);
      top = a[i - 1] + top; bottom = b[j - 1] + bottom; mid = (a[i - 1].toUpperCase() === b[j - 1].toUpperCase() ? '|' : s > 0 ? ':' : ' ') + mid;
      state = PM[k]; i--; j--;
    } else if (state === 1) { top = a[i - 1] + top; bottom = '-' + bottom; mid = ' ' + mid; state = PX[k]; i--; }
    else { top = '-' + top; bottom = b[j - 1] + bottom; mid = ' ' + mid; state = PY[k]; j--; }
  }
  const same = [...mid].filter((c) => c === '|').length;
  return { score: total, top, mid, bottom, start: [i + 1, j + 1], identity: mid.length ? same / mid.length : 0 };
}

/** Distance between two aligned sequences: the share of differing sites (gaps left out), or Jukes–Cantor's
 * −¾ ln(1 − 4p/3) correction for multiple changes at one site. */
export function distance(a: string, b: string, method: 'p' | 'jukes-cantor' = 'jukes-cantor'): number {
  let diff = 0, sites = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { if (a[i] === '-' || b[i] === '-') continue; sites++; if (a[i].toUpperCase() !== b[i].toUpperCase()) diff++; }
  const p = sites ? diff / sites : NaN;
  return method === 'p' ? p : p >= 0.75 ? Infinity : -0.75 * Math.log(1 - (4 * p) / 3);
}

export interface Tree { newick: string; /** Parent of each node (leaves 0…n−1 first), −1 at the root. */ parent: number[]; length: number[]; height: number[]; names: string[] }
/** UPGMA: join the closest pair, the new group's distance the size-weighted average; heights are half the distance. */
export function upgma(D: number[][], names: string[]): Tree {
  const n = D.length, parent: number[] = Array(2 * n - 1).fill(-1), height = Array(2 * n - 1).fill(0), size = Array(2 * n - 1).fill(1), length = Array(2 * n - 1).fill(0);
  const d = new Map<string, number>(), key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`), live = new Set(Array.from({ length: n }, (_, i) => i)), label: string[] = names.slice();
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) d.set(key(i, j), D[i][j]);
  for (let node = n; node < 2 * n - 1; node++) {
    let bi = -1, bj = -1, bd = Infinity;
    for (const i of live) for (const j of live) if (i < j && d.get(key(i, j))! < bd) { bd = d.get(key(i, j))!; bi = i; bj = j; }
    height[node] = bd / 2; size[node] = size[bi] + size[bj];
    for (const c of [bi, bj]) { parent[c] = node; length[c] = height[node] - height[c]; }
    live.delete(bi); live.delete(bj);
    for (const k of live) d.set(key(node, k), (size[bi] * d.get(key(bi, k))! + size[bj] * d.get(key(bj, k))!) / size[node]);
    live.add(node);
    label[node] = `(${label[bi]}:${fmt(length[bi])},${label[bj]}:${fmt(length[bj])})`;
  }
  return { newick: `${label[2 * n - 2]};`, parent, length, height, names };
}
const fmt = (x: number) => String(+x.toFixed(6));

/** Neighbour joining (Saitou and Nei 1987): unrooted; drawn rooted at the last join. */
export function neighborJoin(D0: number[][], names: string[]): Tree {
  const n = D0.length, parent: number[] = Array(2 * n - 2).fill(-1), length = Array(2 * n - 2).fill(0), label = names.slice();
  let nodes = Array.from({ length: n }, (_, i) => i), D = D0.map((r) => r.slice()), next = n;
  while (nodes.length > 2) {
    const r = nodes.length, sums = D.map((row) => row.reduce((s, x) => s + x, 0));
    let bi = 0, bj = 1, bq = Infinity;
    for (let i = 0; i < r; i++) for (let j = i + 1; j < r; j++) { const q = (r - 2) * D[i][j] - sums[i] - sums[j]; if (q < bq) { bq = q; bi = i; bj = j; } }
    const li = D[bi][bj] / 2 + (sums[bi] - sums[bj]) / (2 * (r - 2)), lj = D[bi][bj] - li, u = next++;
    parent[nodes[bi]] = u; parent[nodes[bj]] = u; length[nodes[bi]] = Math.max(0, li); length[nodes[bj]] = Math.max(0, lj);
    label[u] = `(${label[nodes[bi]]}:${fmt(length[nodes[bi]])},${label[nodes[bj]]}:${fmt(length[nodes[bj]])})`;
    const du = D.map((row) => (row[bi] + row[bj] - D[bi][bj]) / 2);
    const keep = nodes.map((_, k) => k).filter((k) => k !== bi && k !== bj);
    D = [...keep.map((k) => [...keep.map((q) => D[k][q]), du[k]]), [...keep.map((k) => du[k]), 0]];
    nodes = [...keep.map((k) => nodes[k]), u];
  }
  // The last two joined by their distance: the root sits on the second, the first hangs from it.
  const [a, b] = nodes;
  parent[a] = b; length[a] = Math.max(0, D[0][1]);
  const height: number[] = Array(next).fill(0);
  const depth = (k: number): number => (parent[k] < 0 ? 0 : length[k] + depth(parent[k]));
  const d = Array.from({ length: next }, (_, k) => depth(k)), deepest = Math.max(...d);
  d.forEach((x, k) => { height[k] = deepest - x; });
  return { newick: `(${label[a]}:${fmt(length[a])},${label[b].replace(/^\(|\)$/g, '')});`, parent: parent.slice(0, next), length: length.slice(0, next), height, names };
}

/** Where to draw a tree: each node's x (its distance from the root) and y (leaves 1…n in drawing order; a node at
 * the middle of its children), and the elbow lines. */
export function treeLayout(t: Tree) {
  const N = t.parent.length, kids: number[][] = Array.from({ length: N }, () => []);
  t.parent.forEach((p, k) => { if (p >= 0) kids[p].push(k); });
  const root = t.parent.findIndex((p) => p < 0), x = Array(N).fill(0), y = Array(N).fill(0), order: number[] = [];
  const walk = (k: number, at: number) => { x[k] = at; if (!kids[k].length) { order.push(k); y[k] = order.length; return; } kids[k].forEach((c) => walk(c, at + t.length[c])); y[k] = kids[k].reduce((s, c) => s + y[c], 0) / kids[k].length; };
  walk(root, 0);
  const lx: number[] = [], ly: number[] = [];
  for (let k = 0; k < N; k++) if (t.parent[k] >= 0) { const p = t.parent[k]; lx.push(x[p], x[p], x[k], NaN); ly.push(y[p], y[k], y[k], NaN); }
  return { x, y, order, lx, ly };
}
