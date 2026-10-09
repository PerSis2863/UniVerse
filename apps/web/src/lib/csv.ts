// Reading CSV files people export from spreadsheets (Stage 5 · B15.7 bulk import): quoted cells
// with commas, quotes ("") and line breaks inside, Windows line ends, the byte-order mark Excel
// adds, and semicolon- or tab-separated files (Excel in many European languages saves those).
// Also matches a file's headers to the columns an import expects, by name or a common alias.

export interface CsvColumn { key: string; label: string; required?: boolean; aliases?: string[]; hint?: string }

/** The separator a file uses: whichever of , ; or tab appears most in its first line (outside quotes). */
export function detectDelimiter(text: string) {
  const counts = { ',': 0, ';': 0, '\t': 0 } as Record<string, number>;
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch in counts) counts[ch]++;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return (n > 0 ? best : ',') as ',' | ';' | '\t';
}

/** Rows of cells (empty lines dropped). */
export function parseCsv(input: string, delimiter = detectDelimiter(input.replace(/^\uFEFF/, ''))): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** For each expected column, the index of the file's header that matches it (or -1). */
export function mapHeaders(headers: string[], columns: CsvColumn[]): Record<string, number> {
  const names = headers.map(norm);
  const used = new Set<number>();
  const out: Record<string, number> = {};
  for (const c of columns) {
    const wanted = [c.key, c.label, ...(c.aliases ?? [])].map(norm);
    const i = names.findIndex((n, j) => !used.has(j) && wanted.includes(n));
    out[c.key] = i;
    if (i >= 0) used.add(i);
  }
  return out;
}

/** The file's data rows as objects keyed by column, using a header mapping (blank cells left out). */
export function toRecords(rows: string[][], mapping: Record<string, number>): Record<string, string>[] {
  return rows.map((r) => {
    const rec: Record<string, string> = {};
    for (const [key, i] of Object.entries(mapping)) {
      const v = i >= 0 ? (r[i] ?? '').trim() : '';
      if (v) rec[key] = v;
    }
    return rec;
  });
}

/** A CSV text from a header and rows, safe to open in a spreadsheet (formulas neutralised). */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let x = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(x)) x = `'${x}`;
    return /[",\n\r;]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
  };
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}
