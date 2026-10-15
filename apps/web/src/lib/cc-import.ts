import type { CartridgeQuestion } from './cc-export';
import { find, findAll, kid, kids, parseXml, textOf, type XmlNode } from './xml-lite';
import { youtubeId } from './app-links';

// Reading an IMS Common Cartridge (.imscc, any version: Canvas, Moodle, Blackboard, Brightspace and
// Schoology export them) into a plan of modules (Stage 5 · B2). The cartridge's folders become
// modules; HTML pages become pages, other files course files, web links links (YouTube: videos),
// discussion topics and assignments pages with their text, and QTI quizzes draft quizzes (their
// multiple-choice and true/false questions). External tools (LTI) and other question types are
// listed as not imported. Pure: the browser unzips (fflate), turns pages into the editor's JSON and
// sends the plan in batches (POST /api/courses/:id/import).

export type ImportItem =
  | { kind: 'PAGE'; title: string; html: string; path: string }
  | { kind: 'LINK' | 'VIDEO'; title: string; url: string }
  | { kind: 'FILE'; title: string; path: string }
  | { kind: 'QUIZ'; title: string; description: string | null; questions: CartridgeQuestion[] };
export interface ImportModule { title: string; items: ImportItem[] }
export interface ImportPlan { title: string; modules: ImportModule[]; skipped: { title: string; why: string }[] }

const dec = new TextDecoder();
const MAX_MODULES = 100, MAX_ITEMS = 2000;

