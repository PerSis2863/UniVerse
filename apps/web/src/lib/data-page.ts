// "Download my data" as a page anyone can read (M302): the same export, turned into one HTML file in the
// browser (nothing more is asked of the server), a section per kind of record with a table each. Every
// value is escaped: the file holds what people typed.

type Export = { exportedAt?: string; about?: string; profile?: Record<string, unknown> | null; data?: Record<string, unknown[]> };

const esc = (v: unknown) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const cell = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? esc(JSON.stringify(v)) : esc(v));
const anchor = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function table(rows: Record<string, unknown>[]): string {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, 30);
  return `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${cell(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

export function dataPage(x: Export): string {
  const sections = Object.entries(x.data ?? {}).filter(([, rows]) => Array.isArray(rows) && rows.length);
  const profile = x.profile ? Object.entries(x.profile).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${cell(v)}</td></tr>`).join('') : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>My data on UniVerse</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#111;background:#fff}h1{font-size:22px}h2{font-size:17px;margin-top:28px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top;word-break:break-word}th{background:#f4f4f5}nav li{margin:2px 0}</style></head><body>
<h1>My data on UniVerse</h1><p>${esc(x.about ?? '')}</p><p>Made ${esc(x.exportedAt ?? '')}. ${sections.length} kinds of records.</p>
<nav><ul>${sections.map(([k, rows]) => `<li><a href="#${anchor(k)}">${esc(k)}</a> (${rows.length})</li>`).join('')}</ul></nav>
<h2>Profile</h2><table><tbody>${profile}</tbody></table>
${sections.map(([k, rows]) => `<h2 id="${anchor(k)}">${esc(k)} (${rows.length})</h2>${table(rows as Record<string, unknown>[])}`).join('\n')}
</body></html>`;
}
