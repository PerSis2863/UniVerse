// The AI writing helper in docs (Stage 5 · B9.4): what it can do with selected text, and a
// word-by-word comparison of before and after, so you see exactly what would change.

export type DocAiAction = 'improve' | 'shorten' | 'grammar' | 'explain' | 'translate' | 'continue';
/** replace: the answer can take the selection's place; note: it's shown (and can go below); add: it goes after the cursor. */
export const DOC_AI_ACTIONS: { id: DocAiAction; label: string; hint: string; use: 'replace' | 'note' | 'add' }[] = [
  { id: 'improve', label: 'Improve', hint: 'Clearer and better written, same meaning', use: 'replace' },
  { id: 'shorten', label: 'Shorten', hint: 'The same, in fewer words', use: 'replace' },
  { id: 'grammar', label: 'Fix grammar', hint: 'Spelling, grammar and punctuation only', use: 'replace' },
  { id: 'explain', label: 'Explain', hint: 'What it means, simply', use: 'note' },
  { id: 'translate', label: 'Translate', hint: 'Into another language', use: 'replace' },
  { id: 'continue', label: 'Continue writing', hint: 'A few more sentences after the cursor', use: 'add' },
];
export const isDocAiAction = (x: unknown): x is DocAiAction => DOC_AI_ACTIONS.some((a) => a.id === x);

export interface DiffPart { kind: 'same' | 'add' | 'del'; text: string }

/** Words (with the spaces after them) that were kept, added or removed, from `a` to `b`. */
export function wordDiff(a: string, b: string): DiffPart[] {
  const split = (s: string) => s.match(/\S+\s*|\s+/g) ?? [];
  const x = split(a), y = split(b);
  // Long texts: too slow to compare word by word, so show all removed then all added.
  if (x.length * y.length > 400_000) return [...(a ? [{ kind: 'del' as const, text: a }] : []), ...(b ? [{ kind: 'add' as const, text: b }] : [])];
  const key = (w: string) => w.trim();
  const n = x.length, m = y.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = key(x[i]) === key(y[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (kind: DiffPart['kind'], text: string) => { const last = out[out.length - 1]; if (last?.kind === kind) last.text += text; else out.push({ kind, text }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (key(x[i]) === key(y[j])) { push('same', y[j]); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) push('del', x[i++]);
    else push('add', y[j++]);
  }
  while (i < n) push('del', x[i++]);
  while (j < m) push('add', y[j++]);
  return out;
}
