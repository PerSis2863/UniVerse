import type { PMMark, PMNode } from './doc-export';

// Web-page content as the editor's structure (Stage 5 · Q22, B9): the converter reads Word files,
// Markdown and web pages as HTML, and this turns that into the same JSON the doc editor keeps, so
// the real Word (.docx) writer in src/lib/doc-export.ts makes the file: headings, paragraphs, bold
// and the like, links, lists, quotes, code, tables, line and page breaks, pictures. Works over any
// DOM-like tree (the browser's DOMParser; plain objects in the tests).

export interface DomLike { nodeType: number; nodeName: string; textContent: string | null; childNodes: ArrayLike<DomLike>; getAttribute?: (name: string) => string | null }

const TEXT = 3, ELEMENT = 1;
const kidsOf = (n: DomLike) => Array.from(n.childNodes ?? []);
const tag = (n: DomLike) => n.nodeName.toLowerCase();
const MARK: Record<string, string> = { b: 'bold', strong: 'bold', i: 'italic', em: 'italic', u: 'underline', s: 'strike', strike: 'strike', del: 'strike', code: 'code', sub: 'subscript', sup: 'superscript' };
const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'hr', 'section', 'article', 'header', 'footer', 'main', 'figure', 'aside', 'nav', 'dl', 'dt', 'dd']);

/** Inline content: text with its marks, line breaks and pictures. */
function inline(n: DomLike, marks: PMMark[], out: PMNode[]) {
  if (n.nodeType === TEXT) {
    const text = (n.textContent ?? '').replace(/\s+/g, ' ');
    if (text) out.push(marks.length ? { type: 'text', text, marks } : { type: 'text', text });
    return;
  }
  if (n.nodeType !== ELEMENT) return;
  const t = tag(n);
  if (t === 'br') { out.push({ type: 'hardBreak' }); return; }
  if (t === 'img') { const src = n.getAttribute?.('src') ?? ''; if (src) out.push({ type: 'image', attrs: { src, alt: n.getAttribute?.('alt') ?? '' } }); return; }
  let next = marks;
  if (MARK[t] && !marks.some((m) => m.type === MARK[t])) next = [...marks, { type: MARK[t] }];
  if (t === 'a') { const href = n.getAttribute?.('href') ?? ''; if (/^(https?:|mailto:|\/)/i.test(href)) next = [...marks.filter((m) => m.type !== 'link'), { type: 'link', attrs: { href } }]; }
  for (const c of kidsOf(n)) inline(c, next, out);
}

/** Trims a paragraph's outer spaces and drops it when empty. */
function tidy(content: PMNode[]): PMNode[] {
  const c = [...content];
  while (c.length && c[0].type === 'text' && !c[0].text!.trim()) c.shift();
  while (c.length && c[c.length - 1].type === 'text' && !c[c.length - 1].text!.trim()) c.pop();
  if (c[0]?.type === 'text') c[0] = { ...c[0], text: c[0].text!.trimStart() };
  const last = c.length - 1;
  if (c[last]?.type === 'text') c[last] = { ...c[last], text: c[last].text!.trimEnd() };
  return c.filter((x) => x.type !== 'text' || x.text);
}

const paragraph = (content: PMNode[], type = 'paragraph', attrs?: Record<string, unknown>): PMNode[] => {
  const c = tidy(content);
  return c.length ? [{ type, ...(attrs ? { attrs } : {}), content: c }] : [];
};

/** Block content; loose inline content between blocks becomes paragraphs. */
function blocks(nodes: DomLike[]): PMNode[] {
  const out: PMNode[] = [];
  let loose: PMNode[] = [];
  const flush = () => { out.push(...paragraph(loose)); loose = []; };
  for (const n of nodes) {
    const t = n.nodeType === ELEMENT ? tag(n) : '';
    if (!BLOCK.has(t)) { inline(n, [], loose); continue; }
    flush();
    out.push(...block(n, t));
  }
  flush();
  return out;
}

function block(n: DomLike, t: string): PMNode[] {
  if (/^h[1-6]$/.test(t)) {
    const content: PMNode[] = [];
    for (const c of kidsOf(n)) inline(c, [], content);
    return paragraph(content, 'heading', { level: Math.min(3, Number(t[1])) });
  }
  if (t === 'hr') {
    // A page break where the page asked for one (Word's own HTML does), else a line.
    const style = (n.getAttribute?.('style') ?? '').toLowerCase();
    return [{ type: /page-break|break-before:\s*page/.test(style) ? 'pageBreak' : 'horizontalRule' }];
  }
  if (t === 'pre') return [{ type: 'codeBlock', content: [{ type: 'text', text: (n.textContent ?? '').replace(/\n$/, '') }] }];
  if (t === 'blockquote') { const inner = blocks(kidsOf(n)); return inner.length ? [{ type: 'blockquote', content: inner }] : []; }
  if (t === 'ul' || t === 'ol') {
    const items = kidsOf(n).filter((c) => c.nodeType === ELEMENT && tag(c) === 'li').map((li) => { const inner = blocks(kidsOf(li)); return { type: 'listItem', content: inner.length ? inner : [{ type: 'paragraph' }] }; });
    if (!items.length) return [];
    const start = Number(n.getAttribute?.('start'));
    return [{ type: t === 'ol' ? 'orderedList' : 'bulletList', ...(t === 'ol' && start > 1 ? { attrs: { start } } : {}), content: items }];
  }
  if (t === 'table') {
    const rows: DomLike[] = [];
    const findRows = (x: DomLike) => { for (const c of kidsOf(x)) { if (c.nodeType !== ELEMENT) continue; if (tag(c) === 'tr') rows.push(c); else if (['thead', 'tbody', 'tfoot'].includes(tag(c))) findRows(c); } };
    findRows(n);
    const content = rows.map((r) => ({
      type: 'tableRow',
      content: kidsOf(r).filter((c) => c.nodeType === ELEMENT && (tag(c) === 'td' || tag(c) === 'th')).map((cell) => {
        const inner = blocks(kidsOf(cell));
        return { type: tag(cell) === 'th' ? 'tableHeader' : 'tableCell', content: inner.length ? inner : [{ type: 'paragraph' }] };
      }),
    })).filter((r) => r.content.length);
    return content.length ? [{ type: 'table', content }] : [];
  }
  if (t === 'li' || t === 'p' || t === 'dt' || t === 'dd') {
    // A paragraph can hold blocks in loose HTML (a <p> with a <ul> inside): those come out after it.
    return blocks(kidsOf(n));
  }
  return blocks(kidsOf(n)); // div, section…: their blocks
}

/** A document (the editor's JSON) from HTML parsed into a DOM-like tree (give it the <body>). */
export function htmlToDoc(body: DomLike): PMNode {
  const content = blocks(kidsOf(body));
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
