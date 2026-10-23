'use client';

// A real PDF from a Word file, or from text, Markdown or a web page (the file converter, Stage 5 ·
// B9.14). Earlier this went through the print dialog with a simplified copy of the document; now:
//  1. The document is laid out in a hidden frame, away from the app's own styles: Word files with
//     docx-preview (page size, margins, fonts, colours, tables, pictures, headers and footers), the
//     others on A4 pages.
//  2. Long sections are split into pages: whole paragraphs move to the next page, tables are split
//     between rows, and the header and footer repeat on every page.
//  3. Each page is drawn into a picture (html2canvas-pro) and placed in the PDF (pdf-lib), with the
//     words laid invisibly on top so they can be found, selected and copied (characters outside the
//     standard PDF font, e.g. Hindi or Chinese, show but can't be selected).
// Everything happens on this device.

const PT_PER_PX = 0.75;
const MAX_PAGES = 200;
const MAX_WORDS_PER_PAGE = 6000;

export type PdfProgress = (done: number, total: number) => void;

const BASIC_PAGE_CSS = `
.uvpage{box-sizing:border-box;width:210mm;min-height:297mm;padding:22mm 20mm;display:flex;flex-direction:column;position:relative;overflow:hidden;background:#fff;color:#11212d;font:11pt/1.5 Arial,Helvetica,sans-serif;overflow-wrap:break-word}
.uvpage h1{font-size:20pt;line-height:1.25;margin:0 0 10pt}.uvpage h2{font-size:16pt;line-height:1.3;margin:12pt 0 8pt}.uvpage h3{font-size:13pt;margin:10pt 0 6pt}
.uvpage h4,.uvpage h5,.uvpage h6{font-size:11pt;margin:8pt 0 4pt}.uvpage p{margin:0 0 8pt}.uvpage ul,.uvpage ol{margin:0 0 8pt;padding-left:18pt}
.uvpage table{border-collapse:collapse;margin:0 0 8pt;max-width:100%}.uvpage td,.uvpage th{border:1px solid #9ba8ab;padding:3pt 6pt;vertical-align:top;text-align:left}
.uvpage img{max-width:100%;height:auto}.uvpage pre{white-space:pre-wrap;font:9.5pt/1.4 ui-monospace,Menlo,Consolas,monospace;background:#f2ece6;padding:6pt;margin:0 0 8pt}
.uvpage blockquote{border-left:3px solid #ccd0cf;margin:0 0 8pt;padding-left:10pt;color:#33434f}.uvpage a{color:#1d4ed8}.uvpage hr{border:0;border-top:1px solid #ccd0cf;margin:10pt 0}`;

/** A hidden frame to lay the pages out in. */
async function makeFrame(): Promise<{ win: Window; doc: Document; remove: () => void }> {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.tabIndex = -1;
  f.style.cssText = 'position:fixed;left:-30000px;top:0;width:1700px;height:1400px;border:0;opacity:0;pointer-events:none';
  const loaded = new Promise<void>((res) => { f.onload = () => res(); });
  f.srcdoc = '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff"></body></html>';
  document.body.appendChild(f);
  await loaded;
  return { win: f.contentWindow!, doc: f.contentDocument!, remove: () => f.remove() };
}

const pageHeight = (sec: HTMLElement, win: Window) => {
  const min = parseFloat(win.getComputedStyle(sec).minHeight);
  return min > 0 ? min : sec.offsetWidth * Math.SQRT2;
};
const childrenTagged = (el: Element, tag: string) => [...el.children].filter((c) => c.tagName === tag) as HTMLElement[];

/**
 * Splits a table at the first row that ends below `limit` (a page position): the rows from there on
 * go into a copy of the table placed right after it. False when even the first row doesn't fit.
 */
function splitTable(table: HTMLTableElement, limit: number) {
  const head = table.tHead;
  const rows = [...table.rows].filter((r) => r.parentElement !== head);
  const at = rows.findIndex((r) => r.getBoundingClientRect().bottom > limit);
  if (at <= 0) return false;
  const copy = table.cloneNode(false) as HTMLTableElement;
  for (const c of childrenTagged(table, 'COLGROUP')) copy.appendChild(c.cloneNode(true));
  if (head) copy.appendChild(head.cloneNode(true));
  const body = table.ownerDocument.createElement('tbody');
  for (const r of rows.slice(at)) body.appendChild(r);
  copy.appendChild(body);
  table.after(copy);
  return true;
}

