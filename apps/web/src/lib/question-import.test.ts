import { describe, expect, it } from 'vitest';
import { unzipSync, zipSync } from 'fflate';
import { readQuestionFile } from './question-import';

const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s);
const qti = (title: string, answer: string) => `<?xml version="1.0"?><questestinterop><assessment title="${title}"><section><item ident="1" title="${title}"><presentation><material><mattext>Pick ${answer}</mattext></material><response_lid ident="r" rcardinality="Single"><render_choice><response_label ident="a"><material><mattext>${answer}</mattext></material></response_label><response_label ident="b"><material><mattext>other</mattext></material></response_label></render_choice></response_lid></presentation><resprocessing><respcondition><conditionvar><varequal respident="r">a</varequal></conditionvar><setvar action="Set">100</setvar></respcondition></resprocessing></item></section></assessment></questestinterop>`;

describe('readQuestionFile', () => {
  it('reads CSV with line numbers for skipped rows', () => {
    const r = readQuestionFile('bank.csv', bytes('question,a,b,correct\nTwo plus two?,4,5,A\nBroken,,,'));
    expect(r.format).toBe('CSV');
    expect(r.questions).toHaveLength(1);
    expect(r.errors[0].where).toBe('Line 3');
  });

  it('reads GIFT, checking each question with the server’s rules', () => {
    const r = readQuestionFile('moodle.txt', bytes('::A::Sky colour? {=blue ~green}\n\n::B::Match. {=a -> 1}'));
    expect(r.format).toBe('GIFT');
    expect(r.questions.map((q) => q.correctAnswer)).toEqual(['blue']);
    expect(r.errors).toEqual([{ where: '“Match.”', error: 'Give at least 2 pairs to match.' }]);
  });

  it('reads Moodle XML and QTI by their content', () => {
    expect(readQuestionFile('export.xml', bytes('<quiz><question type="truefalse"><questiontext><text>Is it?</text></questiontext><answer fraction="100"><text>true</text></answer><answer fraction="0"><text>false</text></answer></question></quiz>')).format).toBe('Moodle XML');
    const r = readQuestionFile('quiz.xml', bytes(qti('Q', 'yes')));
    expect(r.format).toBe('QTI');
    expect(r.questions[0]).toMatchObject({ question: 'Pick yes', correctAnswer: 'yes' });
  });

  it('reads every QTI file in a package and leaves the manifest alone', () => {
    const zip = zipSync({ 'imsmanifest.xml': bytes('<manifest/>'), 'g1/g1.xml': bytes(qti('One', 'x')), 'g1/assessment_meta.xml': bytes('<quiz/>'), 'g2/g2.xml': bytes(qti('Two', 'y')), 'g3/notes.xml': bytes('<notes/>') });
    const r = readQuestionFile('canvas-export.zip', zip, unzipSync);
    expect(r.questions.map((q) => q.correctAnswer)).toEqual(['x', 'y']);
    expect(() => readQuestionFile('empty.zip', zipSync({ 'a.txt': bytes('hi') }), unzipSync)).toThrow(/no QTI/);
  });

  it('says plainly when a file isn’t questions', () => {
    expect(() => readQuestionFile('notes.xml', bytes('<notes/>'))).toThrow(/isn’t Moodle XML or QTI/);
    expect(() => readQuestionFile('photo.png', new Uint8Array([1, 2, 3]))).toThrow(/Choose a CSV/);
  });
});

describe('what is sent to the server', () => {
  it('is each question as read, which the server’s own check accepts', async () => {
    const { cleanQuestion } = await import('./question-bank');
    const r = readQuestionFile('m.txt', bytes('Name a colour. {=red =blue}\n\nMatch. {=a -> 1 =b -> 2}\n\nPi? {#3.14:0.01}'));
    expect(r.send).toHaveLength(3);
    // The checked form can't be checked again (its answers are in meta), so the original goes.
    for (const q of r.send) expect(typeof cleanQuestion(JSON.parse(JSON.stringify(q)))).toBe('object');
  });
});
