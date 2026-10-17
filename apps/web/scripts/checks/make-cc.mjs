// A small Canvas-style cartridge for the browser test.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { zipSync, strToU8 } = require('fflate');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const pdf = strToU8('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const qti = `<?xml version="1.0"?><questestinterop><assessment ident="a1" title="Loops check"><section ident="root">
<item ident="q1"><itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.multiple_choice.v0p1</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
<presentation><material><mattext texttype="text/html">&lt;p&gt;How many times does range(3) loop?&lt;/p&gt;</mattext></material><response_lid ident="r1" rcardinality="Single"><render_choice>
<response_label ident="a"><material><mattext>2</mattext></material></response_label><response_label ident="b"><material><mattext>3</mattext></material></response_label></render_choice></response_lid></presentation>
<resprocessing><respcondition><conditionvar><varequal respident="r1">b</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing></item>
<item ident="q2"><itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.essay.v0p1</fieldentry></qtimetadatafield></qtimetadata></itemmetadata><presentation><material><mattext>Explain.</mattext></material></presentation></item>
</section></assessment></questestinterop>`;
const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="m" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest">
<metadata><schema>IMS Common Cartridge</schema><lomimscc:lom><lomimscc:general><lomimscc:title><lomimscc:string>CC import test</lomimscc:string></lomimscc:title></lomimscc:general></lomimscc:lom></metadata>
<organizations><organization identifier="o" structure="rooted-hierarchy"><item identifier="LearningModules">
<item identifier="w1"><title>CC Week 1</title>
<item identifier="i1" identifierref="r_page"><title>CC Welcome</title></item>
<item identifier="i2" identifierref="r_file"><title>CC Slides</title></item>
<item identifier="i3" identifierref="r_link"><title>CC Lecture</title></item></item>
<item identifier="w2"><title>CC Week 2</title>
<item identifier="i4" identifierref="r_quiz"><title>CC Loops check</title></item>
<item identifier="i5" identifierref="r_lti"><title>CC Coding tool</title></item></item>
</item></organization></organizations>
<resources>
<resource identifier="r_page" type="webcontent" href="wiki_content/welcome.html"><file href="wiki_content/welcome.html"/></resource>
<resource identifier="r_file" type="webcontent" href="web_resources/slides.pdf"><file href="web_resources/slides.pdf"/></resource>
<resource identifier="r_link" type="imswl_xmlv1p1"><file href="l1.xml"/></resource>
<resource identifier="r_quiz" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment"><file href="q1/assessment.xml"/></resource>
<resource identifier="r_lti" type="imsbasiclti_xmlv1p0"><file href="lti.xml"/></resource>
</resources></manifest>`;
const zip = zipSync({
  'imsmanifest.xml': strToU8(manifest),
  'wiki_content/welcome.html': strToU8('<html><head><title>CC Welcome</title></head><body><h1>CC Welcome</h1><h2>This week</h2><p>Read <strong>chapter 1</strong> and <a href="https://docs.python.org">the docs</a>, and <a href="$CANVAS_OBJECT_REFERENCE$/x">this</a>.</p><p><img src="$IMS-CC-FILEBASE$/dot.png" alt="A dot"></p><ul><li>One</li><li>Two</li></ul><script>alert(1)</script></body></html>'),
  'web_resources/dot.png': new Uint8Array(png),
  'web_resources/slides.pdf': pdf,
  'l1.xml': strToU8('<webLink><title>Lecture</title><url href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/></webLink>'),
  'q1/assessment.xml': strToU8(qti),
  'lti.xml': strToU8('<cartridge_basiclti_link/>'),
});
writeFileSync(process.argv[2], zip);
console.log('cartridge', zip.length, 'bytes');