/**
 * Splits a laid-out page (a `section` holding `article`s, maybe a `header` and a `footer`) into as
 * many pages as its content needs. Returns the pages in order.
 */
export function paginate(first: HTMLElement, win: Window, room = MAX_PAGES): HTMLElement[] {
  const pages: HTMLElement[] = [];
  let cur: HTMLElement | null = first;
  while (cur) {
    pages.push(cur);
    const H = pageHeight(cur, win);
    if (cur.scrollHeight <= H + 2 || pages.length >= room) break;
    const top = cur.getBoundingClientRect().top;
    const padBottom = parseFloat(win.getComputedStyle(cur).paddingBottom) || 0;
    const footer = childrenTagged(cur, 'FOOTER')[0];
    let limit = H - padBottom;
    if (footer) {
      // The footer sits in the bottom margin, its own distance from the page's edge.
      const fromEdge = padBottom + (parseFloat(win.getComputedStyle(footer).marginBottom) || 0);
      limit = Math.min(limit, H - fromEdge - footer.offsetHeight);
    }
    let cut: { article: HTMLElement; index: number } | null = null;
    let placed = false;
    find: for (const article of childrenTagged(cur, 'ARTICLE')) {
      const blocks = [...article.children] as HTMLElement[];
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.getBoundingClientRect().bottom - top <= limit + 0.5) { placed = true; continue; }
        if (b.tagName === 'TABLE' && splitTable(b as HTMLTableElement, top + limit)) cut = { article, index: i + 1 };
        // A first block taller than a page stays (the page grows); anything else starts the next page.
        else cut = { article, index: placed ? i : i + 1 };
        break find;
      }
    }
    if (!cut) break;
    const next = cur.cloneNode(false) as HTMLElement;
    const header = childrenTagged(cur, 'HEADER')[0];
    if (header) next.appendChild(header.cloneNode(true));
    const rest = [...cut.article.children].slice(cut.index);
    const moved = cut.article.cloneNode(false) as HTMLElement;
    for (const n of rest) moved.appendChild(n);
    next.appendChild(moved);
    let after = cut.article.nextElementSibling;
    let more = 0;
    while (after) {
      const n: Element | null = after.nextElementSibling;
      if (after !== footer) { next.appendChild(after); more++; }
      after = n;
    }
    if (!rest.length && !more) break;
    if (footer) next.appendChild(footer.cloneNode(true));
    cur.after(next);
    cur = next;
  }
  return pages;
}

/** The document's pages, laid out in the frame. */
async function layOut(file: File, html: string | null, frame: { win: Window; doc: Document }): Promise<HTMLElement[]> {
  const { doc, win } = frame;
  let sections: HTMLElement[];
  if (html === null) {
    const { renderAsync } = await import('docx-preview');
    const host = doc.createElement('div');
    doc.body.appendChild(host);
    await renderAsync(file, host, doc.head, {
      inWrapper: false, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false, breakPages: true, ignoreLastRenderedPageBreak: false,
      renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true, renderComments: false, renderChanges: false,
      useBase64URL: true, experimental: true, className: 'docx',
    });
    sections = [...host.querySelectorAll<HTMLElement>('section.docx')];
    if (!sections.length) throw new Error('This Word file looks empty, or it isn’t a .docx file.');
  } else {
    const style = doc.createElement('style');
    style.textContent = BASIC_PAGE_CSS;
    doc.head.appendChild(style);
    const sec = doc.createElement('section');
    sec.className = 'uvpage';
    const article = doc.createElement('article');
    article.innerHTML = html;
    sec.appendChild(article);
    doc.body.appendChild(sec);
    sections = [sec];
  }
  await Promise.all([...doc.images].map((img) => (img.complete ? null : img.decode().catch(() => null))));
  await (doc as Document & { fonts?: FontFaceSet }).fonts?.ready;
  const pages: HTMLElement[] = [];
  for (const s of sections) {
    if (pages.length >= MAX_PAGES) { s.remove(); continue; }
    pages.push(...paginate(s, win, MAX_PAGES - pages.length));
  }
  return pages;
}

