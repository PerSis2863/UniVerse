import { describe, expect, it } from 'vitest';
import { buildCartridge } from './cc-export';
import { cleanPath, htmlText, pictureFiles, readCartridge, readQti } from './cc-import';
import { decodeEntities, parseXml, textOf } from './xml-lite';

const enc = new TextEncoder();
const files = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc.encode(v)]));

const QTI = `<?xml version="1.0"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2"><assessment ident="a1" title="Week 1 quiz">
  <section ident="root">
    <item ident="q1"><itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.multiple_choice.v0p1</fieldentry></qtimetadatafield><qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>2</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
      <presentation><material><mattext texttype="text/html">&lt;p&gt;What is &lt;b&gt;2 + 2&lt;/b&gt;?&lt;/p&gt;</mattext></material>
        <response_lid ident="r1" rcardinality="Single"><render_choice>
          <response_label ident="x1"><material><mattext>3</mattext></material></response_label>
          <response_label ident="x2"><material><mattext>4</mattext></material></response_label>
        </render_choice></response_lid></presentation>
      <resprocessing><respcondition><conditionvar><varequal respident="r1">x2</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing></item>
    <item ident="q2"><itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.essay.v0p1</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
      <presentation><material><mattext>Explain loops.</mattext></material><response_str ident="r2"/></presentation></item>
    <item ident="q3"><itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.true_false.v0p1</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
      <presentation><material><mattext>Python is compiled.</mattext></material>
        <response_lid ident="r3"><render_choice>
          <response_label ident="t"><material><mattext>True</mattext></material></response_label>
          <response_label ident="f"><material><mattext>False</mattext></material></response_label>
        </render_choice></response_lid></presentation>
      <resprocessing><respcondition><conditionvar><varequal respident="r3">f</varequal></conditionvar><setvar varname="SCORE" action="Set">100</setvar></respcondition></resprocessing></item>
  </section></assessment></questestinterop>`;

const MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!-- made by an LMS -->
<manifest identifier="m" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest">
  <metadata><schema>IMS Common Cartridge</schema><lomimscc:lom><lomimscc:general><lomimscc:title><lomimscc:string>Intro &amp; Python</lomimscc:string></lomimscc:title></lomimscc:general></lomimscc:lom></metadata>
  <organizations><organization identifier="o" structure="rooted-hierarchy"><item identifier="LearningModules">
    <item identifier="w1"><title>Week 1</title>
      <item identifier="i1" identifierref="r_page"><title>Welcome</title></item>
      <item identifier="i2" identifierref="r_link"><title>Lecture video</title></item>
      <item identifier="i3" identifierref="r_file"><title>Slides</title></item>
      <item identifier="i4" identifierref="r_quiz"><title>Week 1 quiz</title></item>
      <item identifier="sub"><title>Extra</title>
        <item identifier="i5" identifierref="r_topic"><title>Talk about it</title></item>
      </item>
    </item>
    <item identifier="w2"><title>Week 2</title>
      <item identifier="i6" identifierref="r_lti"><title>Coding tool</title></item>
      <item identifier="i7" identifierref="r_gone"><title>Lost page</title></item>
      <item identifier="i8" identifierref="r_bad_link"><title>Bad link</title></item>
    </item>
  </item></organization></organizations>
  <resources>
    <resource identifier="r_page" type="webcontent" href="wiki_content/welcome%20page.html"><file href="wiki_content/welcome page.html"/></resource>
    <resource identifier="r_link" type="imswl_xmlv1p1"><file href="links/l1.xml"/></resource>
    <resource identifier="r_file" type="webcontent" href="web_resources/slides.pdf"><file href="web_resources/slides.pdf"/></resource>
    <resource identifier="r_quiz" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment"><file href="q1/assessment.xml"/></resource>
    <resource identifier="r_topic" type="imsdt_xmlv1p1"><file href="t1.xml"/></resource>
    <resource identifier="r_lti" type="imsbasiclti_xmlv1p0"><file href="lti.xml"/></resource>
    <resource identifier="r_bad_link" type="imswl_xmlv1p1"><file href="links/l2.xml"/></resource>
  </resources>
