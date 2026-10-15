import { describe, expect, it } from 'vitest';
import { LessonPageError, RICH_PAGE_MAX, cleanLessonDoc, cleanPageBody, isRichPage, pageDoc, parseChapters, plainToDoc } from './lesson-page';

const doc = (...content: unknown[]) => ({ type: 'doc', content });
const p = (text: string, marks?: unknown[]) => ({ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] });

describe('video chapters', () => {
  it('reads m:ss and h:mm:ss lines in order, skipping the rest', () => {
    expect(parseChapters('4:30 - Second\n0:00 Intro\nnot a chapter\n1:02:03 Last part')).toEqual([
      { at: 0, label: '0:00', title: 'Intro' },
      { at: 270, label: '4:30', title: 'Second' },
      { at: 3723, label: '1:02:03', title: 'Last part' },
    ]);
    expect(parseChapters('')).toEqual([]);
    expect(parseChapters('0:75 Bad seconds')).toEqual([]);
  });
});

describe('plain pages', () => {
  it('become paragraphs with their line breaks', () => {
    expect(plainToDoc('One\ntwo\n\nThree')).toEqual(doc(
      { type: 'paragraph', content: [{ type: 'text', text: 'One' }, { type: 'hardBreak' }, { type: 'text', text: 'two' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Three' }] },
    ));
    expect(plainToDoc('')).toEqual(doc({ type: 'paragraph' }));
    expect(pageDoc(null)).toEqual(doc({ type: 'paragraph' }));
    expect(pageDoc('{"type":"doc"}')).toEqual(doc({ type: 'paragraph' }));
  });
  it('are trimmed and capped; rich ones are checked', () => {
    expect(cleanPageBody('  hello  ')).toBe('hello');
    expect(cleanPageBody('x'.repeat(20_000))).toHaveLength(10_000);
    expect(cleanPageBody(42)).toBe('');
    expect(isRichPage(cleanPageBody(JSON.stringify(doc(p('Hi')))))).toBe(true);
  });
});

describe('checking a rich page', () => {
  it('keeps what the editor makes, with only known attributes', () => {
    const out = JSON.parse(cleanLessonDoc(JSON.stringify(doc(
      { type: 'heading', attrs: { level: 2, onclick: 'x' }, content: [{ type: 'text', text: 'Title' }] },
      { type: 'callout', attrs: { tone: 'tip' }, content: [p('Bold', [{ type: 'bold' }])] },
      { type: 'quickCheck', attrs: { question: 'Q?', options: ['a', 'b', 7], answer: 1, explain: 'Because', extra: true } },
      { type: 'flashcards', attrs: { title: 'Words', cards: [{ front: 'A', back: 'B', x: 1 }, 'junk'] } },
      { type: 'embed', attrs: { kind: 'youtube', src: 'dQw4w9WgXcQ', chapters: '0:00 Start' } },
    ))));
    expect(out.content[0]).toEqual({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] });
    expect(out.content[1].attrs).toEqual({ tone: 'tip' });
    expect(out.content[2].attrs).toEqual({ question: 'Q?', options: ['a', 'b', ''], answer: 1, explain: 'Because' });
    expect(out.content[3].attrs.cards).toEqual([{ front: 'A', back: 'B' }, { front: '', back: '' }]);
    expect(out.content[4].attrs.chapters).toBe('0:00 Start');
  });

  it('drops unsafe links and unknown tones and embed kinds', () => {
    const out = JSON.parse(cleanLessonDoc(doc(
      p('bad', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }, { type: 'italic' }]),
      p('good', [{ type: 'link', attrs: { href: 'https://example.com', onclick: 'x' } }]),
      { type: 'callout', attrs: { tone: 'party' }, content: [p('x')] },
      { type: 'embed', attrs: { kind: 'board', src: 'abc' } },
    )));
    expect(out.content[0].content[0].marks).toEqual([{ type: 'italic' }]);
    expect(out.content[1].content[0].marks).toEqual([{ type: 'link', attrs: { href: 'https://example.com' } }]);
    expect(out.content[2].attrs).toBeUndefined();
    expect(out.content[3].attrs).toEqual({ src: 'abc' });
  });

  it('refuses unknown blocks, unsafe pictures, a page that is not a doc, and huge or deep pages', () => {
    expect(() => cleanLessonDoc(doc({ type: 'iframe', attrs: { src: 'https://evil.example' } }))).toThrow(LessonPageError);
    expect(() => cleanLessonDoc(doc({ type: 'image', attrs: { src: 'javascript:alert(1)' } }))).toThrow(LessonPageError);
    expect(() => cleanLessonDoc(doc({ type: 'image', attrs: { src: '//evil.example/x.png' } }))).toThrow(LessonPageError);
    expect(() => cleanLessonDoc({ type: 'paragraph' })).toThrow(LessonPageError);
    expect(() => cleanLessonDoc(doc(doc()))).toThrow(LessonPageError);
    expect(() => cleanLessonDoc('{not json')).toThrow(LessonPageError);
    let deep: Record<string, unknown> = p('x');
    for (let i = 0; i < 45; i++) deep = { type: 'blockquote', content: [deep] };
    expect(() => cleanLessonDoc(doc(deep))).toThrow(/nested/);
    expect(() => cleanLessonDoc(doc(...Array.from({ length: 4 }, () => p('x'.repeat(RICH_PAGE_MAX / 4)))))).toThrow(/too long/);
  });

  it('always starts with the rich-page marker', () => {
    const json = cleanLessonDoc({ content: [p('x')], type: 'doc' });
    expect(json.startsWith('{"type":"doc"')).toBe(true);
    expect(cleanLessonDoc(doc())).toBe('{"type":"doc"}');
  });
});