/** A path inside the cartridge: "./a/../b c.html" and "b%20c.html" both "b c.html". */
export function cleanPath(path: string, base = ''): string {
  let p = path.trim().replace(/\\/g, '/');
  try { p = decodeURIComponent(p); } catch { /* keep it */ }
  p = p.split(/[?#]/)[0];
  const out: string[] = [];
  for (const part of `${base}/${p}`.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop(); else out.push(part);
  }
  return out.join('/');
}

/** Text from HTML (for questions and answers): tags dropped, entities read. */
export function htmlText(html: string): string {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol|h[1-6]|tr|td|th|table|blockquote|pre)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

const mattext = (n: XmlNode | undefined) => {
  const m = find(n, 'mattext');
  const raw = m ? m.text || textOf(m) : '';
  return (m?.attrs.texttype ?? '').includes('html') || /<\w+[^>]*>/.test(raw) ? htmlText(raw) : raw.replace(/\s+/g, ' ').trim();
};

/** A QTI 1.2 assessment's multiple-choice and true/false questions; how many others were left out. */
export function readQti(xml: string): { title: string; description: string | null; questions: CartridgeQuestion[]; skipped: number } {
  const root = parseXml(xml);
  const assessment = root.name === 'assessment' ? root : find(root, 'assessment');
  const questions: CartridgeQuestion[] = [];
  let skipped = 0;
  for (const item of findAll(assessment ?? root, 'item')) {
    const fields = findAll(item, 'qtimetadatafield');
    const profile = textOf(find(fields.find((f) => textOf(kid(f, 'fieldlabel')) === 'cc_profile'), 'fieldentry'));
    const weight = Number(textOf(find(fields.find((f) => ['cc_weighting', 'points_possible'].includes(textOf(kid(f, 'fieldlabel')))), 'fieldentry')));
    const lid = find(item, 'response_lid');
    const single = !lid || (lid.attrs.rcardinality ?? 'Single') === 'Single';
    const typed = /multiple_choice|true_false/.test(profile) || (!profile && single);
    const labels = lid ? findAll(lid, 'response_label') : [];
    if (!typed || !single || labels.length < 2) { skipped++; continue; }
    const options = labels.map((l) => mattext(l).slice(0, 300));
    // The right answer: the label a condition gives the top score (or any score) to.
    const conds = findAll(item, 'respcondition');
    const scoreOf = (c: XmlNode) => { const v = findAll(c, 'setvar').find((s) => (s.attrs.action ?? 'Set') !== 'Subtract'); return v ? Number(textOf(v)) : 0; };
    const best = conds.filter((c) => scoreOf(c) > 0).sort((a, b) => scoreOf(b) - scoreOf(a))[0];
    const rightId = best ? textOf(find(best, 'varequal')) : '';
    const right = labels.findIndex((l) => l.attrs.ident === rightId);
    const question = mattext(kid(item, 'presentation') ?? item).slice(0, 2000);
    if (!question || right < 0 || new Set(options).size !== options.length || options.some((o) => !o)) { skipped++; continue; }
    questions.push({ question, options, correct: options[right], points: weight > 0 && weight <= 1000 ? weight : 1 });
  }
  const rubric = find(assessment, 'rubric');
  return { title: assessment?.attrs.title ?? '', description: rubric ? mattext(rubric) || null : null, questions: questions.slice(0, 200), skipped: skipped + Math.max(0, questions.length - 200) };
}

interface Resource { type: string; href: string | null; files: string[] }

/** The plan for a cartridge, from its files (path → bytes, as fflate unzips them). */
export function readCartridge(files: Record<string, Uint8Array>): ImportPlan {
  const byPath = new Map(Object.entries(files).map(([k, v]) => [cleanPath(k).toLowerCase(), v]));
  const read = (path: string) => { const f = byPath.get(path.toLowerCase()); return f ? dec.decode(f) : null; };
  const manifestText = read('imsmanifest.xml');
  if (!manifestText) throw new Error('This isn’t a Common Cartridge: there’s no imsmanifest.xml in it.');
  const manifest = parseXml(manifestText);
  if (manifest.name !== 'manifest') throw new Error('This cartridge’s manifest couldn’t be read.');
  const title = textOf(find(find(find(kid(manifest, 'metadata'), 'general'), 'title'), 'string')) || textOf(find(find(kid(manifest, 'metadata'), 'title'), 'string'));

  const resources = new Map<string, Resource>();
  for (const r of findAll(kid(manifest, 'resources'), 'resource')) {
    const base = r.attrs.base ?? '';
    const filesIn = kids(r, 'file').map((f) => cleanPath(f.attrs.href ?? '', base)).filter(Boolean);
    resources.set(r.attrs.identifier ?? '', { type: (r.attrs.type ?? '').toLowerCase(), href: r.attrs.href ? cleanPath(r.attrs.href, base) : filesIn[0] ?? null, files: filesIn });
  }

  const skipped: ImportPlan['skipped'] = [];
  let count = 0;
  const itemFor = (resId: string, label: string): ImportItem | null => {
    const r = resources.get(resId);
    if (!r) { skipped.push({ title: label, why: 'missing from the cartridge' }); return null; }
    const main = r.href ?? r.files[0] ?? '';
    const xml = () => { const t = read(main); if (!t) throw new Error('missing'); return parseXml(t); };
    try {
      if (r.type.startsWith('imswl_')) {
        const link = xml();
        const url = (find(link, 'url')?.attrs.href ?? '').trim();
        if (!/^https?:\/\//i.test(url)) { skipped.push({ title: label, why: 'a link that isn’t a web address' }); return null; }
        return { kind: youtubeId(url) ? 'VIDEO' : 'LINK', title: label || textOf(kid(link, 'title')) || url, url: url.slice(0, 1000) };
      }
      if (r.type.startsWith('imsdt_')) {
        const topic = xml();
        const text = kid(topic, 'text');
        return { kind: 'PAGE', title: label || textOf(kid(topic, 'title')) || 'Discussion', html: `<p><strong>Discussion topic</strong></p>${text?.text || textOf(text)}`, path: main };
      }
      if (r.type.includes('assessment') || r.type.startsWith('imsqti')) {
        const t = read(main) ?? read(r.files.find((f) => f.endsWith('.xml')) ?? '');
        if (!t) throw new Error('missing');
        const q = readQti(t);
        if (q.skipped) skipped.push({ title: label || q.title, why: `${q.skipped} question${q.skipped === 1 ? '' : 's'} of a kind that isn’t multiple choice` });
        if (!q.questions.length) { skipped.push({ title: label || q.title, why: 'a quiz with no multiple-choice questions' }); return null; }
        return { kind: 'QUIZ', title: label || q.title || 'Quiz', description: q.description, questions: q.questions };
      }
      if (r.type.startsWith('assignment_')) {
        const a = xml();
        const text = kid(a, 'text') ?? kid(a, 'instructor_text');
        return { kind: 'PAGE', title: label || textOf(kid(a, 'title')) || 'Assignment', html: `<p><strong>Assignment</strong></p>${text?.text || textOf(text)}`, path: main };
      }
      if (r.type.startsWith('imsbasiclti') || r.type.includes('lti')) { skipped.push({ title: label, why: 'an external tool (LTI): add it again here' }); return null; }
      if (r.type === 'webcontent' || r.type.startsWith('associatedcontent')) {
        if (!main || !byPath.has(main.toLowerCase())) { skipped.push({ title: label, why: 'missing from the cartridge' }); return null; }
        if (/\.x?html?$/i.test(main)) return { kind: 'PAGE', title: label || main.split('/').pop()!.replace(/\.\w+$/, ''), html: read(main) ?? '', path: main };
        return { kind: 'FILE', title: label || main.split('/').pop()!, path: main };
      }
    } catch {
      skipped.push({ title: label, why: 'missing from the cartridge' });
      return null;
    }
    skipped.push({ title: label, why: `a kind of content this app doesn’t take (${r.type || 'unknown'})` });
    return null;
  };

  const modules: ImportModule[] = [];
  const loose: ImportItem[] = [];
  const add = (into: ImportItem[], it: XmlNode) => {
    if (++count > MAX_ITEMS) return;
    const made = itemFor(it.attrs.identifierref ?? '', textOf(kid(it, 'title')).slice(0, 200));
    if (made) into.push(made);
  };
  /** A folder: its own items make a module; folders inside become modules of their own after it. */
  const folder = (node: XmlNode, name: string) => {
    const mine: ImportModule = { title: name.slice(0, 140) || 'Module', items: [] };
    const after: XmlNode[] = [];
    for (const it of kids(node, 'item')) {
      if (it.attrs.identifierref) add(mine.items, it);
      else after.push(it);
    }
    if (mine.items.length) modules.push(mine);
    for (const sub of after) folder(sub, `${name ? `${name}: ` : ''}${textOf(kid(sub, 'title'))}`);
  };
  const org = kid(kid(manifest, 'organizations'), 'organization');
  let top = kids(org, 'item');
  // The usual single wrapper ("LearningModules", no title or link of its own).
  while (top.length === 1 && !top[0].attrs.identifierref && !textOf(kid(top[0], 'title'))) top = kids(top[0], 'item');
  for (const it of top) {
    if (it.attrs.identifierref) add(loose, it);
    else folder(it, textOf(kid(it, 'title')));
  }
  if (loose.length) modules.unshift({ title: (title || 'Course content').slice(0, 140), items: loose });
  // No organization at all: the pages, links and quizzes in the order the cartridge lists them.
  if (!org || !modules.length) {
    const items: ImportItem[] = [];
    for (const [id, r] of resources) {
      if (r.type === 'webcontent' && !/\.x?html?$/i.test(r.href ?? '')) continue;
      if (++count > MAX_ITEMS) break;
      const made = itemFor(id, '');
      if (made) items.push(made);
    }
    if (items.length) modules.push({ title: (title || 'Course content').slice(0, 140), items });
  }
  if (count > MAX_ITEMS) skipped.push({ title: `${count - MAX_ITEMS} more items`, why: `a cartridge can bring up to ${MAX_ITEMS} items at a time` });
  if (modules.length > MAX_MODULES) skipped.push({ title: `${modules.length - MAX_MODULES} more modules`, why: `a cartridge can bring up to ${MAX_MODULES} modules at a time` });
  return { title, modules: modules.slice(0, MAX_MODULES), skipped };
}

/**
 * Where a picture a page uses may be inside the cartridge (src → paths to try in turn): next to the
 * page, or for "$IMS-CC-FILEBASE$/x.png" also at the top and in web_resources (Canvas puts them there).
 */
export function pictureFiles(src: string, pagePath: string): string[] {
  const s = src.trim();
  if (!s || /^(https?:|data:|\/\/|\/)/i.test(s)) return [];
  const dir = pagePath.split('/').slice(0, -1).join('/');
  const local = s.replace(/^\$IMS[-_]CC[-_]FILEBASE\$\/?/i, '');
  if (local === s) return [cleanPath(s, dir)];
  return [...new Set([cleanPath(local, dir), cleanPath(local), cleanPath(local, 'web_resources')])];
}

// ── Sending a plan (POST /api/courses/:id/import, src/server/course-cartridge.ts) ────────────

/** One item as sent: pages already the editor's JSON, files already uploaded here. */
export type ImportBatchItem =
  | { kind: 'PAGE'; title: string; body: string }
  | { kind: 'LINK' | 'VIDEO'; title: string; url: string }
  | { kind: 'FILE'; title: string; url: string; fileName: string; size: string | null }
  | { kind: 'QUIZ'; title: string; description: string | null; questions: CartridgeQuestion[] };

/** What one request may carry: Workers Free has 50 database queries and little CPU per request. */
export const IMPORT_BATCH = { items: 20, cost: 24, chars: 250_000, questions: 200 } as const;
/** Database queries an item takes (pages and links share a few at the end). */
export const importCost = (it: ImportBatchItem) => (it.kind === 'FILE' ? 1 : it.kind === 'QUIZ' ? 1 + Math.ceil(it.questions.length / 12) : 0);

/** Items in requests that fit (in order; a big page or quiz alone in its own). */
export function importBatches(items: ImportBatchItem[]): ImportBatchItem[][] {
  const out: ImportBatchItem[][] = [];
  let cur: ImportBatchItem[] = [], cost = 0, chars = 0;
  for (const it of items) {
    const c = importCost(it), n = JSON.stringify(it).length;
    if (cur.length && (cur.length >= IMPORT_BATCH.items || cost + c > IMPORT_BATCH.cost || chars + n > IMPORT_BATCH.chars)) { out.push(cur); cur = []; cost = 0; chars = 0; }
    cur.push(it); cost += c; chars += n;
  }
  if (cur.length) out.push(cur);
  return out;
}
