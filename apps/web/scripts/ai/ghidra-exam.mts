// Ghidra's exam (STAGE-5-PLAN.md, "Ghidra, the one AI", step 2): asks every skill's questions
// (src/server/ghidra/exam) and prints the score card. Started by scripts/ai/ghidra-exam.mjs; see there for the commands.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { codeIn, mark, papers, questions, SKILL_IDS, type Ask, type CodeRun } from '../../src/server/ghidra/exam';
import { asGhidra, ghidraAudioText, ghidraJson, ghidraJsonImage, ghidraText } from '../../src/server/ghidra/brain';
import { jsonSchema } from '../../src/server/agents/playbooks';
import { SKILLS, type SkillId } from '../../src/server/ghidra/skills';

const args = process.argv.slice(2);
const opt = (name: string, dflt = '') => { const k = args.indexOf(`--${name}`); return k >= 0 ? args[k + 1] ?? '' : dflt; };
const flag = (name: string) => args.includes(`--${name}`);
const WEB = new URL('../../', import.meta.url).pathname;

const via = opt('via', 'site');
const only = opt('skills') ? (opt('skills').split(',') as SkillId[]) : SKILL_IDS;
const per = Number(opt('per', '0')) || Infinity;
const jobs = Number(opt('jobs', '4')) || 4;
const rescore = opt('rescore');
const out = rescore || opt('out') || join(WEB, 'exam-runs', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'));

if (flag('help') || !['site', 'openai'].includes(via)) {
  console.log(readFileSync(join(WEB, 'scripts/ai/ghidra-exam.mjs'), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n'));
  process.exit(0);
}
const unknown = only.filter((s) => !(s in SKILLS));
if (unknown.length) { console.error(`Not skills: ${unknown.join(', ')}`); process.exit(1); }
if (!rescore && via === 'site' && !process.env.GEMINI_API_KEY) {
  console.error('The website’s brain needs GEMINI_API_KEY in this shell (the owner’s own key; it is never saved). Or use --via openai.');
  process.exit(1);
}

// ——— Asking ———

const url = opt('url').replace(/\/$/, ''), model = opt('model'), key = process.env[opt('key-env', 'OPENAI_API_KEY')] ?? '';
async function openai(ask: Ask, image?: string): Promise<string | null> {
  const rule = ask.schema ? `\nReply with only one JSON object, no other text, matching this JSON Schema: ${JSON.stringify(jsonSchema(ask.schema))}` : '';
  const user = image ? [{ type: 'text', text: ask.prompt }, { type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } }] : ask.prompt;
  const body: Record<string, unknown> = { model, messages: [{ role: 'system', content: asGhidra(ask.system) + rule }, { role: 'user', content: user }], max_tokens: ask.maxTokens ?? 1500, temperature: 0 };
  if (ask.schema) body.response_format = { type: 'json_schema', json_schema: { name: 'answer', schema: jsonSchema(ask.schema) } };
  for (let tryNo = 0; tryNo < 4; tryNo++) {
    const res = await fetch(`${url}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) }).catch(() => null);
    if (res?.ok) { const j = (await res.json()) as { choices?: { message?: { content?: string } }[] }; return j.choices?.[0]?.message?.content ?? null; }
    if (res?.status === 400 && body.response_format) { delete body.response_format; continue; }  // a server without schemas
    await new Promise((d) => setTimeout(d, 2000 * (tryNo + 1)));
  }
  return null;
}

/** The few parts of Playwright used here (it is installed globally, without types in this project). */
interface PlaywrightLike { chromium: { launch(): Promise<{ newPage(o: object): Promise<{ setContent(h: string): Promise<void>; screenshot(): Promise<Buffer>; close(): Promise<void> }>; close(): Promise<void> }> } }
let chrome: { page: (html: string) => Promise<string> } | null = null;
async function picture(html: string) {
  if (!chrome) {
    // The global Playwright (AGENTS.md §5: npm install -g playwright), found the way require finds it.
    const { chromium } = createRequire(import.meta.url)('playwright') as PlaywrightLike;
    const browser = await chromium.launch();
    chrome = { page: async (h) => { const p = await browser.newPage({ viewport: { width: 600, height: 420 } }); await p.setContent(h); const b = await p.screenshot(); await p.close(); return b.toString('base64'); } };
    process.on('exit', () => void browser.close());
  }
  return chrome.page(html);
}
/** The words read aloud by ffmpeg's built-in voice (flite), as a WAV recording; null when this ffmpeg has none. */
function recording(say: string): Uint8Array | null {
  const text = say.replace(/['":\\]/g, ' ');
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `flite=text='${text}':voice=slt`, '-ar', '16000', '-ac', '1', '-f', 'wav', 'pipe:1'], { maxBuffer: 64 << 20 });
  return r.status === 0 && r.stdout.length > 1000 ? new Uint8Array(r.stdout) : null;
}

/** Hyperion's own engine, running each reply's code (scripts/ai/hyperion-lab.mjs run). */
let lab: { run: (code: string) => Promise<Omit<CodeRun, 'code'>> } | null = null;
function hyperion() {
  if (lab) return lab;
  const child = spawn('node', ['scripts/ai/hyperion-lab.mjs', 'run'], { cwd: WEB, stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting = new Map<string, (r: Omit<CodeRun, 'code'>) => void>();
  createInterface({ input: child.stdout! }).on('line', (l) => { const r = JSON.parse(l); waiting.get(r.id)?.(r); waiting.delete(r.id); });
  let n = 0, queue = Promise.resolve();
  process.on('exit', () => child.kill());
  lab = { run: (code) => new Promise((done) => { queue = queue.then(() => new Promise<void>((next) => { const id = String(n++); waiting.set(id, (r) => { done(r); next(); }); child.stdin!.write(JSON.stringify({ id, code }) + '\n'); })); }) };
  return lab;
}

/** One question asked: the reply as the rules see it (text, the parsed object, or how its code ran), and what is kept. */
async function answer(skill: SkillId, ask: Ask): Promise<{ got: unknown; kept: unknown }> {
  if (ask.mode === 'audio') {
    const wav = recording(ask.say!);
    if (!wav) return { got: undefined, kept: 'not asked: this ffmpeg has no voice (flite)' };
    if (via !== 'site') return { got: undefined, kept: 'not asked: needs a model that hears' };
    const t = await ghidraAudioText(skill, wav, 'audio/wav');
    return { got: t, kept: t };
  }
  const image = ask.mode === 'image' ? await picture(ask.html!) : undefined;
  if (via === 'openai') {
    const t = await openai(ask, image);
    if (ask.mode !== 'code') return { got: t, kept: t };
    const code = codeIn(t ?? ''); const run = code ? await hyperion().run(code) : null;
    return { got: t && { code, ...run }, kept: t };
  }
  if (ask.mode === 'json') { const v = await ghidraJson(skill, ask.system, ask.prompt, ask.schema!, ask.maxTokens, ask.lite); return { got: v, kept: v }; }
  if (ask.mode === 'image') { const v = await ghidraJsonImage(skill, ask.system, ask.prompt, { mimeType: 'image/png', data: image! }, ask.schema!, ask.maxTokens); return { got: v, kept: v }; }
  const t = await ghidraText(skill, ask.system, ask.prompt, ask.maxTokens, ask.lite);
  if (ask.mode !== 'code') return { got: t, kept: t };
  const code = codeIn(t ?? ''); const run = code ? await hyperion().run(code) : null;
  return { got: t && { code, ...run }, kept: t };
}

// ——— The run ———

interface Row { skill: SkillId; i: number; failed: string[]; skipped?: string; answer: unknown; run?: unknown }
const all = await papers();
const rows: Row[] = [];
if (rescore) {
  // Saved answers, marked again with today's rules (no model asked). Code answers are run again.
  for (const line of readFileSync(join(out, 'answers.jsonl'), 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line) as Row;
    if (!only.includes(r.skill)) continue;
    const ask = questions(r.skill, all[r.skill])[r.i];
    if (!ask || r.skipped) { rows.push(r); continue; }
    let got = r.answer;
    if (ask.mode === 'code' && typeof r.answer === 'string') { const code = codeIn(r.answer); got = { code, ...(await hyperion().run(code)) }; }
    rows.push({ ...r, failed: mark(ask, got) });
  }
} else {
  mkdirSync(out, { recursive: true });
  const file = join(out, 'answers.jsonl');
  const todo = only.flatMap((skill) => questions(skill, all[skill]).slice(0, per).map((ask, i) => ({ skill, i, ask })));
  let done = 0, next = 0;
  const started = Date.now();
  await Promise.all(Array.from({ length: jobs }, async () => {
    while (next < todo.length) {
      const { skill, i, ask } = todo[next++];
      const { got, kept } = await answer(skill, ask).catch((e) => ({ got: null, kept: `error: ${e instanceof Error ? e.message : e}` }));
      const skipped = got === undefined ? String(kept) : undefined;
      const row: Row = { skill, i, failed: skipped ? [] : mark(ask, got), ...(skipped ? { skipped } : {}), answer: kept, ...(ask.mode === 'code' && got ? { run: got } : {}) };
      rows.push(row);
      appendFileSync(file, JSON.stringify(row) + '\n');
      if (++done % 25 === 0) process.stderr.write(`${done} of ${todo.length} asked (${Math.round((Date.now() - started) / 1000)} s)\n`);
    }
  }));
  writeFileSync(join(out, 'run.json'), JSON.stringify({ via, model: model || null, url: url || null, at: new Date().toISOString(), per: Number.isFinite(per) ? per : null }, null, 2));
}

// ——— The score card ———

const info = existsSync(join(out, 'run.json')) ? JSON.parse(readFileSync(join(out, 'run.json'), 'utf8')) : { via, model };
const lines = [`Ghidra's exam: ${info.at?.slice(0, 10) ?? ''}, answered by ${info.via === 'site' ? 'the website’s brain (Gemini)' : info.model || info.url}${rescore ? ' (marked again)' : ''}`, '',
  `${'skill'.padEnd(16)} ${'passed'.padStart(11)}  score  rules failed most`];
const card: Record<string, { passed: number; asked: number; score: number | null; failed: Record<string, number>; skipped: number }> = {};
let passed = 0, asked = 0;
for (const skill of only) {
  const mine = rows.filter((r) => r.skill === skill), counted = mine.filter((r) => !r.skipped);
  const ok = counted.filter((r) => !r.failed.length).length, why: Record<string, number> = {};
  for (const r of counted) for (const f of r.failed) why[f] = (why[f] ?? 0) + 1;
  card[skill] = { passed: ok, asked: counted.length, score: counted.length ? Math.round((100 * ok) / counted.length) : null, failed: why, skipped: mine.length - counted.length };
  passed += ok; asked += counted.length;
  const top = Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ');
  lines.push(`${skill.padEnd(16)} ${`${ok} / ${counted.length}`.padStart(11)}  ${card[skill].score === null ? ' –  ' : `${String(card[skill].score).padStart(3)}%`}  ${counted.length ? top : (mine[0]?.skipped ?? '')}`);
}
lines.push('', `${'all skills'.padEnd(16)} ${`${passed} / ${asked}`.padStart(11)}  ${asked ? `${String(Math.round((100 * passed) / asked)).padStart(3)}%` : ''}`, '', `Answers and the card: ${out}`);
writeFileSync(join(out, 'card.json'), JSON.stringify(card, null, 2));
writeFileSync(join(out, 'card.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
process.exit(0);
