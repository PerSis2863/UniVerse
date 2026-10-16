import { describe, expect, it } from 'vitest';
import { isMoodleXml, parseMoodleXml } from './moodle-xml';
import { cleanQuestion } from './question-bank';

const q = (type: string, name: string, text: string, inner: string) => `<question type="${type}"><name><text>${name}</text></name><questiontext format="html"><text><![CDATA[<p>${text}</p>]]></text></questiontext><generalfeedback format="html"><text></text></generalfeedback><defaultgrade>1.0000000</defaultgrade>${inner}</question>`;
const a = (fraction: number, text: string, extra = '') => `<answer fraction="${fraction}" format="html"><text><![CDATA[${text}]]></text><feedback format="html"><text>fb</text></feedback>${extra}</answer>`;

const FILE = `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
<!-- question: 0  -->
<question type="category"><category><text>$course$/top/Default</text></category></question>
${q('multichoice', 'Capital', 'Capital of <b>France</b>?', `<single>true</single><shuffleanswers>true</shuffleanswers>${a(100, 'Paris')}${a(0, 'Rome')}${a(0, 'Oslo')}`).replace('<generalfeedback format="html"><text></text>', '<generalfeedback format="html"><text>It is on the Seine.</text>')}
${q('multichoice', 'Primes', 'Which are prime?', `<single>false</single>${a(50, '2')}${a(50, '3')}${a(-100, '4')}`)}
${q('truefalse', 'Sun', 'The sun is a star.', `${a(0, 'false')}${a(100, 'true')}`)}
${q('shortanswer', 'Author', 'Who wrote Hamlet?', `<usecase>0</usecase>${a(100, 'Shakespeare')}${a(100, 'William Shakespeare')}${a(50, 'Will')}${a(0, '*')}`)}
${q('numerical', 'Pi', 'Pi to two places?', `${a(100, '3.14', '<tolerance>0.01</tolerance>')}<units><unit><multiplier>1</multiplier><unit_name>rad</unit_name></unit></units>`)}
${q('matching', 'Sounds', 'Match the sounds.', '<subquestion format="html"><text>cat</text><answer><text>meow</text></answer></subquestion><subquestion format="html"><text>dog</text><answer><text>woof</text></answer></subquestion><subquestion format="html"><text></text><answer><text>moo</text></answer></subquestion>')}
${q('essay', 'Summer', 'Write about your summer.', '')}
${q('ddwtos', 'Drag', 'Drag [[1]] here.', '')}
</quiz>`;

describe('parseMoodleXml', () => {
  const r = parseMoodleXml(FILE);

  it('reads each kind of question', () => {
    expect(r.questions.map((x) => x.type)).toEqual(['CHOICE', 'MULTI', 'TRUE_FALSE', 'SHORT', 'NUMBER', 'MATCH']);
    expect(r.questions[0]).toEqual({ type: 'CHOICE', question: 'Capital of France?', points: 1, options: ['Paris', 'Rome', 'Oslo'], correctAnswer: 'Paris', explain: 'It is on the Seine.' });
    expect(r.questions[1]).toMatchObject({ correct: ['2', '3'], partial: true });
    expect(r.questions[2]).toMatchObject({ correctAnswer: 'True' });
    expect(r.questions[3]).toMatchObject({ accepted: ['Shakespeare', 'William Shakespeare'] });
    expect(r.questions[4]).toMatchObject({ value: 3.14, tolerance: 0.01, unit: 'rad' });
    expect(r.questions[5]).toMatchObject({ pairs: [{ left: 'cat', right: 'meow' }, { left: 'dog', right: 'woof' }], extra: ['moo'] });
  });

  it('skips categories and says why others were skipped', () => {
    expect(r.errors.map((e) => [e.n, e.title, e.error.split(':')[0]])).toEqual([[7, 'Summer', 'An essay'], [8, 'Drag', 'Drag and drop']]);
  });

  it('gives questions the server accepts', () => {
    for (const x of r.questions) expect(cleanQuestion(x), x.question).toMatchObject({ type: x.type });
  });

  it('knows a Moodle file', () => {
    expect(isMoodleXml(FILE)).toBe(true);
    expect(isMoodleXml('<questestinterop/>')).toBe(false);
    expect(() => parseMoodleXml('<questestinterop/>')).toThrow();
  });
});
