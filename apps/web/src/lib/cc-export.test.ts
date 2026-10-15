import { describe, expect, it } from 'vitest';
import { buildCartridge, docToHtml, safeName, textToHtml } from './cc-export';

const dec = new TextDecoder();
const p = (text: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] });

describe('lesson pages as HTML', () => {
  it('writes text, marks, links and every lesson block', () => {
    const html = docToHtml({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'A < B' }] },
      p('bold', [{ type: 'bold' }, { type: 'link', attrs: { href: '/files/x' } }]),
      { type: 'callout', attrs: { tone: 'tip' }, content: [p('Little and often')] },
      { type: 'embed', attrs: { kind: 'youtube', src: 'dQw4w9WgXcQ', title: 'Lecture', chapters: '0:00 Start\n1:10 Loops' } },
      { type: 'embed', attrs: { kind: 'math', tex: 'x^2' } },
      { type: 'quickCheck', attrs: { question: 'Pick 3', options: ['2', '3'], answer: 1, explain: 'Count them' } },
      { type: 'flashcards', attrs: { title: 'Words', cards: [{ front: 'loop', back: 'repeat' }] } },
    ] }, 'https://app.example');
    expect(html).toContain('<h2>A &lt; B</h2>');
    expect(html).toContain('<a href="https://app.example/files/x"><strong>bold</strong></a>');
    expect(html).toContain('<strong>Tip</strong></p><p>Little and often</p>');
    expect(html).toContain('<a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">Lecture</a>');
    expect(html).toContain('<li>1:10 Loops</li>');
    expect(html).toContain('\\(x^2\\)');
    expect(html).toContain('<em>Answer:</em> 3 — Count them');
    expect(html).toContain('<dt>loop</dt><dd>repeat</dd>');
  });
  it('turns plain text into paragraphs, escaped', () => {
    expect(textToHtml('One <b>\ntwo\n\nThree')).toBe('<p>One &lt;b&gt;<br>two</p><p>Three</p>');
  });
  it('makes safe file names', () => {
    expect(safeName('Week 1: Intro/notes?.pdf')).toBe('Week-1-Intronotes.pdf');
    expect(safeName('../../etc')).toBe('etc');
    expect(safeName('***')).toBe('file');
  });
});

describe('the cartridge', () => {
  const files = buildCartridge({
    code: 'CS101', name: 'Programming & you', description: 'Basics',
    modules: [
      { title: 'Week 1', summary: null, items: [
        { kind: 'PAGE', title: 'Welcome', html: '<p>Hi</p>' },
        { kind: 'PAGE', title: 'Welcome', html: '<p>Again</p>' },
        { kind: 'LINK', title: 'Docs', url: 'https://docs.python.org/?a=1&b=2' },
      ] },
      { title: 'Week 2', summary: null, items: [
        { kind: 'FILE', title: 'Slides', name: 'slides.pdf', data: new Uint8Array([1, 2, 3]) },
        { kind: 'QUIZ', title: 'Quiz 1', description: null, questions: [{ question: '2 + 2?', options: ['3', '4'], correct: '4', points: 2 }] },
      ] },
    ],
  });
  const manifest = dec.decode(files['imsmanifest.xml']);

  it('has the modules as folders with their items, and a resource for each', () => {
    expect(manifest).toContain('<schemaversion>1.1.0</schemaversion>');
    expect(manifest).toContain('<lomimscc:string>CS101 Programming &amp; you</lomimscc:string>');
    expect(manifest.match(/<item identifier="module_/g)).toHaveLength(2);
    expect(manifest.match(/identifierref=/g)).toHaveLength(5);
    expect(manifest).toContain('type="imswl_xmlv1p1"');
    expect(manifest).toContain('type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment"');
  });
  it('keeps two pages with one title apart, and escapes link addresses', () => {
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['pages/Welcome.html', 'pages/Welcome-2.html', 'files/slides.pdf']));
    expect(dec.decode(files['pages/Welcome-2.html'])).toContain('<p>Again</p>');
    expect(dec.decode(files['links/res_3.xml'])).toContain('href="https://docs.python.org/?a=1&amp;b=2"');
    expect(files['files/slides.pdf']).toEqual(new Uint8Array([1, 2, 3]));
  });
  it('writes quizzes as QTI with the right answer marked', () => {
    const q = dec.decode(files['res_5/assessment.xml']);
    expect(q).toContain('cc.multiple_choice.v0p1');
    expect(q).toContain('<response_label ident="res_5_q1_a2"><material><mattext texttype="text/plain">4</mattext>');
    expect(q).toContain('<varequal respident="response1">res_5_q1_a2</varequal>');
    expect(q).toContain('<fieldentry>2</fieldentry>');
  });
});
