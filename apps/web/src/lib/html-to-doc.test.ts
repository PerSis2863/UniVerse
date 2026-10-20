import { describe, expect, it } from 'vitest';
import { unzipSync, zipSync, strFromU8 } from 'fflate';
import { htmlToDoc, type DomLike } from './html-to-doc';
import { pdfToDoc } from './pdf-to-doc';
import { docToDocx } from './doc-export';

// A tiny DOM-like tree for the tests (the browser's DOMParser gives the same shape).
const el = (name: string, kids: (DomLike | string)[] = [], attrs: Record<string, string> = {}): DomLike => {
  const childNodes = kids.map((k) => (typeof k === 'string' ? { nodeType: 3, nodeName: '#text', textContent: k, childNodes: [] } : k));
  return { nodeType: 1, nodeName: name.toUpperCase(), childNodes, getAttribute: (a) => attrs[a] ?? null, get textContent() { return childNodes.map((c) => c.textContent ?? '').join(''); } };
};

describe('web page / Word content → the editor’s document (B9: a real .docx)', () => {
  it('keeps headings, paragraphs, marks, links, breaks and pictures', () => {
    const doc = htmlToDoc(el('body', [
      el('h1', ['Lab report']),
      el('p', ['The ', el('strong', ['result']), ' was ', el('em', [el('u', ['clear'])]), '.', el('br'), el('a', ['source'], { href: 'https://x.org' })]),
      el('p', ['  ']),
      el('img', [], { src: 'https://x.org/a.png', alt: 'chart' }),
      el('h5', ['Small heading']),
    ]));
    expect(doc.content![0]).toEqual({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Lab report' }] });
    const p = doc.content![1].content!;
    expect(p[1]).toEqual({ type: 'text', text: 'result', marks: [{ type: 'bold' }] });
    expect(p[3]).toEqual({ type: 'text', text: 'clear', marks: [{ type: 'italic' }, { type: 'underline' }] });
    expect(p[5]).toEqual({ type: 'hardBreak' });
    expect(p[6]).toEqual({ type: 'text', text: 'source', marks: [{ type: 'link', attrs: { href: 'https://x.org' } }] });
    expect(doc.content![2]).toEqual({ type: 'paragraph', content: [{ type: 'image', attrs: { src: 'https://x.org/a.png', alt: 'chart' } }] }); // the empty paragraph is gone
    expect(doc.content![3].attrs).toEqual({ level: 3 });
  });
  it('keeps lists (nested), quotes, code, tables and page breaks; drops unsafe links', () => {
    const doc = htmlToDoc(el('body', [
      el('ol', [el('li', ['One']), el('li', ['Two', el('ul', [el('li', ['Two a'])])])], { start: '3' }),
      el('blockquote', [el('p', ['Quoted'])]),
      el('pre', ['let x = 1;\n']),
      el('table', [el('tbody', [el('tr', [el('th', ['A']), el('th', ['B'])]), el('tr', [el('td', ['1']), el('td', [])])])]),
      el('hr', [], { style: 'page-break-before: always' }),
      el('p', [el('a', ['bad'], { href: 'javascript:alert(1)' })]),
    ]));
    const [list, quote, code, table, brk, bad] = doc.content!;
    expect(list).toMatchObject({ type: 'orderedList', attrs: { start: 3 } });
    expect(list.content![1].content![1]).toMatchObject({ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ text: 'Two a' }] }] }] });
    expect(quote).toMatchObject({ type: 'blockquote', content: [{ type: 'paragraph' }] });
    expect(code).toEqual({ type: 'codeBlock', content: [{ type: 'text', text: 'let x = 1;' }] });
    expect(table.content!.map((r) => r.content!.map((c) => c.type))).toEqual([['tableHeader', 'tableHeader'], ['tableCell', 'tableCell']]);
    expect(brk).toEqual({ type: 'pageBreak' });
    expect(bad.content![0]).toEqual({ type: 'text', text: 'bad' }); // no link mark
  });
  it('makes a .docx Word opens: the parts are there and the text is in it', () => {
    const doc = htmlToDoc(el('body', [el('h2', ['Intro']), el('p', ['Hello & welcome'])]));
    const files = docToDocx(doc, 'My file');
    const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? new TextEncoder().encode(v) : v])));
    const back = unzipSync(zipped);
    expect(Object.keys(back)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', '_rels/.rels']));
    const xml = strFromU8(back['word/document.xml']);
    expect(xml).toContain('<w:pStyle w:val="Heading2"/>');
    expect(xml).toContain('Hello &amp; welcome');
  });
});

describe('PDF → Word (B9)', () => {
  const page = (lines: [string, number, number][]) => lines.map(([str, size, y]) => ({ str, size, y, eol: true }));
  it('turns lines into paragraphs and big text into headings, a new page for each page', () => {
    const doc = pdfToDoc([
      page([['Photosynthesis', 24, 760], ['Plants make sugar from light, water and carbon', 11, 720], ['dioxide in their leaves.', 11, 706], ['A second paragraph starts after a gap.', 11, 670], ['How it works', 16, 640], ['• Light is caught by chlorophyll', 11, 620], ['• Water is split', 11, 606]]),
      page([['Page two text.', 11, 760]]),
    ]);
    const types = doc.content!.map((n) => (n.type === 'heading' ? `h${n.attrs!.level}` : n.type));
    expect(types).toEqual(['h1', 'paragraph', 'paragraph', 'h2', 'paragraph', 'paragraph', 'pageBreak', 'paragraph']);
    expect(doc.content![1].content![0].text).toBe('Plants make sugar from light, water and carbon dioxide in their leaves.');
    expect(doc.content![7].content![0].text).toBe('Page two text.');
  });
  it('joins pieces on the same line, mends words split by a hyphen, and copes with nothing', () => {
    const doc = pdfToDoc([[{ str: 'Hello ', size: 11, y: 700 }, { str: 'world, a long exam-', size: 11, y: 700, eol: true }, { str: 'ple here.', size: 11, y: 686, eol: true }]]);
    expect(doc.content![0].content![0].text).toBe('Hello world, a long example here.');
    expect(pdfToDoc([[]])).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });
});
