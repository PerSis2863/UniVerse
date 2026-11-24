// Hyperion's toolstrip → Compare (M472): two scripts line by line, by the longest common run of lines (classic LCS), so
// the lines kept, taken out and put in read in order. Scripts are small; at most 4,000 lines each are compared.

export type DiffLine = { kind: 'same' | 'gone' | 'new'; text: string; a?: number; b?: number };

export function lineDiff(left: string, right: string): DiffLine[] {
  const a = left.split('\n').slice(0, 4000), b = right.split('\n').slice(0, 4000), n = a.length, m = b.length;
  // L[i][j]: the longest common run of a[i..] and b[j..].
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { out.push({ kind: 'same', text: a[i], a: i + 1, b: j + 1 }); i++; j++; }
    else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { out.push({ kind: 'new', text: b[j], b: j + 1 }); j++; }
    else { out.push({ kind: 'gone', text: a[i], a: i + 1 }); i++; }
  }
  return out;
}

/** Lines found in scripts: each match's script, line (from 1) and text, at most `max`. */
export function findInScripts(scripts: { name: string; code: string }[], query: string, max = 200) {
  const q = query.trim().toLowerCase(), hits: { script: number; name: string; line: number; text: string }[] = [];
  if (!q) return hits;
  scripts.forEach((s, k) => s.code.split('\n').forEach((t, i) => { if (hits.length < max && t.toLowerCase().includes(q)) hits.push({ script: k, name: s.name, line: i + 1, text: t.trim() }); }));
  return hits;
}
