import { embedHref, type EmbedAttrs } from './doc-embeds';
import { parseChapters, type LessonNode } from './lesson-page';

// A course as an IMS Common Cartridge 1.1 (.imscc), the format Canvas, Moodle, Blackboard,
// Brightspace and Schoology import (Stage 5 · B2). Made in the browser: the modules become the
// cartridge's folders; pages HTML files, links web links, files themselves, quizzes QTI 1.2
// assessments (multiple choice). Pure functions, so they're tested without a browser; zipping is the
// caller's (fflate).

export interface CartridgeQuestion { question: string; options: string[]; correct: string; points: number }
export type CartridgeItem =
  | { kind: 'PAGE'; title: string; html: string }
  | { kind: 'LINK'; title: string; url: string }
  | { kind: 'FILE'; title: string; name: string; data: Uint8Array }
  | { kind: 'QUIZ'; title: string; description: string | null; questions: CartridgeQuestion[] };
export interface CartridgeModule { title: string; summary: string | null; items: CartridgeItem[] }
export interface CartridgeCourse { code: string; name: string; description: string | null; modules: CartridgeModule[] }

const enc = new TextEncoder();
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** A file name without anything a zip or an LMS would trip on. */
export const safeName = (s: string, fallback = 'file') => s.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').replace(/^[.-]+/, '').slice(0, 80) || fallback;

// ── Lesson pages as HTML ─────────────────────────────────────────────────────────────────────

const TONES: Record<string, string> = { note: 'Note', tip: 'Tip', warning: 'Watch out', key: 'Key idea' };
const MARK_TAG: Record<string, string> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code' };

/** A page from the page editor as plain HTML (videos as links with their chapters, practice blocks spelt out). */
export function docToHtml(doc: LessonNode, origin = ''): string {
  const kids = (n: LessonNode) => (n.content ?? []).map(node).join('');
  const attr = (n: LessonNode, k: string) => n.attrs?.[k];
  function node(n: LessonNode): string {
    switch (n.type) {
      case 'text': {
        let out = esc(n.text ?? '');
        for (const m of n.marks ?? []) {
          if (m.type === 'link') { const href = String(m.attrs?.href ?? ''); out = `<a href="${esc(href.startsWith('/') ? origin + href : href)}">${out}</a>`; }
          else if (MARK_TAG[m.type]) out = `<${MARK_TAG[m.type]}>${out}</${MARK_TAG[m.type]}>`;
        }
        return out;
      }
      case 'paragraph': return `<p>${kids(n)}</p>`;
      case 'heading': { const l = Math.min(6, Math.max(1, Number(attr(n, 'level')) || 2)); return `<h${l}>${kids(n)}</h${l}>`; }
      case 'hardBreak': return '<br>';
      case 'horizontalRule': return '<hr>';
      case 'blockquote': return `<blockquote>${kids(n)}</blockquote>`;
      case 'bulletList': return `<ul>${kids(n)}</ul>`;
      case 'orderedList': return `<ol>${kids(n)}</ol>`;
      case 'listItem': return `<li>${kids(n)}</li>`;
      case 'taskList': return `<ul>${kids(n)}</ul>`;
      case 'taskItem': return `<li>${attr(n, 'checked') ? '☑' : '☐'} ${kids(n)}</li>`;
      case 'codeBlock': return `<pre><code>${esc((n.content ?? []).map((t) => t.text ?? '').join(''))}</code></pre>`;
      case 'image': { const src = String(attr(n, 'src') ?? ''); return `<p><img src="${esc(src.startsWith('/') ? origin + src : src)}" alt="${esc(String(attr(n, 'alt') ?? ''))}"></p>`; }
      case 'table': return `<table border="1">${kids(n)}</table>`;
      case 'tableRow': return `<tr>${kids(n)}</tr>`;
      case 'tableHeader': return `<th>${kids(n)}</th>`;
      case 'tableCell': return `<td>${kids(n)}</td>`;
      case 'callout': return `<div class="callout"><p><strong>${esc(TONES[String(attr(n, 'tone'))] ?? 'Note')}</strong></p>${kids(n)}</div>`;
      case 'embed': return embedHtml((n.attrs ?? {}) as Partial<EmbedAttrs>, origin);
      case 'quickCheck': {
        const options = (Array.isArray(attr(n, 'options')) ? attr(n, 'options') as string[] : []).filter((o) => o.trim());
        const right = (attr(n, 'options') as string[] | undefined)?.[Number(attr(n, 'answer')) || 0] ?? '';
        const explain = String(attr(n, 'explain') ?? '').trim();
        return `<div class="quick-check"><p><strong>Quick check:</strong> ${esc(String(attr(n, 'question') ?? ''))}</p><ol type="A">${options.map((o) => `<li>${esc(o)}</li>`).join('')}</ol><p><em>Answer:</em> ${esc(right)}${explain ? ` — ${esc(explain)}` : ''}</p></div>`;
      }
      case 'flashcards': {
        const cards = (Array.isArray(attr(n, 'cards')) ? attr(n, 'cards') as { front: string; back: string }[] : []).filter((c) => c.front?.trim());
        const title = String(attr(n, 'title') ?? '').trim();
        return `<div class="flashcards"><p><strong>${esc(title || 'Flashcards')}</strong></p><dl>${cards.map((c) => `<dt>${esc(c.front)}</dt><dd>${esc(c.back ?? '')}</dd>`).join('')}</dl></div>`;
      }
      default: return kids(n);
    }
  }
  return node(doc);
}

