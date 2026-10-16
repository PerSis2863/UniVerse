import { describe, expect, it } from 'vitest';
import { isQti, parseQti } from './qti-items';
import { cleanQuestion } from './question-bank';

// Canvas's QTI 1.2 export, cut down: one item of each kind it makes.
const meta = (type: string, pts = 1) => `<itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>${type}</fieldentry></qtimetadatafield><qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>${pts}</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>`;
const text = (t: string) => `<material><mattext texttype="text/html">${t}</mattext></material>`;
const label = (id: string, t: string) => `<response_label ident="${id}">${text(t)}</response_label>`;
const right = (resp: string, v: string, score = 100) => `<respcondition continue="No"><conditionvar><varequal respident="${resp}">${v}</varequal></conditionvar><setvar action="Set" varname="SCORE">${score}</setvar></respcondition>`;

const CANVAS = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2"><assessment ident="a1" title="Unit 1"><section ident="root_section">
<item ident="q1" title="Capitals">${meta('multiple_choice_question', 2)}<presentation>${text('&lt;p&gt;Capital of &lt;b&gt;France&lt;/b&gt;?&lt;/p&gt;')}<response_lid ident="response1" rcardinality="Single"><render_choice>${label('1', 'Paris')}${label('2', 'Rome')}${label('3', 'Oslo')}</render_choice></response_lid></presentation>
<resprocessing><outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>${right('response1', '1')}</resprocessing>
<itemfeedback ident="general_fb"><flow_mat><material><mattext texttype="text/html">Paris is on the Seine.</mattext></material></flow_mat></itemfeedback></item>
<item ident="q2" title="Sun">${meta('true_false_question')}<presentation>${text('The sun is a star.')}<response_lid ident="response1" rcardinality="Single"><render_choice>${label('t', 'True')}${label('f', 'False')}</render_choice></response_lid></presentation><resprocessing>${right('response1', 't')}</resprocessing></item>
<item ident="q3" title="Primes">${meta('multiple_answers_question')}<presentation>${text('Which are prime?')}<response_lid ident="response1" rcardinality="Multiple"><render_choice>${label('a', '2')}${label('b', '3')}${label('c', '4')}</render_choice></response_lid></presentation>
<resprocessing><respcondition continue="No"><conditionvar><and><varequal respident="response1">a</varequal><varequal respident="response1">b</varequal><not><varequal respident="response1">c</varequal></not></and></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing></item>
<item ident="q4" title="Author">${meta('short_answer_question')}<presentation>${text('Who wrote Hamlet?')}<response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1" rshuffle="No"/></render_fib></response_str></presentation>
<resprocessing><respcondition continue="No"><conditionvar><varequal respident="response1">Shakespeare</varequal><varequal respident="response1">William Shakespeare</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing></item>
<item ident="q5" title="Pi">${meta('numerical_question')}<presentation>${text('Pi to two places?')}<response_str ident="response1" rcardinality="Single"><render_fib fibtype="Decimal"><response_label ident="answer1"/></render_fib></response_str></presentation>
<resprocessing><respcondition continue="No"><conditionvar><or><varequal respident="response1">3.14</varequal><and><vargte respident="response1">3.13</vargte><varlte respident="response1">3.15</varlte></and></or></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing></item>
<item ident="q6" title="Range">${meta('numerical_question')}<presentation>${text('A number from 1 to 5')}<response_str ident="response1" rcardinality="Single"><render_fib fibtype="Decimal"><response_label ident="answer1"/></render_fib></response_str></presentation>
<resprocessing><respcondition continue="No"><conditionvar><vargte respident="response1">1</vargte><varlte respident="response1">5</varlte></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing></item>
<item ident="q7" title="Animals">${meta('matching_question')}<presentation>${text('Match each animal to its sound.')}
<response_lid ident="response_1">${text('cat')}<render_choice>${label('m1', 'meow')}${label('m2', 'woof')}${label('m3', 'moo')}</render_choice></response_lid>
<response_lid ident="response_2">${text('dog')}<render_choice>${label('m1', 'meow')}${label('m2', 'woof')}${label('m3', 'moo')}</render_choice></response_lid></presentation>
<resprocessing>${right('response_1', 'm1', 50).replace('Set', 'Add')}${right('response_2', 'm2', 50).replace('Set', 'Add')}</resprocessing></item>
<item ident="q8" title="Colours">${meta('fill_in_multiple_blanks_question')}<presentation>${text('Roses are [c1] and violets are [c2].')}
<response_lid ident="response_c1">${text('c1')}<render_choice>${label('r1', 'red')}${label('r2', 'crimson')}</render_choice></response_lid>
<response_lid ident="response_c2">${text('c2')}<render_choice>${label('b1', 'blue')}</render_choice></response_lid></presentation>
<resprocessing>${right('response_c1', 'r1', 50)}${right('response_c1', 'r2', 50)}${right('response_c2', 'b1', 50)}</resprocessing></item>
<item ident="q9" title="Summer">${meta('essay_question')}<presentation>${text('Write about your summer.')}<response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1"/></render_fib></response_str></presentation></item>
<item ident="q10" title="Unmarked">${meta('multiple_choice_question')}<presentation>${text('Which?')}<response_lid ident="response1" rcardinality="Single"><render_choice>${label('1', 'A')}${label('2', 'B')}</render_choice></response_lid></presentation></item>
</section></assessment></questestinterop>`;

describe('parseQti (QTI 1.2, Canvas)', () => {
  const r = parseQti(CANVAS);

  it('reads each kind of question', () => {
    expect(r.questions.map((q) => q.type)).toEqual(['CHOICE', 'TRUE_FALSE', 'MULTI', 'SHORT', 'NUMBER', 'NUMBER', 'MATCH', 'BLANKS']);
    expect(r.questions[0]).toEqual({ type: 'CHOICE', question: 'Capital of France?', points: 2, options: ['Paris', 'Rome', 'Oslo'], correctAnswer: 'Paris', explain: 'Paris is on the Seine.' });
    expect(r.questions[1]).toMatchObject({ correctAnswer: 'True' });
    expect(r.questions[2]).toMatchObject({ options: ['2', '3', '4'], correct: ['2', '3'] });
    expect(r.questions[3]).toMatchObject({ accepted: ['Shakespeare', 'William Shakespeare'] });
    expect(r.questions[4]).toMatchObject({ value: 3.14, tolerance: 0.01 });
    expect(r.questions[5]).toMatchObject({ value: 3, tolerance: 2 });
    expect(r.questions[6]).toMatchObject({ pairs: [{ left: 'cat', right: 'meow' }, { left: 'dog', right: 'woof' }], extra: ['moo'] });
    expect(r.questions[7]).toMatchObject({ question: 'Roses are [[red|crimson]] and violets are [[blue]].' });
  });

  it('says which questions were skipped and why', () => {
    expect(r.errors).toEqual([
      { n: 9, title: 'Summer', error: 'An essay: there’s no answer to mark.' },
      { n: 10, title: 'Unmarked', error: 'No answer is marked right.' },
    ]);
  });

  it('gives questions the server accepts', () => {
    for (const q of r.questions) expect(cleanQuestion(q), q.question).toMatchObject({ type: q.type });
  });

  it('works out the kind when there is no metadata', () => {
    const plain = `<questestinterop><item ident="x" title="Plain"><presentation>${text('Pick one')}<response_lid ident="r" rcardinality="Single"><render_choice>${label('a', 'Yes')}${label('b', 'No')}</render_choice></response_lid></presentation><resprocessing>${right('r', 'b', 1)}</resprocessing></item></questestinterop>`;
    expect(parseQti(plain).questions[0]).toMatchObject({ type: 'CHOICE', correctAnswer: 'No' });
  });
});

describe('parseQti (QTI 2.1)', () => {
  const item = (decl: string, body: string, extra = '') => `<?xml version="1.0"?><assessmentItem xmlns="http://www.imsglobal.org/xsd/imsqti_v2p1" identifier="i1" title="T" adaptive="false" timeDependent="false">${decl}<outcomeDeclaration identifier="MAXSCORE" cardinality="single" baseType="float"><defaultValue><value>3</value></defaultValue></outcomeDeclaration><itemBody>${body}</itemBody>${extra}</assessmentItem>`;
  const decl = (card: string, base: string, values: string[]) => `<responseDeclaration identifier="RESPONSE" cardinality="${card}" baseType="${base}"><correctResponse>${values.map((v) => `<value>${v}</value>`).join('')}</correctResponse></responseDeclaration>`;

  it('reads one-answer and several-answer choice', () => {
    const one = parseQti(item(decl('single', 'identifier', ['B']), '<p>Largest planet?</p><choiceInteraction responseIdentifier="RESPONSE" shuffle="true" maxChoices="1"><simpleChoice identifier="A">Mars</simpleChoice><simpleChoice identifier="B"><p>Jupiter</p></simpleChoice></choiceInteraction>'));
    expect(one.questions[0]).toEqual({ type: 'CHOICE', question: 'Largest planet?', points: 3, options: ['Mars', 'Jupiter'], correctAnswer: 'Jupiter' });
    const many = parseQti(item(decl('multiple', 'identifier', ['A', 'C']), '<choiceInteraction responseIdentifier="RESPONSE" maxChoices="0"><prompt>Pick the even numbers</prompt><simpleChoice identifier="A">2</simpleChoice><simpleChoice identifier="B">3</simpleChoice><simpleChoice identifier="C">4</simpleChoice></choiceInteraction>'));
    expect(many.questions[0]).toMatchObject({ type: 'MULTI', question: 'Pick the even numbers', correct: ['2', '4'] });
  });

  it('reads text entry as a short answer, a number or blanks', () => {
    const short = parseQti(item(decl('single', 'string', ['Paris']), '<p>Capital of France?</p><p><textEntryInteraction responseIdentifier="RESPONSE" expectedLength="10"/></p>'));
    expect(short.questions[0]).toMatchObject({ type: 'SHORT', question: 'Capital of France?', accepted: ['Paris'] });
    const n = parseQti(item(decl('single', 'float', ['9.8']), '<p>g in m/s²? <textEntryInteraction responseIdentifier="RESPONSE"/></p>', '<responseProcessing><responseCondition><responseIf><equal toleranceMode="absolute" tolerance="0.1 0.1"><variable identifier="RESPONSE"/><correct identifier="RESPONSE"/></equal></responseIf></responseCondition></responseProcessing>'));
    expect(n.questions[0]).toMatchObject({ type: 'NUMBER', value: 9.8, tolerance: 0.1 });
    const blanks = parseQti(item(decl('single', 'string', ['100']), '<p>Water boils at <textEntryInteraction responseIdentifier="RESPONSE"/> degrees.</p>'));
    expect(blanks.questions[0]).toMatchObject({ type: 'BLANKS', question: 'Water boils at [[100]] degrees.' });
  });

  it('reads ordering and matching', () => {
    const order = parseQti(item(decl('ordered', 'identifier', ['C', 'A', 'B']), '<orderInteraction responseIdentifier="RESPONSE"><prompt>Smallest first</prompt><simpleChoice identifier="A">10</simpleChoice><simpleChoice identifier="B">100</simpleChoice><simpleChoice identifier="C">1</simpleChoice></orderInteraction>'));
    expect(order.questions[0]).toMatchObject({ type: 'ORDER', items: ['1', '10', '100'] });
    const match = parseQti(item(decl('multiple', 'directedPair', ['L1 R2', 'L2 R1']), '<matchInteraction responseIdentifier="RESPONSE" maxAssociations="2"><prompt>Match the capitals</prompt><simpleMatchSet><simpleAssociableChoice identifier="L1" matchMax="1">France</simpleAssociableChoice><simpleAssociableChoice identifier="L2" matchMax="1">Italy</simpleAssociableChoice></simpleMatchSet><simpleMatchSet><simpleAssociableChoice identifier="R1" matchMax="1">Rome</simpleAssociableChoice><simpleAssociableChoice identifier="R2" matchMax="1">Paris</simpleAssociableChoice><simpleAssociableChoice identifier="R3" matchMax="1">Oslo</simpleAssociableChoice></simpleMatchSet></matchInteraction>'));
    expect(match.questions[0]).toMatchObject({ type: 'MATCH', pairs: [{ left: 'France', right: 'Paris' }, { left: 'Italy', right: 'Rome' }], extra: ['Oslo'] });
    for (const q of [...order.questions, ...match.questions]) expect(typeof cleanQuestion(q)).toBe('object');
  });

  it('skips essays with a reason', () => {
    const r = parseQti(item(decl('single', 'string', []), '<p>Discuss.</p><extendedTextInteraction responseIdentifier="RESPONSE"/>'));
    expect(r.errors).toEqual([{ n: 1, title: 'T', error: 'An essay: there’s no answer to mark.' }]);
  });
});

describe('isQti', () => {
  it('tells QTI from other XML', () => {
    expect(isQti(CANVAS)).toBe(true);
    expect(isQti('<assessmentItem identifier="x"/>')).toBe(true);
    expect(isQti('<manifest><resources/></manifest>')).toBe(false);
  });
  it('refuses XML that isn’t QTI', () => {
    expect(() => parseQti('<manifest/>')).toThrow();
  });
});
