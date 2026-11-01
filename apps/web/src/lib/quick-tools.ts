// Collaborate → Create's quick tools (M68): the logic behind the small tools, all in the browser.

/** Words, characters, sentences, paragraphs and how long it takes to read (230 wpm) and say (150 wpm). */
export function textStats(t: string) {
  const words = t.match(/[\p{L}\p{N}'’-]+/gu) ?? [];
  const sentences = t.split(/[.!?…]+(?:\s|$)/).filter((s) => s.trim()).length;
  const paragraphs = t.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const counts = new Map<string, number>();
  for (const w of words) { const k = w.toLowerCase(); if (k.length > 3) counts.set(k, (counts.get(k) ?? 0) + 1); }
  const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
  return { words: words.length, chars: t.length, charsNoSpaces: t.replace(/\s/g, '').length, sentences, paragraphs, readMin: words.length / 230, speakMin: words.length / 150, top };
}

export type Clean = 'upper' | 'lower' | 'title' | 'sentence' | 'spaces' | 'sort' | 'dedupe' | 'blank' | 'reverse';
/** One clean-up step on a text. */
export function cleanText(t: string, op: Clean): string {
  const lines = t.split('\n');
  switch (op) {
    case 'upper': return t.toUpperCase();
    case 'lower': return t.toLowerCase();
    case 'title': return t.toLowerCase().replace(/(^|[\s(“"'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
    case 'sentence': return t.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
    case 'spaces': return lines.map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n');
    case 'sort': return [...lines].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).join('\n');
    case 'dedupe': return [...new Set(lines)].join('\n');
    case 'blank': return lines.filter((l) => l.trim()).join('\n');
    case 'reverse': return [...lines].reverse().join('\n');
  }
}

/** Line by line differences (longest common subsequence): ' ' same, '-' only in a, '+' only in b. */
export function diffLines(a: string, b: string): { op: ' ' | '-' | '+'; text: string }[] {
  const x = a.split('\n'), y = b.split('\n');
  if (x.length * y.length > 4_000_000) return [...x.map((text) => ({ op: '-' as const, text })), ...y.map((text) => ({ op: '+' as const, text }))];
  const L = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: { op: ' ' | '-' | '+'; text: string }[] = [];
  let i = 0, j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { out.push({ op: ' ', text: x[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: '-', text: x[i++] });
    else out.push({ op: '+', text: y[j++] });
  }
  while (i < x.length) out.push({ op: '-', text: x[i++] });
  while (j < y.length) out.push({ op: '+', text: y[j++] });
  return out;
}

/** A pasted table (from a spreadsheet: tabs; or CSV, with quotes) as rows of cells. */
export function parseTable(t: string): string[][] {
  const text = t.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!text) return [];
  if (text.includes('\t')) return text.split('\n').map((l) => l.split('\t'));
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  row.push(cell); rows.push(row);
  return rows;
}
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
/** The table as CSV, JSON (first row as names) or a Markdown table. */
export function tableAs(rows: string[][], to: 'csv' | 'json' | 'markdown'): string {
  if (!rows.length) return '';
  if (to === 'csv') return rows.map((r) => r.map(csvCell).join(',')).join('\n');
  const [head, ...body] = rows;
  if (to === 'json') return JSON.stringify(body.map((r) => Object.fromEntries(head.map((h, i) => [h || `column ${i + 1}`, num(r[i]) ?? r[i] ?? '']))), null, 2);
  const line = (r: string[]) => `| ${head.map((_, i) => (r[i] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;
  return [line(head), `| ${head.map(() => '---').join(' | ')} |`, ...body.map(line)].join('\n');
}
const num = (s: string | undefined) => { if (s == null) return null; const v = Number(s.replace(/[\s,]/g, '')); return s.trim() !== '' && Number.isFinite(v) ? v : null; };
/** Sum, average, smallest and largest of each column that holds numbers (header row skipped). */
export function columnStats(rows: string[][]) {
  const [head = [], ...body] = rows;
  return head.map((h, i) => {
    const v = body.map((r) => num(r[i])).filter((x): x is number => x !== null);
    return v.length ? { name: h || `Column ${i + 1}`, count: v.length, sum: v.reduce((a, b) => a + b, 0), avg: v.reduce((a, b) => a + b, 0) / v.length, min: Math.min(...v), max: Math.max(...v) } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);
}

/** HSL → hex. */
export function hsl(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => { const k = (n + h / 30) % 12; const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
export type Harmony = 'analogous' | 'complementary' | 'triadic' | 'shades';
/** Five colours that go together, from a starting hue. */
export function palette(hue: number, kind: Harmony): string[] {
  const h = (d: number) => (((hue + d) % 360) + 360) % 360;
  switch (kind) {
    case 'analogous': return [-40, -20, 0, 20, 40].map((d) => hsl(h(d), 70, 55));
    case 'complementary': return [hsl(h(0), 70, 40), hsl(h(0), 70, 60), hsl(h(0), 25, 92), hsl(h(180), 70, 60), hsl(h(180), 70, 40)];
    case 'triadic': return [hsl(h(0), 70, 55), hsl(h(120), 70, 55), hsl(h(240), 70, 55), hsl(h(0), 30, 90), hsl(h(0), 30, 20)];
    case 'shades': return [20, 35, 50, 65, 82].map((l) => hsl(h(0), 65, l));
  }
}

/** Page numbers from "1-3, 5, 8-" (1-based, within `pages`), in order, without repeats. */
export function pageRanges(spec: string, pages: number): number[] {
  const out: number[] = [];
  for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/);
    const [a, b] = m ? [m[1] ? +m[1] : 1, m[2] ? +m[2] : pages] : [+part, +part];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    for (let p = Math.max(1, a); p <= Math.min(pages, b); p++) if (!out.includes(p)) out.push(p);
  }
  return out;
}