type PdfLib = typeof import('pdf-lib');
type Font = Awaited<ReturnType<import('pdf-lib').PDFDocument['embedFont']>>;

/** The page's words, invisible, where they are on the picture: so the PDF's text can be found and copied. */
function textLayer(lib: PdfLib, page: import('pdf-lib').PDFPage, el: HTMLElement, font: Font, chars: Set<number>) {
  const base = el.getBoundingClientRect();
  const H = page.getHeight();
  const key = page.node.newFontDictionary(font.name, font.ref);
  const ops = [lib.pushGraphicsState(), lib.beginText(), lib.setTextRenderingMode(lib.TextRenderingMode.Invisible)];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = el.ownerDocument.createRange();
  let words = 0;
  for (let n = walker.nextNode(); n && words < MAX_WORDS_PER_PAGE; n = walker.nextNode()) {
    const text = n.textContent ?? '';
    for (const m of text.matchAll(/\S+/g)) {
      const word = [...m[0]].filter((ch) => chars.has(ch.codePointAt(0)!)).join('');
      if (!word) continue;
      range.setStart(n, m.index);
      range.setEnd(n, m.index + m[0].length);
      const r = range.getClientRects()[0];
      if (!r || r.width < 0.5 || r.height < 0.5) continue;
      const x = (r.left - base.left) * PT_PER_PX, top = (r.top - base.top) * PT_PER_PX;
      const w = r.width * PT_PER_PX, h = r.height * PT_PER_PX;
      if (top > H || x > page.getWidth()) continue;
      const size = Math.max(1, h * 0.8);
      const natural = font.widthOfTextAtSize(word, size);
      if (!natural) continue;
      ops.push(
        lib.setFontAndSize(key, size),
        lib.setCharacterSqueeze(Math.max(1, Math.min(1000, (w / natural) * 100))),
        lib.setTextMatrix(1, 0, 0, 1, x, H - top - h * 0.8),
        lib.showText(font.encodeText(word)),
      );
      if (++words >= MAX_WORDS_PER_PAGE) break;
    }
  }
  ops.push(lib.endText(), lib.popGraphicsState());
  if (words) page.pushOperators(...ops);
}

const jpeg = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Couldn’t draw a page.'))), 'image/jpeg', 0.85));

/**
 * A PDF of a Word file (html null) or of a document's HTML (text, Markdown, web page). `onProgress`
 * hears each page as it's drawn.
 */
export async function documentToPdf(file: File, html: string | null, title: string, onProgress?: PdfProgress): Promise<Blob> {
  const [lib, { default: html2canvas }] = await Promise.all([import('pdf-lib'), import('html2canvas-pro')]);
  const frame = await makeFrame();
  try {
    const pages = await layOut(file, html, frame);
    const pdf = await lib.PDFDocument.create();
    const font = await pdf.embedFont(lib.StandardFonts.Helvetica);
    const chars = new Set(font.getCharacterSet());
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i, pages.length);
      const el = pages[i];
      // The page's exact size (A4 is 793.7 × 1122.5 CSS pixels: 595.3 × 841.9 points).
      const w = el.getBoundingClientRect().width;
      const h = Math.max(el.scrollHeight, pageHeight(el, frame.win));
      el.style.height = `${h}px`;
      const scale = Math.min(2, 14_000 / h);
      const canvas = await html2canvas(el, { scale, backgroundColor: '#ffffff', logging: false, useCORS: true, width: Math.ceil(w), height: Math.ceil(h), windowWidth: frame.win.innerWidth, windowHeight: frame.win.innerHeight });
      const img = await pdf.embedJpg(new Uint8Array(await (await jpeg(canvas)).arrayBuffer()));
      canvas.width = canvas.height = 0;
      const page = pdf.addPage([w * PT_PER_PX, h * PT_PER_PX]);
      page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
      textLayer(lib, page, el, font, chars);
    }
    onProgress?.(pages.length, pages.length);
    pdf.setTitle(title);
    pdf.setCreator('UniVerse');
    pdf.setProducer('UniVerse file converter');
    return new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' });
  } finally {
    frame.remove();
  }
}
