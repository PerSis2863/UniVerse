// Exporting one chat (Stage 5 · B7.8): the messages as plain text, a readable web page (which the
// browser can print to PDF) or JSON. Built in the browser from the pages of messages it fetched.

export interface ExportMessage {
  at: string; // ISO time
  from: string;
  type: string;
  text: string;
  attachment?: { name: string; url: string } | null;
  replyTo?: { from: string; text: string } | null;
  edited?: boolean;
  reactions?: Record<string, number>;
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-10-11 14:05" in the reader's time zone (or the one given, for tests). */
export function stamp(iso: string, tz?: string) {
  const d = new Date(iso);
  if (tz) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const what = (m: ExportMessage) => [m.text, m.attachment ? `[${m.attachment.name}]` : ''].filter(Boolean).join(' ') || `[${m.type.toLowerCase()}]`;

/** "[2026-10-11 14:05] Asha: hello" lines, with a header. */
export function toText(title: string, messages: ExportMessage[], exportedAt: string, tz?: string) {
  const lines = messages.map((m) => {
    const reply = m.replyTo ? ` (replying to ${m.replyTo.from}: "${m.replyTo.text.slice(0, 60)}")` : '';
    return `[${stamp(m.at, tz)}] ${m.from}${reply}: ${what(m)}${m.edited ? ' (edited)' : ''}`;
  });
  return [`${title}`, `Exported from UniVerse on ${stamp(exportedAt, tz)} · ${messages.length} message${messages.length === 1 ? '' : 's'}`, '', ...lines, ''].join('\n');
}

/** A standalone, printable web page: a heading for each day, links for attachments. */
export function toHtml(title: string, messages: ExportMessage[], exportedAt: string, tz?: string) {
  let day = '';
  const rows: string[] = [];
  for (const m of messages) {
    const [d, t] = stamp(m.at, tz).split(' ');
    if (d !== day) { day = d; rows.push(`<h2>${escapeHtml(d)}</h2>`); }
    const reply = m.replyTo ? `<blockquote>${escapeHtml(m.replyTo.from)}: ${escapeHtml(m.replyTo.text.slice(0, 120))}</blockquote>` : '';
    const file = m.attachment ? ` <a href="${escapeHtml(m.attachment.url)}">${escapeHtml(m.attachment.name)}</a>` : '';
    const reacts = m.reactions && Object.keys(m.reactions).length ? `<span class="r">${Object.entries(m.reactions).map(([e, n]) => `${escapeHtml(e)} ${n}`).join(' ')}</span>` : '';
    rows.push(`<div class="m"><span class="t">${escapeHtml(t)}</span> <b>${escapeHtml(m.from)}</b>${reply}<p>${escapeHtml(m.text || (m.attachment ? '' : `[${m.type.toLowerCase()}]`)).replace(/\n/g, '<br>')}${file}${m.edited ? ' <i>(edited)</i>' : ''}</p>${reacts}</div>`);
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem;color:#11212d}h1{font-size:1.4rem;margin:0}.sub{color:#5a6a73;font-size:.85rem;margin:.25rem 0 1.5rem}h2{font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:#5a6a73;margin:1.5rem 0 .5rem;border-top:1px solid #e2e6e6;padding-top:.75rem}.m{margin:.4rem 0}.m p{margin:.1rem 0 0}.t{color:#9ba8ab;font-size:.8rem}blockquote{margin:.2rem 0;padding-left:.6rem;border-left:3px solid #ccd0cf;color:#4a5c6a;font-size:.85rem}.r{font-size:.8rem;color:#4a5c6a}a{color:#253745}@media print{body{margin:0}}</style></head>
<body><h1>${escapeHtml(title)}</h1><p class="sub">Exported from UniVerse on ${escapeHtml(stamp(exportedAt, tz))} · ${messages.length} message${messages.length === 1 ? '' : 's'}</p>${rows.join('\n')}</body></html>`;
}

/** A file name for the export: the chat's name, made safe, and the date. */
export function exportFileName(title: string, ext: 'txt' | 'html' | 'json', exportedAt: string) {
  const base = title.trim().replace(/[^\p{L}\p{N} _-]+/gu, '').replace(/\s+/g, '-').slice(0, 50) || 'chat';
  return `${base}-${exportedAt.slice(0, 10)}.${ext}`;
}
