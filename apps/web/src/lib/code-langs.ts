import { transform } from 'sucrase';

// More languages in the browser (Stage 5 · B9.12): TypeScript becomes JavaScript (sucrase: types
// are taken out, nothing is checked) and runs like JavaScript; SQL results are shown as text tables.

/** TypeScript (or TSX-free modern JS) as plain JavaScript; throws an Error with a readable message. */
export function toJavaScript(ts: string): string {
  try {
    return transform(ts, { transforms: ['typescript'], disableESTransforms: true }).code;
  } catch (e) {
    throw new Error(`TypeScript: ${(e as Error).message.replace(/\s*\(\d+:\d+\)$/, '')}`);
  }
}

const cell = (v: unknown) => (v === null || v === undefined ? 'NULL' : v instanceof Uint8Array ? `<${v.length} bytes>` : String(v).replace(/\s+/g, ' '));

/** A query's result as lines of a text table (at most `max` rows). */
export function formatTable(columns: string[], rows: unknown[][], total = rows.length, max = 100): string[] {
  const shown = rows.slice(0, max).map((r) => r.map(cell));
  const widths = columns.map((c, i) => Math.min(40, Math.max(c.length, ...shown.map((r) => (r[i] ?? '').length))));
  const fit = (s: string, w: number) => (s.length > w ? `${s.slice(0, w - 1)}…` : s.padEnd(w));
  const line = (cells: string[]) => `| ${cells.map((c, i) => fit(c, widths[i])).join(' | ')} |`;
  const rule = `|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`;
  const out = [line(columns), rule, ...shown.map(line)];
  out.push(total > max ? `(${max} of ${total} rows)` : `(${total} row${total === 1 ? '' : 's'})`);
  return out;
}
