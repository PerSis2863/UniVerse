// Reading the reports browsers send when the Content-Security-Policy blocks something: the old
// format (report-uri, "application/csp-report": { "csp-report": {…} }) and the Reporting API
// (report-to, "application/reports+json": [{ type: "csp-violation", body: {…} }]). Only what helps
// find the cause is kept, without query strings (they can hold tokens).

export interface CspReport { key: string; directive: string; blocked: string; page: string; sample: string | null }

const short = (s: unknown, n: number) => (typeof s === 'string' ? s.slice(0, n) : '');

/** "https://x.com/a/b?t=1" → "https://x.com/a/b"; keywords ("inline", "eval", "data") as they are. */
function place(u: unknown, pathOnly = false): string {
  const s = short(u, 2000);
  if (!s) return '';
  try {
    const url = new URL(s);
    return (pathOnly ? url.pathname : `${url.origin}${url.pathname}`).slice(0, 200);
  } catch {
    return s.split(/[?#]/)[0].slice(0, 200);
  }
}

function one(directive: unknown, blocked: unknown, page: unknown, sample: unknown): CspReport | null {
  const d = short(directive, 60).split(' ')[0];
  if (!d) return null;
  const b = place(blocked) || 'inline';
  const p = place(page, true) || '/';
  return { key: `${d}|${b}|${p}`.slice(0, 400), directive: d, blocked: b, page: p, sample: short(sample, 120) || null };
}

export function readCspReports(contentType: string, text: string): CspReport[] {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return [];
  }
  const out: (CspReport | null)[] = [];
  if (/reports\+json/.test(contentType) || Array.isArray(body)) {
    for (const r of Array.isArray(body) ? body : []) {
      const x = r as { type?: string; body?: Record<string, unknown> };
      if (x?.type !== 'csp-violation' || !x.body) continue;
      out.push(one(x.body.effectiveDirective ?? x.body.violatedDirective, x.body.blockedURL, x.body.documentURL, x.body.sample));
    }
  } else {
    const r = (body as { 'csp-report'?: Record<string, unknown> } | null)?.['csp-report'];
    if (r) out.push(one(r['effective-directive'] ?? r['violated-directive'], r['blocked-uri'], r['document-uri'], r['script-sample']));
  }
  return out.filter((r): r is CspReport => r !== null);
}
