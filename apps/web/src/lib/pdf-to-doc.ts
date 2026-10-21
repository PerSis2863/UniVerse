import type { PMNode } from './doc-export';

// A PDF's text as a document (Stage 5 · Q22, B9: PDF → Word). pdf.js gives each page's text in
// pieces with their size and place; pieces become lines, lines become paragraphs (a bigger gap
// starts a new one), and text clearly bigger than the page's usual text becomes a heading. Each
// page after the first starts on a new page. The layout itself (columns, pictures, exact fonts)
// isn't kept: it's the words, in reading order, ready to edit. Pure and unit-tested.

/** One piece of text as pdf.js gives it: the text, its size (points), its baseline (from the bottom), and whether a line ends after it. */
export interface PdfPiece { str: string; size: number; y: number; eol?: boolean }

interface Line { text: string; size: number; y: number }

function linesOf(pieces: PdfPiece[]): Line[] {
  const out: Line[] = [];
  let cur: Line | null = null;
  for (const p of pieces) {
    // A new line when pdf.js says so, or when the baseline moves by more than half the text's size.
    if (cur && Math.abs(p.y - cur.y) > Math.max(cur.size, p.size) * 0.5 && p.str.trim()) { out.push(cur); cur = null; }
    if (!cur) cur = { text: '', size: 0, y: p.y };
    cur.text += p.str;
    if (p.str.trim()) cur.size = Math.max(cur.size, p.size);
    if (p.eol) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text);
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const text = (t: string): PMNode => ({ type: 'text', text: t });

/** The pages' text pieces (in pdf.js's order) as a document. */
export function pdfToDoc(pages: PdfPiece[][]): PMNode {
  const content: PMNode[] = [];
  const all = pages.flatMap(linesOf);
  // The usual text size, by how much text there is at each size.
  const body = median(all.flatMap((l) => Array<number>(Math.min(40, Math.ceil(l.text.length / 20))).fill(l.size))) || 11;
  pages.forEach((page, i) => {
    const lines = linesOf(page);
    if (i > 0 && lines.length && content.length) content.push({ type: 'pageBreak' });
    let para: string[] = [];
    let last: Line | null = null;
    const flush = () => { if (para.length) content.push({ type: 'paragraph', content: [text(para.join(' ').replace(/(\w)- (\w)/g, '$1$2'))] }); para = []; };
    for (const l of lines) {
      const ratio = l.size / body;
      if (ratio >= 1.2 && l.text.length <= 140) {
        flush();
        content.push({ type: 'heading', attrs: { level: ratio >= 1.7 ? 1 : ratio >= 1.4 ? 2 : 3 }, content: [text(l.text)] });
        last = null;
        continue;
      }
      // A gap of more than about one and a half lines, or a list bullet, starts a new paragraph.
      if (last && (Math.abs(last.y - l.y) > Math.max(last.size, l.size) * 1.8 || /^([•▪◦\-–*]|\d{1,2}[.)])\s/.test(l.text))) flush();
      para.push(l.text);
      last = l;
    }
    flush();
  });
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
