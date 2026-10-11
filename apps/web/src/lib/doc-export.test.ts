import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate';
import { docToDocx, docToMarkdown, imageSources, type PMNode } from './doc-export';

const t = (text: string, ...marks: (string | [string, Record<string, unknown>])[]): PMNode => ({ type: 'text', text, marks: marks.map((m) => (typeof m === 'string' ? { type: m } : { type: m[0], attrs: m[1] })) });
const p = (...content: PMNode[]): PMNode => ({ type: 'paragraph', content });
const doc: PMNode = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [t('Plan')] },
    p(t('Read '), t('chapter 3 ', 'bold'), t('and '), t('notes', ['link', { href: 'https://x.org/a' }]), t(' with '), { type: 'mention', attrs: { id: 'u1', label: 'Asha' } }, t(' *now*')),
    { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('one')), { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p(t('three'))] }] }] }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('done'))] }, { type: 'taskItem', attrs: { checked: false }, content: [p(t('todo'))] }] },
    { type: 'blockquote', content: [p(t('quoted'))] },
    { type: 'codeBlock', attrs: { language: 'py' }, content: [{ type: 'text', text: 'print(1)\nprint(2)' }] },
    { type: 'table', content: [
      { type: 'tableRow', content: [{ type: 'tableHeader', content: [p(t('Name'))] }, { type: 'tableHeader', content: [p(t('Score'))] }] },
      { type: 'tableRow', content: [{ type: 'tableCell', content: [p(t('A|B'))] }, { type: 'tableCell', content: [p(t('9'))] }] },
    ] },
    { type: 'horizontalRule' },
    { type: 'image', attrs: { src: '/api/files/abc/pic.png', alt: 'Diagram' } },
  ],
};

describe('document export', () => {
  it('writes Markdown', () => {
    const md = docToMarkdown(doc, 'My doc');
    expect(md).toContain('# My doc\n\n## Plan');
    expect(md).toContain('Read **chapter 3** and [notes](https://x.org/a) with @Asha \\*now\\*');
    expect(md).toContain('- one\n  3. three');
    expect(md).toContain('- [x] done\n- [ ] todo');
    expect(md).toContain('> quoted');
    expect(md).toContain('```py\nprint(1)\nprint(2)\n```');
    expect(md).toContain('| Name | Score |\n| --- | --- |\n| A\\|B | 9 |');
    expect(md).toContain('---\n\n![Diagram](/api/files/abc/pic.png)');
  });
  it('makes the parts of a Word file', () => {
    const files = docToDocx(doc, 'My doc', { origin: 'https://uni.example' });
    const body = files['word/document.xml'] as string;
    expect(body).toContain('<w:pStyle w:val="Title"/>');
    expect(body).toContain('<w:pStyle w:val="Heading2"/>');
    expect(body).toContain('<w:b/></w:rPr><w:t xml:space="preserve">chapter 3 </w:t>');
    expect(body).toMatch(/<w:hyperlink r:id="rId10">/);
    expect(files['word/_rels/document.xml.rels']).toContain('Target="https://x.org/a" TargetMode="External"');
    expect(body).toContain('<w:numId w:val="1"/>'); // bullets
    expect(body).toContain('<w:ilvl w:val="1"/><w:numId w:val="2"/>'); // the nested numbered list
    expect(files['word/numbering.xml']).toContain('<w:startOverride w:val="3"/>');
    expect(body).toContain('☑ ');
    expect(body).toContain('<w:pStyle w:val="Quote"/>');
    expect(body).toContain('print(1)</w:t><w:br/><w:t xml:space="preserve">print(2)');
    expect(body).toContain('<w:tbl>');
    expect(body).toContain('[Picture: Diagram]');
    expect(imageSources(doc)).toEqual(['/api/files/abc/pic.png']);
  });
  it('embeds pictures it was given, and the zip opens', () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const files = docToDocx(doc, '', { images: new Map([['/api/files/abc/pic.png', { data: png, width: 1200, height: 600 }]]) });
    expect(files['word/media/image1.png']).toBe(png);
    expect(files['word/document.xml']).toContain('<wp:extent cx="5486400" cy="2743200"/>');
    const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));
    const back = unzipSync(zipped);
    expect(Object.keys(back)).toContain('word/document.xml');
    expect(strFromU8(back['[Content_Types].xml'])).toContain('wordprocessingml.document.main+xml');
  });
  it('escapes text for XML', () => {
    const files = docToDocx({ type: 'doc', content: [p(t('a < b & "c"\u0001'))] }, '');
    expect(files['word/document.xml']).toContain('a &lt; b &amp; &quot;c&quot;</w:t>');
  });
  it('writes embeds as code, maths or links', () => {
    const d: PMNode = { type: 'doc', content: [
      { type: 'embed', attrs: { kind: 'code', lang: 'javascript', code: 'console.log(1)' } },
      { type: 'embed', attrs: { kind: 'math', tex: 'x^2' } },
      { type: 'embed', attrs: { kind: 'youtube', src: 'dQw4w9WgXcQ', title: 'Intro' } },
      { type: 'embed', attrs: { kind: 'board', src: 'cmv4028hv00028vhurdl2laue', title: 'Plan' } },
    ] };
    const md = docToMarkdown(d, '', 'https://u.app');
    expect(md).toContain('```js\nconsole.log(1)\n```');
    expect(md).toContain('$$\nx^2\n$$');
    expect(md).toContain('[Video: Intro](https://www.youtube.com/watch?v=dQw4w9WgXcQ)');
    expect(md).toContain('[Whiteboard: Plan](https://u.app/boards/cmv4028hv00028vhurdl2laue)');
    const files = docToDocx(d, '', { origin: 'https://u.app' });
    expect(files['word/document.xml']).toContain('console.log(1)');
    expect(files['word/_rels/document.xml.rels']).toContain('Target="https://u.app/boards/cmv4028hv00028vhurdl2laue"');
  });
  it('writes suggestions as tracked changes', () => {
    const who = { id: 's1', name: 'Asha', userId: 'u1', at: Date.UTC(2026, 9, 11, 9, 30) };
    const d: PMNode = { type: 'doc', content: [p(t('Hello '), t('world', ['suggestionDelete', who]), t('there', ['suggestionInsert', who]))] };
    expect(docToMarkdown(d)).toContain('Hello ~~world~~there');
    const body = docToDocx(d, '')['word/document.xml'] as string;
    expect(body).toContain('<w:del w:id="1" w:author="Asha" w:date="2026-10-11T09:30:00Z"><w:r><w:delText xml:space="preserve">world</w:delText></w:r></w:del>');
    expect(body).toContain('<w:ins w:id="2" w:author="Asha" w:date="2026-10-11T09:30:00Z"><w:r><w:t xml:space="preserve">there</w:t></w:r></w:ins>');
  });
});
