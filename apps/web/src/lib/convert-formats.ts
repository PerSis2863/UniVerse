// The file converter (Stage 5 · B9.14): what a file is, what it can become, and a small Markdown to
// HTML step. The conversions themselves run in the browser (src/components/docs/convert-engine.ts).

export type Kind = 'image' | 'pdf' | 'word' | 'text' | 'markdown' | 'html' | 'sheet' | 'csv' | 'json' | 'audio' | 'video' | 'zip' | 'other';
export interface Target { id: string; label: string; ext: string; hint?: string }

const EXT: Record<string, Kind> = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', bmp: 'image', avif: 'image', heic: 'image', heif: 'image', svg: 'image', ico: 'image',
  pdf: 'pdf', docx: 'word', txt: 'text', md: 'markdown', markdown: 'markdown', html: 'html', htm: 'html',
  xlsx: 'sheet', csv: 'csv', tsv: 'csv', json: 'json',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', oga: 'audio', opus: 'audio', flac: 'audio', weba: 'audio',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', ogv: 'video', zip: 'zip',
};

/** What a file is, from its name (its type as a fallback). */
export function kindOf(name: string, mime = ''): Kind {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (EXT[ext]) return EXT[ext];
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/')) return 'text';
  return 'other';
}

const T = (id: string, label: string, ext: string, hint?: string): Target => ({ id, label, ext, hint });
const DOCISH = [T('html', 'Web page', 'html'), T('txt', 'Plain text', 'txt'), T('md', 'Markdown', 'md'), T('doc', 'Word (.doc)', 'doc', 'Opens in Word, Pages and Google Docs'), T('pdf', 'PDF', 'pdf', 'Through the print dialog: choose Save as PDF'), T('uvdoc', 'A UniVerse doc', '', 'Opens in Docs, to edit together')];

/** What a file of this kind can become. */
export function targetsFor(kind: Kind): Target[] {
  switch (kind) {
    case 'image': return [T('png', 'PNG', 'png'), T('jpg', 'JPG', 'jpg'), T('webp', 'WebP', 'webp'), T('pdf-img', 'PDF', 'pdf')];
    case 'pdf': return [T('png-pages', 'PNG pictures', 'png', 'One per page (a ZIP for several)'), T('jpg-pages', 'JPG pictures', 'jpg', 'One per page (a ZIP for several)'), T('pdf-text', 'Plain text', 'txt')];
    case 'word': return DOCISH;
    case 'text': return DOCISH.filter((t) => t.id !== 'txt');
    case 'markdown': return DOCISH.filter((t) => t.id !== 'md');
    case 'html': return DOCISH.filter((t) => t.id !== 'html');
    case 'sheet': return [T('csv', 'CSV', 'csv'), T('json', 'JSON', 'json'), T('html-table', 'Web page (table)', 'html')];
    case 'csv': return [T('xlsx', 'Excel (.xlsx)', 'xlsx'), T('json', 'JSON', 'json'), T('html-table', 'Web page (table)', 'html')];
    case 'json': return [T('csv', 'CSV', 'csv', 'A list of records'), T('xlsx', 'Excel (.xlsx)', 'xlsx', 'A list of records')];
    case 'audio': return [T('wav', 'WAV', 'wav')];
    case 'video': return [T('wav', 'Audio (WAV)', 'wav', 'The sound track'), T('frame', 'Picture (PNG)', 'png', 'A frame from one second in')];
    case 'zip': return [T('unzip', 'The files inside', '')];
    default: return [];
  }
}

/** Several files at once: one ZIP of them all, or one PDF when they're all pictures or PDFs. */
export function combinedTargets(kinds: Kind[]): Target[] {
  if (kinds.length < 2) return [];
  const out = [T('zip', 'One ZIP', 'zip')];
  if (kinds.every((k) => k === 'image' || k === 'pdf')) out.unshift(T('merge-pdf', 'One PDF', 'pdf', 'In this order'));
  return out;
}

/** A converted file's name: the original's, with the new extension (and a page number). */
export function outName(name: string, ext: string, page?: number) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'file';
  return `${base}${page ? `-${page}` : ''}.${ext}`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s: string) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

/** Markdown to HTML: headings, paragraphs, bold, italics, code, links, lists, quotes, rules and code blocks. */
export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  let code: string[] | null = null;
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of lines) {
    if (code) { if (/^```/.test(line)) { out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); code = null; } else code.push(line); continue; }
    if (/^```/.test(line)) { flush(); close(); code = []; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) { flush(); close(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); }
    else if (ul || ol) {
      flush();
      const want = ul ? 'ul' : 'ol';
      if (list !== want) { close(); out.push(`<${want}>`); list = want; }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
    } else if (/^>\s?/.test(line)) { flush(); close(); out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); }
    else if (/^(-{3,}|\*{3,})\s*$/.test(line)) { flush(); close(); out.push('<hr>'); }
    else if (!line.trim()) { flush(); close(); }
    else { close(); para.push(line.trim()); }
  }
  if (code) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
  flush(); close();
  return out.join('\n');
}

/** Rows to CSV: quoted when needed, Windows line ends (what Excel expects). */
export function toCsv(rows: unknown[][]): string {
  const cell = (v: unknown) => {
    const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/** A list of records (JSON) as rows: the keys of all records as the header. */
export function recordsToRows(data: unknown): unknown[][] | null {
  if (!Array.isArray(data) || !data.length || !data.every((r) => r && typeof r === 'object' && !Array.isArray(r))) return null;
  const keys = [...new Set(data.flatMap((r) => Object.keys(r as object)))];
  return [keys, ...data.map((r) => keys.map((k) => { const v = (r as Record<string, unknown>)[k]; return v != null && typeof v === 'object' ? JSON.stringify(v) : v; }))];
}

/** Rows with a header as a list of records. */
export function rowsToRecords(rows: unknown[][]): Record<string, unknown>[] {
  const [head, ...rest] = rows;
  if (!head) return [];
  const keys = head.map((h, i) => (h == null || h === '' ? `column${i + 1}` : String(h)));
  return rest.filter((r) => r.some((c) => c != null && c !== '')).map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? null])));
}

/** Sound as a 16-bit PCM WAV file (interleaving the channels). */
export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const n = channels.length, frames = channels[0]?.length ?? 0;
  const buf = new ArrayBuffer(44 + frames * n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + frames * n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, n, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * n * 2, true); v.setUint16(32, n * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, frames * n * 2, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < n; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return buf;
}