function embedHtml(a: Partial<EmbedAttrs>, origin: string) {
  if (a.kind === 'math') return `<p class="math">\\(${esc(a.tex ?? '')}\\)</p>`;
  if (a.kind === 'code') return `<pre><code>${esc(a.code ?? '')}</code></pre>`;
  const href = a.kind && a.src ? embedHref({ kind: a.kind, src: a.src }, origin) : null;
  if (!href) return '';
  const chapters = parseChapters(a.chapters);
  const link = `<p><a href="${esc(href)}">${esc(a.title || (a.kind === 'pdf' ? 'PDF' : 'Video'))}</a></p>`;
  return chapters.length ? `${link}<ul>${chapters.map((c) => `<li>${esc(c.label)} ${esc(c.title)}</li>`).join('')}</ul>` : link;
}

/** A plain-text page as HTML paragraphs. */
export const textToHtml = (text: string) => text.replace(/\r\n?/g, '\n').split(/\n{2,}/).filter((p) => p.trim()).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');

const htmlPage = (title: string, body: string) => `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>\n<h1>${esc(title)}</h1>\n${body}\n</body></html>\n`;

// ── The cartridge ────────────────────────────────────────────────────────────────────────────

function qti(id: string, title: string, description: string | null, questions: CartridgeQuestion[]) {
  const items = questions.map((q, i) => {
    const qid = `${id}_q${i + 1}`;
    const answers = q.options.map((o, j) => ({ id: `${qid}_a${j + 1}`, text: o }));
    const right = answers.find((a) => a.text === q.correct) ?? answers[0];
    return `      <item ident="${qid}" title="${esc(`Question ${i + 1}`)}">
        <itemmetadata><qtimetadata>
          <qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.multiple_choice.v0p1</fieldentry></qtimetadatafield>
          <qtimetadatafield><fieldlabel>cc_weighting</fieldlabel><fieldentry>${q.points}</fieldentry></qtimetadatafield>
        </qtimetadata></itemmetadata>
        <presentation>
          <material><mattext texttype="text/plain">${esc(q.question)}</mattext></material>
          <response_lid ident="response1" rcardinality="Single">
            <render_choice>
${answers.map((a) => `              <response_label ident="${a.id}"><material><mattext texttype="text/plain">${esc(a.text)}</mattext></material></response_label>`).join('\n')}
            </render_choice>
          </response_lid>
        </presentation>
        <resprocessing>
          <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
          <respcondition continue="No"><conditionvar><varequal respident="response1">${right?.id ?? ''}</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>
        </resprocessing>
      </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/profile/cc/ccv1p1/ccv1p1_qtiasiv1p2p1_v1p0.xsd">
  <assessment ident="${id}" title="${esc(title)}">
    <qtimetadata>
      <qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.exam.v0p1</fieldentry></qtimetadatafield>
      <qtimetadatafield><fieldlabel>qmd_assessmenttype</fieldlabel><fieldentry>Examination</fieldentry></qtimetadatafield>
    </qtimetadata>
${description ? `    <rubric><material><mattext texttype="text/plain">${esc(description)}</mattext></material></rubric>\n` : ''}    <section ident="root_section">
${items}
    </section>
  </assessment>
</questestinterop>
`;
}

const weblink = (title: string, url: string) => `<?xml version="1.0" encoding="UTF-8"?>
<webLink xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imswl_v1p1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imswl_v1p1 http://www.imsglobal.org/profile/cc/ccv1p1/ccv1p1_imswl_v1p1.xsd">
  <title>${esc(title)}</title>
  <url href="${esc(url)}" target="_blank"/>
</webLink>
`;

/** The cartridge's files (path → bytes), for zipSync. */
export function buildCartridge(course: CartridgeCourse): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const resources: string[] = [];
  const used = new Set<string>();
  /** A path not taken yet (two items can share a title). */
  const unique = (dir: string, name: string) => {
    const dot = name.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    let path = `${dir}/${name}`;
    for (let n = 2; used.has(path.toLowerCase()); n++) path = `${dir}/${stem}-${n}${ext}`;
    used.add(path.toLowerCase());
    return path;
  };
  let r = 0;
  const modules = course.modules.map((m, mi) => {
    const items = m.items.map((it) => {
      const id = `res_${++r}`;
      if (it.kind === 'PAGE') {
        const path = unique('pages', `${safeName(it.title, 'page')}.html`);
        files[path] = enc.encode(htmlPage(it.title, it.html));
        resources.push(`    <resource identifier="${id}" type="webcontent" href="${esc(path)}">\n      <file href="${esc(path)}"/>\n    </resource>`);
      } else if (it.kind === 'FILE') {
        const path = unique('files', safeName(it.name, 'file'));
        files[path] = it.data;
        resources.push(`    <resource identifier="${id}" type="webcontent" href="${esc(path)}">\n      <file href="${esc(path)}"/>\n    </resource>`);
      } else if (it.kind === 'LINK') {
        const path = `links/${id}.xml`;
        files[path] = enc.encode(weblink(it.title, it.url));
        resources.push(`    <resource identifier="${id}" type="imswl_xmlv1p1">\n      <file href="${path}"/>\n    </resource>`);
      } else {
        const path = `${id}/assessment.xml`;
        files[path] = enc.encode(qti(id, it.title, it.description, it.questions));
        resources.push(`    <resource identifier="${id}" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment">\n      <file href="${path}"/>\n    </resource>`);
      }
      return `          <item identifier="item_${id}" identifierref="${id}">\n            <title>${esc(it.title)}</title>\n          </item>`;
    });
    return `        <item identifier="module_${mi + 1}">\n          <title>${esc(m.title)}</title>\n${items.join('\n')}\n        </item>`;
  });
  files['imsmanifest.xml'] = enc.encode(`<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="cartridge_${safeName(course.code, 'course')}" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1 http://www.imsglobal.org/profile/cc/ccv1p1/ccv1p1_imscp_v1p2_v1p0.xsd http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest http://www.imsglobal.org/profile/cc/ccv1p1/LOM/ccv1p1_lommanifest_v1p0.xsd">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.1.0</schemaversion>
    <lomimscc:lom>
      <lomimscc:general>
        <lomimscc:title><lomimscc:string>${esc(`${course.code} ${course.name}`.trim())}</lomimscc:string></lomimscc:title>
${course.description ? `        <lomimscc:description><lomimscc:string>${esc(course.description)}</lomimscc:string></lomimscc:description>\n` : ''}      </lomimscc:general>
    </lomimscc:lom>
  </metadata>
  <organizations>
    <organization identifier="org_1" structure="rooted-hierarchy">
      <item identifier="LearningModules">
${modules.join('\n')}
      </item>
    </organization>
  </organizations>
  <resources>
${resources.join('\n')}
  </resources>
</manifest>
`);
  return files;
}
