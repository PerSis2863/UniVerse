// Rich lesson pages (Stage 5 · B2): a module page's body is either plain text (older pages, quick
// notes) or a page written in the page editor, kept as the editor's JSON ({"type":"doc",…}). The
// server checks a rich page before saving it (cleanLessonDoc): only the blocks the editor makes, safe
// links and pictures, and sizes kept small. Shared by the server and the editor.

export const PLAIN_PAGE_MAX = 10_000;
/** Characters of JSON a rich page may take (D1 rows go up to 2 MB). */
export const RICH_PAGE_MAX = 300_000;

export const CALLOUT_TONES = ['note', 'tip', 'warning', 'key'] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];
export const MAX_OPTIONS = 6, MAX_CARDS = 50;

export const isRichPage = (body: string | null | undefined): body is string => typeof body === 'string' && body.startsWith('{"type":"doc"');

export interface LessonNode { type: string; attrs?: Record<string, unknown>; content?: LessonNode[]; marks?: { type: string; attrs?: Record<string, unknown> }[]; text?: string }

/** A plain-text page as the editor's document: paragraphs at blank lines, line breaks kept. */
export function plainToDoc(text: string): LessonNode {
  const paras = text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return {
    type: 'doc',
    content: paras.length ? paras.map((p) => ({
      type: 'paragraph',
      content: p.split('\n').flatMap((line, i) => [...(i ? [{ type: 'hardBreak' }] : []), ...(line ? [{ type: 'text', text: line }] : [])]),
    })) : [{ type: 'paragraph' }],
  };
}

/** A page's body as the editor's document (rich pages parsed, plain text converted). */
export function pageDoc(body: string | null | undefined): LessonNode {
  if (isRichPage(body)) {
    try {
      const doc = JSON.parse(body) as LessonNode;
      // The editor needs at least one block.
      return doc.content?.length ? doc : plainToDoc('');
    } catch { /* shown as text below */ }
  }
  return plainToDoc(body ?? '');
}

// ── Video chapters ───────────────────────────────────────────────────────────────────────────

export interface Chapter { at: number; label: string; title: string }

/** "0:00 Introduction" lines (m:ss or h:mm:ss, a dash or colon after the time allowed), in order. */
export function parseChapters(text: string | null | undefined): Chapter[] {
  const out: Chapter[] = [];
  for (const line of (text ?? '').split('\n').slice(0, 100)) {
    const m = /^\s*(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)\s*[-–—:]?\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const at = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    out.push({ at, label: timeLabel(at), title: m[4].slice(0, 120) });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 50);
}