</manifest>`;

const CARTRIDGE = files({
  'imsmanifest.xml': MANIFEST,
  'wiki_content/welcome page.html': '<html><body><h1>Welcome</h1><p>Hi <img src="$IMS-CC-FILEBASE$/pic.png"></p></body></html>',
  'links/l1.xml': '<webLink><title>Lecture</title><url href="https://youtu.be/dQw4w9WgXcQ"/></webLink>',
  'links/l2.xml': "<webLink><title>Bad</title><url href='javascript:alert(1)'/></webLink>",
  'web_resources/slides.pdf': '%PDF',
  'q1/assessment.xml': QTI,
  't1.xml': '<topic><title>Talk</title><text texttype="text/html">&lt;p&gt;What surprised you?&lt;/p&gt;</text></topic>',
  'lti.xml': '<cartridge_basiclti_link/>',
});

describe('xml', () => {
  it('reads elements, attributes, text, CDATA and entities, without prefixes', () => {
    const x = parseXml('<?xml version="1.0"?><!DOCTYPE a><a:root x:id="1" b=\'two &amp; three\'><b>hi &lt;there&gt; &#65;&#x42;</b><c/><d><![CDATA[<raw>]]></d></a:root>');
    expect(x.name).toBe('root');
    expect(x.attrs).toEqual({ id: '1', b: 'two & three' });
    expect(textOf(x.children[0])).toBe('hi <there> AB');
    expect(x.children[1].name).toBe('c');
    expect(x.children[2].text).toBe('<raw>');
  });
  it('refuses broken XML and leaves unknown entities alone', () => {
    expect(() => parseXml('<a><b></a>')).toThrow();
    expect(() => parseXml('just text')).toThrow();
    expect(decodeEntities('&foo; &#0;')).toBe('&foo; ');
  });
});

describe('reading a cartridge', () => {
  const plan = readCartridge(CARTRIDGE);
  it('makes modules from its folders, folders inside folders after them', () => {
    expect(plan.title).toBe('Intro & Python');
    expect(plan.modules.map((m) => m.title)).toEqual(['Week 1', 'Week 1: Extra']);
    expect(plan.modules[0].items.map((i) => `${i.kind}:${i.title}`)).toEqual(['PAGE:Welcome', 'VIDEO:Lecture video', 'FILE:Slides', 'QUIZ:Week 1 quiz']);
  });
  it('finds pages and files by their paths, and topics become pages', () => {
    const [page, video, file] = plan.modules[0].items;
    expect(page).toMatchObject({ kind: 'PAGE', path: 'wiki_content/welcome page.html' });
    expect(video).toMatchObject({ url: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(file).toMatchObject({ path: 'web_resources/slides.pdf' });
    expect(plan.modules[1].items[0]).toMatchObject({ kind: 'PAGE', title: 'Talk about it' });
    expect((plan.modules[1].items[0] as { html: string }).html).toContain('<p>What surprised you?</p>');
  });
  it('reads multiple-choice and true/false questions, and says what it left out', () => {
    const quiz = plan.modules[0].items[3];
    expect(quiz).toMatchObject({ kind: 'QUIZ', questions: [
      { question: 'What is 2 + 2?', options: ['3', '4'], correct: '4', points: 2 },
      { question: 'Python is compiled.', options: ['True', 'False'], correct: 'False', points: 1 },
    ] });
    expect(plan.skipped).toEqual([
      { title: 'Week 1 quiz', why: '1 question of a kind that isn’t multiple choice' },
      { title: 'Coding tool', why: 'an external tool (LTI): add it again here' },
      { title: 'Lost page', why: 'missing from the cartridge' },
      { title: 'Bad link', why: 'a link that isn’t a web address' },
    ]);
  });
  it('reads back what this app exports', () => {
    const back = readCartridge(buildCartridge({ code: 'C1', name: 'Course', description: null, modules: [
      { title: 'Unit', summary: null, items: [
        { kind: 'PAGE', title: 'Read me', html: '<p>x</p>' },
        { kind: 'LINK', title: 'Site', url: 'https://example.com' },
        { kind: 'QUIZ', title: 'Q', description: 'Go', questions: [{ question: 'Pick b', options: ['a', 'b', 'c'], correct: 'b', points: 3 }] },
      ] },
    ] }));
    expect(back.modules).toHaveLength(1);
    expect(back.modules[0].items).toMatchObject([
      { kind: 'PAGE', title: 'Read me' }, { kind: 'LINK', url: 'https://example.com' },
      { kind: 'QUIZ', description: 'Go', questions: [{ question: 'Pick b', options: ['a', 'b', 'c'], correct: 'b', points: 3 }] },
    ]);
    expect(back.skipped).toEqual([]);
  });
  it('without folders, takes the pages, links and quizzes in order', () => {
    const plain = readCartridge(files({
      'imsmanifest.xml': '<manifest><organizations/><resources><resource identifier="a" type="webcontent" href="a.html"/><resource identifier="b" type="webcontent" href="pic.png"/></resources></manifest>',
      'a.html': '<p>A</p>', 'pic.png': 'x',
    }));
    expect(plain.modules).toEqual([{ title: 'Course content', items: [{ kind: 'PAGE', title: 'a', html: '<p>A</p>', path: 'a.html' }] }]);
  });
  it('says so when it isn’t a cartridge', () => {
    expect(() => readCartridge(files({ 'readme.txt': 'hi' }))).toThrow(/no imsmanifest/);
  });
});

describe('helpers', () => {
  it('cleans paths', () => {
    expect(cleanPath('./a/../b%20c.html?x=1')).toBe('b c.html');
    expect(cleanPath('../../etc/passwd', 'x')).toBe('etc/passwd');
  });
  it('finds pictures next to the page or in web_resources', () => {
    expect(pictureFiles('$IMS-CC-FILEBASE$/img/a.png', 'wiki_content/p.html')).toEqual(['wiki_content/img/a.png', 'img/a.png', 'web_resources/img/a.png']);
    expect(pictureFiles('../pics/b.png', 'wiki_content/p.html')).toEqual(['pics/b.png']);
    expect(pictureFiles('https://x.example/c.png', 'p.html')).toEqual([]);
  });
  it('reads text out of HTML', () => {
    expect(htmlText('<p>One &amp; <b>two</b></p><p>Three</p>')).toBe('One & two\nThree');
  });
  it('reads a QTI file on its own', () => {
    expect(readQti(QTI).title).toBe('Week 1 quiz');
  });
});
