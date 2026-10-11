import { describe, expect, it } from 'vitest';
import { combinedTargets, kindOf, markdownToHtml, outName, recordsToRows, rowsToRecords, targetsFor, toCsv } from './convert-formats';

describe('what a file is and can become', () => {
  it('recognises files by name, then type', () => {
    expect(kindOf('Photo.JPG')).toBe('image');
    expect(kindOf('report.docx')).toBe('word');
    expect(kindOf('marks.xlsx')).toBe('sheet');
    expect(kindOf('song', 'audio/mpeg')).toBe('audio');
    expect(kindOf('thing.xyz')).toBe('other');
  });
  it('offers sensible targets, never the same format', () => {
    expect(targetsFor('image').map((t) => t.id)).toEqual(['png', 'jpg', 'webp', 'pdf-img']);
    expect(targetsFor('markdown').map((t) => t.id)).not.toContain('md');
    expect(targetsFor('word').map((t) => t.id)).toContain('uvdoc');
    expect(targetsFor('other')).toEqual([]);
    expect(combinedTargets(['image', 'pdf']).map((t) => t.id)).toEqual(['merge-pdf', 'zip']);
    expect(combinedTargets(['image', 'word']).map((t) => t.id)).toEqual(['zip']);
    expect(combinedTargets(['image'])).toEqual([]);
  });
  it('names converted files', () => {
    expect(outName('Lab report.docx', 'pdf')).toBe('Lab report.pdf');
    expect(outName('slides.pdf', 'png', 3)).toBe('slides-3.png');
    expect(outName('a/b:c.txt', 'md')).toBe('a-b-c.md');
  });
});

describe('markdown to HTML', () => {
  it('handles headings, emphasis, links, lists, quotes and code', () => {
    const html = markdownToHtml('# Title\n\nSome **bold** and *it* with `x<y` and [a link](https://x.test).\n\n- one\n- two\n\n1. first\n\n> quoted\n\n```\nlet a = 1 < 2;\n```\n---');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<p>Some <strong>bold</strong> and <em>it</em> with <code>x&lt;y</code> and <a href="https://x.test">a link</a>.</p>');
    expect(html).toContain('<ul>\n<li>one</li>\n<li>two</li>\n</ul>');
    expect(html).toContain('<ol>\n<li>first</li>\n</ol>');
    expect(html).toContain('<blockquote>quoted</blockquote>');
    expect(html).toContain('<pre><code>let a = 1 &lt; 2;</code></pre>');
    expect(html).toContain('<hr>');
  });
  it('escapes HTML in the text', () => {
    expect(markdownToHtml('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(markdownToHtml('[x](javascript:alert(1))')).not.toContain('href');
  });
});

describe('tables', () => {
  it('writes CSV that spreadsheets read', () => {
    expect(toCsv([['name', 'note'], ['Asha', 'said "hi", left'], [1, null]])).toBe('name,note\r\nAsha,"said ""hi"", left"\r\n1,');
  });
  it('turns records into rows and back', () => {
    const rows = recordsToRows([{ a: 1, b: 'x' }, { a: 2, c: { d: 1 } }])!;
    expect(rows).toEqual([['a', 'b', 'c'], [1, 'x', undefined], [2, undefined, '{"d":1}']]);
    expect(recordsToRows([1, 2])).toBeNull();
    expect(rowsToRecords([['name', ''], ['Asha', 3], [null, '']])).toEqual([{ name: 'Asha', column2: 3 }]);
  });
});

describe('WAV', () => {
  it('writes a valid header and samples', async () => {
    const { encodeWav } = await import('./convert-formats');
    const buf = encodeWav([new Float32Array([0, 1, -1]), new Float32Array([0.5, 0, 0])], 8000);
    const v = new DataView(buf);
    const tag = (o: number) => String.fromCharCode(...new Uint8Array(buf, o, 4));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(buf.byteLength).toBe(44 + 3 * 2 * 2);
    expect([v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true)]).toEqual([2, 8000, 16]);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true), v.getInt16(52, true)]).toEqual([0, 16383, 32767, -32768]);
  });
});