export function timeLabel(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// ── Checking a page before it's saved ────────────────────────────────────────────────────────

export class LessonPageError extends Error {}

const MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'link']);
const safeUrl = (v: unknown) => typeof v === 'string' && v.length <= 2000 && /^(https?:\/\/|\/(?!\/)|mailto:)/i.test(v.trim()) ? v.trim() : null;
const str = (n: number) => (v: unknown) => (typeof v === 'string' ? v.slice(0, n) : undefined);
const int = (lo: number, hi: number) => (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
const widths = (v: unknown) => (Array.isArray(v) && v.length <= 20 && v.every((x) => x === null || (typeof x === 'number' && x >= 0 && x < 5000)) ? v : undefined);
const oneOf = <T extends string>(xs: readonly T[]) => (v: unknown) => (xs.includes(v as T) ? (v as T) : undefined);
const cells = { colspan: int(1, 50), rowspan: int(1, 200), colwidth: widths };

/** The node types the page editor makes, with the attributes each may keep (others are dropped). */
const NODES: Record<string, Record<string, (v: unknown) => unknown>> = {
  doc: {}, paragraph: {}, text: {}, hardBreak: {}, horizontalRule: {}, blockquote: {}, bulletList: {}, listItem: {}, taskList: {},
  heading: { level: int(1, 6) },
  orderedList: { start: int(0, 100_000), type: str(4) },
  codeBlock: { language: str(40) },
  taskItem: { checked: bool },
  image: { src: (v) => safeUrl(v) ?? undefined, alt: str(300), title: str(300), width: int(1, 10_000), height: int(1, 10_000) },
  table: {}, tableRow: {}, tableCell: cells, tableHeader: cells,
  // DocEmbed (src/components/docs/DocEmbed.tsx): its source is checked again when shown (safeEmbed).
  embed: { kind: oneOf(['youtube', 'video', 'pdf', 'code', 'math'] as const), src: str(2000), title: str(200), lang: oneOf(['python', 'javascript', 'typescript', 'sql'] as const), code: str(20_000), tex: str(2000), chapters: str(4000) },
  callout: { tone: oneOf(CALLOUT_TONES) },
  quickCheck: {
    question: str(500), explain: str(1000), answer: int(0, MAX_OPTIONS - 1),
    options: (v) => (Array.isArray(v) ? v.slice(0, MAX_OPTIONS).map((x) => (typeof x === 'string' ? x.slice(0, 200) : '')) : undefined),
  },
  flashcards: {
    title: str(120),
    cards: (v) => (Array.isArray(v) ? v.slice(0, MAX_CARDS).map((c) => {
      const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
      return { front: typeof o.front === 'string' ? o.front.slice(0, 500) : '', back: typeof o.back === 'string' ? o.back.slice(0, 500) : '' };
    }) : undefined),
  },
};

function cleanAttrs(raw: unknown, allowed: Record<string, (v: unknown) => unknown>) {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, check] of Object.entries(allowed)) {
    const v = check((raw as Record<string, unknown>)[k]);
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * A page from the editor, checked and rebuilt with only what the editor makes: the JSON to save.
 * Throws LessonPageError for anything else (an unknown block, too big, too deep).
 */
export function cleanLessonDoc(raw: unknown): string {
  let doc: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > RICH_PAGE_MAX * 2) throw new LessonPageError('This page is too long to save. Split it into two pages.');
    try { doc = JSON.parse(raw); } catch { throw new LessonPageError('This page couldn’t be read. Try again.'); }
  }
  let count = 0;
  const walk = (n: unknown, depth: number): LessonNode => {
    if (++count > 20_000) throw new LessonPageError('This page is too long to save. Split it into two pages.');
    if (depth > 40) throw new LessonPageError('This page is nested too deeply to save.');
    const o = (n && typeof n === 'object' ? n : {}) as Record<string, unknown>;
    const type = typeof o.type === 'string' ? o.type : '';
    const allowed = NODES[type];
    if (!allowed || (depth === 0) !== (type === 'doc')) throw new LessonPageError('This page has something in it that can’t be saved.');
    const node: LessonNode = { type };
    const attrs = cleanAttrs(o.attrs, allowed);
    if (attrs) node.attrs = attrs;
    if (type === 'image' && !attrs?.src) throw new LessonPageError('A picture on this page isn’t from a safe address.');
    if (type === 'text') {
      if (typeof o.text !== 'string' || !o.text) throw new LessonPageError('This page couldn’t be read. Try again.');
      node.text = o.text.slice(0, 100_000);
      if (Array.isArray(o.marks) && o.marks.length) {
        node.marks = o.marks.slice(0, 10).flatMap((mk) => {
          const mm = (mk && typeof mk === 'object' ? mk : {}) as Record<string, unknown>;
          if (typeof mm.type !== 'string' || !MARKS.has(mm.type)) return [];
          if (mm.type !== 'link') return [{ type: mm.type }];
          const href = safeUrl((mm.attrs as Record<string, unknown> | undefined)?.href);
          return href ? [{ type: 'link', attrs: { href } }] : [];
        });
        if (!node.marks.length) delete node.marks;
      }
    } else if (Array.isArray(o.content) && o.content.length) {
      node.content = o.content.map((c) => walk(c, depth + 1));
    }
    return node;
  };
  const json = JSON.stringify(walk(doc, 0));
  if (json.length > RICH_PAGE_MAX) throw new LessonPageError('This page is too long to save (pictures pasted into it count too). Split it into two pages.');
  return json;
}

/** A page body from a teacher or a pack: a rich page checked, plain text trimmed. */
export function cleanPageBody(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return isRichPage(raw.trimStart()) ? cleanLessonDoc(raw.trimStart()) : raw.trim().slice(0, PLAIN_PAGE_MAX);
}
