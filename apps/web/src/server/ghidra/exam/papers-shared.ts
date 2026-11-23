import { SYSTEM as ASK_SYSTEM, SCHEMA as ASK_SCHEMA } from '../../ask';
import { SYSTEM as BRIEF_SYSTEM_DOCS } from '../../doc-ai';
import { AI_SCHEMA as BRIEF_SCHEMA, BRIEF_SYSTEM } from '../../daily-brief';
import { SYSTEM as MEET_SYSTEM, SCHEMA as MEET_SCHEMA } from '../../meeting-notes';
import { CAPTION_SCHEMA, CAPTION_SYSTEM, SCHEMA as TR_SCHEMA, SYSTEM as TR_SYSTEM } from '../../translate';
import { TRANSLATE_BATCH_SCHEMA, uiSystem } from '../../ui-translations';
import { MINDMAP, MINDMAP_SYSTEM, SUMMARY, SUMMARY_SYSTEM, THEMES, THEMES_SYSTEM } from '../../board-ai';
import { SYSTEM as DIAGNOSE_SYSTEM, SCHEMA as DIAGNOSE_SCHEMA } from '../../errors';
import { HEALTH_CHECK_SCHEMA, HEALTH_CHECK_SYSTEM } from '../../owner-health';
import { CHAT_ASK_SYSTEM, CHAT_CATCHUP_SYSTEM, CHAT_REPLIES_SCHEMA, CHAT_REPLIES_SYSTEM, chatRewriteSystem } from '../jobs';
import { has, langOf, markdown, newNumbers, wordCount, type Ask, type Paper, type Rule } from './kit';
import { CHAT_LINES, CITIES, FIRST, PASSAGES } from './material';

type O = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const list = (v: unknown): O[] => (Array.isArray(v) ? v : []) as O[];
const json = (system: string, schema: object, prompt: string, rules: Rule[], maxTokens = 1500, lite = false): Ask => ({ mode: 'json', system, schema, prompt, maxTokens, lite, rules });
const text = (system: string, prompt: string, rules: Rule[], maxTokens = 700, lite = false): Ask => ({ mode: 'text', system, prompt, maxTokens, lite, rules });
const sentences = (t: string) => (t.match(/[^.!?]+[.!?]+/g) ?? [t]).filter((s) => s.trim()).length;

// ——— The assistant: which action a request is ———

type Want = [request: (n: string, city: string) => string, action: string, check?: (a: O, n: string, city: string) => boolean];
const WANTS: Want[] = [
  [() => 'What homework is due this week?', 'my_due'], [() => 'have i got any quizzes coming up', 'my_due'],
  [() => 'How am I doing in Green?', 'my_green'], [() => 'Which trips am I planning?', 'my_trips'], [() => 'What courses am I in?', 'my_courses'],
  [(_, c) => `Plan a 3 day trip to ${c} for 2 people`, 'trip_new', (a, _, c) => has(str(a.place), c) && a.days === 3 && a.travellers === 2],
  [(_, c) => `I want to go to ${c} with 4 friends for a week`, 'trip_new', (a, _, c) => has(str(a.place), c) && a.travellers === 5],
  [(n) => `Tell ${n} I’ll be 10 minutes late`, 'message_draft', (a) => has(str(a.text), '10')],
  [() => 'Write a 5 question quiz on photosynthesis for BIO101', 'quiz_draft', (a) => a.count === 5 && has(str(a.topic), 'photosynthesis')],
  [() => 'Find me sources about carbon pricing', 'research', (a) => has(str(a.topic), 'carbon')],
  [() => 'Write 3 Instagram posts about our beach clean-up', 'social_posts', (a) => a.count === 3 && list(a.platforms).some((p) => /instagram/i.test(String(p)))],
  [() => 'I planted a tree today', 'green_log', (a) => a.kind === 'TREE'], [() => 'cycled to school instead of the bus, about 6 km', 'green_log', (a) => a.kind === 'CYCLE' && a.amount === 6],
  [() => 'We need drinking water for 5 people, it is urgent', 'relief_post', (a) => a.type === 'NEED' && a.kind === 'WATER' && a.people === 5],
  [() => 'I can offer a lift to the shelter with my car', 'relief_post', (a) => a.type === 'OFFER' && a.kind === 'TRANSPORT'],
  [() => 'Check this product code TR-8K2M-41QX', 'trace_check', (a) => has(str(a.code), '8K2M')], [() => 'Open my Green teams', 'open', (a) => a.page === 'green_teams'],
  [() => 'What is 17 times 23?', 'answer', (a) => has(str(a.say), '391')], [() => 'Explain what a black hole is in two sentences', 'answer', (a) => has(str(a.say), 'gravity', 'light')],
  [() => 'Translate "good morning" into Spanish', 'answer', (a) => has(str(a.say), 'buenos días', 'buenos dias')],
  [() => 'my friend collapsed and isn’t breathing what do i do', 'answer', (a) => /112|911|emergency/i.test(str(a.say))],
  [() => 'Write a haiku about rain', 'answer', (a) => wordCount(str(a.say)) >= 6],
];
const assistant: Paper = {
  n: 66,
  ask(r, i) {
    const [make, action, check] = WANTS[i % WANTS.length], n = r.pick(FIRST), c = r.pick(CITIES);
    return json(ASK_SYSTEM, ASK_SCHEMA, make(n, c), [
      ['wrong action', (a: O) => a.action === action],
      ...(check ? [['wrong details', (a: O) => check(a, n, c)]] as Rule[] : []),
      ['nothing said', (a: O) => str(a.say).trim().length > 3],
      ['markdown', (a: O) => !markdown(str(a.say))],
    ], 2000, true);
  },
};

// ——— Messages ———

const REWRITES: [how: string, check: (out: string, input: string) => boolean][] = [
  ['so it sounds polite and formal, for a teacher or an office', () => true], ['so it is shorter and to the point', (o, i) => o.length < i.length],
  ['fixing only spelling, grammar and punctuation', () => true], ['so it sounds warmer and friendlier', () => true],
];
const DRAFTS = ['hey @Lena can u send me the slides from monday, the link was https://docs.example.edu/s1 and i need them befor 5pm', 'i cant come to the meeting at 3, can we move it to thursday? sorry!!',
  'teacher said the essay is 1500 words and due on 12 december, does anyone kno if references count', 'thx for helping with the lab yesterday @Omar, the graph on page 4 was perfect'];
const chat: Paper = {
  n: 60,
  ask(r, i) {
    const lines = r.some(CHAT_LINES, r.int(6, 10)).join('\n');
    switch (i % 4) {
      case 0: return text(CHAT_CATCHUP_SYSTEM, lines, [
        ['not 2–5 bullet points', (a: string) => { const b = a.split('\n').filter((l) => /^\s*-\s/.test(l)).length; return b >= 2 && b <= 5; }],
        ['an invented number', (a: string) => !newNumbers(a, lines).length],
      ], 400);
      case 1: return json(CHAT_REPLIES_SYSTEM, CHAT_REPLIES_SCHEMA, `${lines}\nMe: ok`, [
        ['not 3 replies', (a: O) => list(a.replies).length === 3],
        ['a reply over 12 words', (a: O) => (list(a.replies) as unknown as string[]).every((x) => wordCount(String(x)) <= 13)],
      ], 200, true);
      case 2: {
        const [how, ok] = r.pick(REWRITES), draft = r.pick(DRAFTS);
        const keep = [...(draft.match(/@\w+|https?:\/\/\S+|\d+/g) ?? [])];
        return text(chatRewriteSystem(how), draft, [
          ['lost a name, number or link', (a: string) => keep.every((k) => a.includes(k.replace(/[,.]$/, '')))],
          ['quotes or notes around it', (a: string) => !/^["“]|^(here is|rewritten)/i.test(a.trim())],
          ['didn’t do what was asked', (a: string) => ok(a, draft)],
        ], 400);
      }
      default: {
        const p = r.pick(PASSAGES), [q] = r.pick(p.asks);
        return text(CHAT_ASK_SYSTEM, `Recent chat:\n${lines}\n\nQuestion from ${r.pick(FIRST)}: ${q}`, [
          ['over 150 words', (a: string) => wordCount(a) <= 170],
          ['misses the answer', (a: string) => has(a, ...p.asks.find(([x]) => x === q)![1])],
        ], 500);
      }
    }
  },
};

// ——— Translation ———

const MESSAGES: [text: string, lang: string][] = [
  ['¿Alguien tiene los apuntes de la clase de hoy?', 'es'], ['Merci pour ton aide hier, @Omar 🙏', 'fr'], ['Kannst du mir den Link schicken? https://docs.example.edu/a', 'de'],
  ['कल की परीक्षा 10 बजे है', 'hi'], ['La reunión es el viernes a las 15:00', 'es'], ['On se voit à la bibliothèque à 14h ?', 'fr'], ['Ich habe die Aufgabe 3 fertig 😊', 'de'],
  ['See you tomorrow!', 'en'], ['👍', ''], ['https://docs.example.edu/report', ''],
];
const translate: Paper = {
  n: 60,
  ask(r, i) {
    if (i % 3 === 2) {
      const strings = r.some(['Save', 'Hand in by {0}', 'You have {0} new messages', 'Course settings', 'Join the call · {0} people', 'Mark as done'], 4), to = r.pick(['Spanish', 'French', 'German', 'Hindi']);
      const code = { Spanish: 'es', French: 'fr', German: 'de', Hindi: 'hi' }[to]!;
      return json(uiSystem(to), TRANSLATE_BATCH_SCHEMA, JSON.stringify(strings), [
        ['not one translation per item', (a: O) => list(a.translations).length === strings.length],
        ['lost a placeholder', (a: O) => strings.every((s, k) => !s.includes('{0}') || String(list(a.translations)[k] ?? '').includes('{0}'))],
        ['wrong language', (a: O) => code === 'hi' ? /[ऀ-ॿ]/.test(JSON.stringify(a)) : strings.length < 3 || langOf((list(a.translations) as unknown as string[]).join(' ')) !== 'en'],
      ], 2000);
    }
    if (i % 3 === 1) {
      const lines = r.some(PASSAGES, 2).flatMap((p) => p.text.split('. ').slice(0, 2)).map((t, k) => ({ id: `l${k}`, text: t.toLowerCase() }));
      return json(CAPTION_SYSTEM, CAPTION_SCHEMA, `Target language: Spanish (es).\nLines (JSON):\n${JSON.stringify(lines)}`, [
        ['lines lost', (a: O) => list(a.items).length === lines.length],
        ['not in Spanish', (a: O) => langOf(list(a.items).map((x) => str(x.text)).join(' ')) === 'es'],
      ], 2048, true);
    }
    const msgs = r.some(MESSAGES, r.int(3, 5)).map(([t, lang], k) => ({ id: `m${k}`, text: t, lang }));
    const item = (a: O, id: string) => list(a.items).find((x) => x.id === id);
    return json(TR_SYSTEM, TR_SCHEMA, `Target language: English (en).\nMessages (JSON):\n${JSON.stringify(msgs.map(({ id, text }) => ({ id, text })))}`, [
      ['messages lost', (a: O) => msgs.every((m) => item(a, m.id))],
      ['wrong language detected', (a: O) => msgs.every((m) => !m.lang || str(item(a, m.id)?.lang) === m.lang)],
      ['translated what needed none', (a: O) => msgs.every((m) => (m.lang && m.lang !== 'en') || !str(item(a, m.id)?.text).trim())],
      ['lost a number, link or mention', (a: O) => msgs.every((m) => !m.lang || m.lang === 'en' || (m.text.match(/@\w+|https?:\/\/\S+|\d+/g) ?? []).every((k) => str(item(a, m.id)?.text).includes(k)))],
    ], 4096, true);
  },
};

// ——— Documents ———

const MISTAKES = ['Their going to the libary tomorow to finsh the project, it is due on 4 March.', 'The experment showed that plants grows faster in light, we measured 12 plants over 3 weeks.',
  'I beleive the main reason for the revolution was economic, as prices rose by 40% in two years.', 'Our team have recieved the results and we will present them on Friday at 10.'];
const docs: Paper = {
  n: 60,
  ask(r, i) {
    const p = r.pick(PASSAGES), s = BRIEF_SYSTEM_DOCS;
    const keepNums: Rule = ['changed a number', (a: string) => !newNumbers(a, p.text).length];
    switch (i % 6) {
      case 0: { const t = r.pick(MISTAKES); return text(s.grammar, t, [['changed a number', (a: string) => !newNumbers(a, t).length && [...t.matchAll(/\d+/g)].every((m) => a.includes(m[0]))], ['rewrote it', (a: string) => Math.abs(a.length - t.length) < t.length * 0.25], ['left a mistake', (a: string) => !/libary|tomorow|finsh|experment|beleive|recieved/i.test(a)]], 400, true); }
      case 1: return text(s.shorten, p.text, [['not shorter', (a: string) => a.length <= p.text.length * 0.8], keepNums], 400);
      case 2: return text(s.explain, p.text, [['not 2–5 sentences', (a: string) => sentences(a) >= 2 && sentences(a) <= 6]], 400);
      case 3: return text(s.translate, `Translate into Spanish:\n\n${p.text}`, [['not Spanish', (a: string) => langOf(a) === 'es'], keepNums], 600, true);
      case 4: return text(s.continue, `Document: Notes on ${p.title}\n\nThe writing so far (continue from its end):\n${p.text}`, [['not 2–4 sentences', (a: string) => sentences(a) >= 2 && sentences(a) <= 5], ['repeats the text', (a: string) => !a.includes(p.text.slice(0, 60))]], 400);
      default: return text(s.improve, p.text, [keepNums, ['changed the language', (a: string) => langOf(a) === 'en']], 500);
    }
  },
};

// ——— Boards ———

const NOTES = ['more bike racks', 'cheaper canteen food', 'longer library hours', 'quiet study rooms', 'vegetarian options', 'bike repair day', 'free water fountains', 'extra printers', 'study group board', 'night bus to campus', 'lockers'];
const boards: Paper = {
  n: 60,
  ask(r, i) {
    const notes = r.some(NOTES, r.int(6, 10));
    if (i % 3 === 0) return json(THEMES_SYSTEM, THEMES, `Board: Campus ideas\nNotes:\n${notes.map((n, k) => `${k + 1}. ${n}`).join('\n')}`, [
      ['not 2–6 themes', (a: O) => list(a.themes).length >= 2 && list(a.themes).length <= 6],
      ['a note in no theme or two', (a: O) => { const all = list(a.themes).flatMap((t) => (t.notes as number[]) ?? []); return all.length === notes.length && new Set(all).size === notes.length; }],
    ], 1000, true);
    if (i % 3 === 1) return json(MINDMAP_SYSTEM, MINDMAP, `Topic: ${r.pick(PASSAGES).title}`, [
      ['not 3–6 branches', (a: O) => list(a.branches).length >= 3 && list(a.branches).length <= 6],
      ['more than 4 ideas on a branch', (a: O) => list(a.branches).every((b) => list(b.ideas).length <= 4)],
      ['a label over 4 words', (a: O) => list(a.branches).every((b) => wordCount(str(b.label)) <= 4)],
    ], 1000, true);
    return json(SUMMARY_SYSTEM, SUMMARY, `Board: Group project\nText on the board:\n${notes.join('\n')}`, [
      ['not 2–4 sentences', (a: O) => sentences(str(a.summary)) >= 2 && sentences(str(a.summary)) <= 5],
      ['more than 5 next steps', (a: O) => list(a.nextSteps).length <= 5],
    ], 800, true);
  },
};

// ——— Meetings and the morning brief ———

const meetings: Paper = {
  n: 50,
  ask(r) {
    const [a, b] = r.some(FIRST, 2), topic = r.pick(['the science fair stand', 'the history poster', 'the recycling survey']);
    const lines = [[0, a, 'hi everyone can you hear me'], [12, b, `ok so today we plan ${topic}`], [40, a, 'I think we should split it in two parts'],
      [75, b, 'agreed, we will use the blue template'], [110, a, `${b} can you send the slides by Friday`], [130, b, 'yes I will send them by Friday'],
      [160, a, 'and I will book the room for next Monday'], [200, b, 'great, that is all for today']] as const;
    const ts = new Set<number>(lines.map((l) => l[0]));
    const prompt = `Call: Project call\nToday: 2026-11-23\nLength: 3:40\n\nTranscript (seconds · speaker · words):\n${lines.map(([t, w, x]) => `${t} · ${w} · ${x}`).join('\n')}`;
    const acts = (o: O) => list(o.actions);
    return json(MEET_SYSTEM, MEET_SCHEMA, prompt, [
      ['missed who sends the slides', (o: O) => acts(o).some((x) => has(str(x.text), 'slide') && has(str(x.who), b))],
      ['wrong due date for Friday', (o: O) => acts(o).some((x) => has(str(x.text), 'slide') && x.due === '2026-11-27')],
      ['missed the decision', (o: O) => list(o.decisions).length >= 1],
      ['a chapter time not in the call', (o: O) => list(o.chapters).every((c) => ts.has(Number(c.t)))],
      ['title over 8 words', (o: O) => wordCount(str(o.title)) <= 8],
    ], 3000);
  },
};

const dailyBrief: Paper = {
  n: 50,
  ask(r, i) {
    const p = r.pick(PASSAGES), lines = r.some(CHAT_LINES, i % 3 === 0 ? 0 : 6);
    const prompt = [`Today is 2026-11-${String(r.int(10, 28))}.`, `Classes today:\n- 09:00–10:30 ${p.code} ${p.course} (lecture) in Room ${r.int(100, 300)}`,
      `Due soon:\n- Assignment: ${p.title} essay (${p.code}), due Thu 17:00`, `Chats waiting for their reply:\n- ${r.pick(FIRST)}: "can you check my draft?"`,
      lines.length ? `Recent messages in their group chats and channels (oldest first):\n${lines.map((l) => `[Group project] ${l}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
    return json(BRIEF_SYSTEM, BRIEF_SCHEMA, prompt, [
      ['summary not 2–3 sentences', (a: O) => sentences(str(a.summary)) >= 2 && sentences(str(a.summary)) <= 3],
      ['a greeting', (a: O) => !/good (morning|afternoon)/i.test(str(a.summary))],
      ['more than 5 tasks or a long title', (a: O) => list(a.tasks).length <= 5 && list(a.tasks).every((t) => str(t.title).length < 70)],
      ['a decision that wasn’t made', (a: O) => lines.length > 0 || list(a.decisions).length === 0],
      ['an invented number', (a: O) => !newNumbers(words3(a), prompt, 2).length],
    ], 900);
  },
};
const words3 = (a: O) => `${str(a.summary)} ${list(a.tasks).map((t) => `${str(t.title)} ${str(t.why)}`).join(' ')}`;

// ——— Voice: recordings read aloud by the runner, then written down ———

/** How far a transcript is from what was said: the share of words that differ (word error rate, roughly). */
export function wordError(said: string, heard: string) {
  const w = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const a = w(said), b = w(heard), d = Array.from({ length: a.length + 1 }, (_, k) => [k, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let k = 1; k <= a.length; k++) for (let j = 1; j <= b.length; j++) d[k][j] = Math.min(d[k - 1][j] + 1, d[k][j - 1] + 1, d[k - 1][j - 1] + (a[k - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length] / Math.max(1, a.length);
}
const FEEDBACK = ['Good work on the introduction, your argument is clear. Next time add more evidence in the second part.', 'You explained the method well. Check your units in question three and label every graph.',
  'This is a thoughtful essay. Try to link each paragraph back to the question and cut repetition.', 'Your code works and is well organised. Add comments and test the empty list case.'];
const spoken = (bank: string[]): Paper => ({
  n: 50,
  ask(r) {
    const parts = r.pick(PASSAGES).text.split(/(?<=\.)\s+/), from = r.int(0, parts.length - 1);
    const say = r.chance(0.5) ? `${r.pick(FIRST)}, ${r.pick(bank)}` : parts.slice(from, from + r.int(1, 2)).join(' ');
    return { mode: 'audio', system: '', prompt: '', say, rules: [['too many words wrong', (a: string) => wordError(say, a) <= 0.25]] };
  },
});

// ——— The owner console ———

const ERRORS: [message: string, stack: string, fix: string[]][] = [
  ["TypeError: Cannot read properties of undefined (reading 'map')", 'at CourseList (src/components/course/CourseList.tsx:42:18)', ['undefined', 'check', 'guard', 'optional', 'empty']],
  ['D1_ERROR: too many SQL variables at offset 412', 'at prisma.user.findMany (src/server/people.ts:88)', ['chunk', 'batch', 'split', '100', 'fewer']],
  ['ChunkLoadError: Loading chunk 4821 failed.', 'at __webpack_require__.f.j (webpack/runtime)', ['deploy', 'reload', 'cache', 'refresh', 'old']],
  ['Error: Hydration failed because the server rendered HTML didn’t match the client.', 'at throwOnHydrationMismatch (react-dom)', ['date', 'server', 'client', 'random', 'effect']],
  ['Error: Worker exceeded CPU time limit.', 'at handleRequest (cloudflare/worker.ts)', ['cpu', 'slow', 'loop', 'split', 'cache', 'heavy']],
  ['FirebaseError: auth/network-request-failed', 'at signInWithPopup (firebase/auth)', ['network', 'connection', 'retry', 'offline']],
];
const diagnose: Paper = {
  n: 50,
  ask(r) {
    const [message, stack, fix] = r.pick(ERRORS);
    const prompt = [`Source: ${r.pick(['browser', 'server'])} (error)`, `Where: ${r.pick(['/student', '/teacher/courses', '/trace', '/relief'])}`, `Happened ${r.int(1, 90)} time(s) to about ${r.int(1, 20)} user(s), first 2026-11-20T08:00:00.000Z, last 2026-11-23T09:30:00.000Z`, `Message: ${message}`, `Stack:\n${stack}`].join('\n');
    return json(DIAGNOSE_SYSTEM, DIAGNOSE_SCHEMA, prompt, [
      ['no clear fix', (a: O) => str(a.fix).length >= 20 && has(`${str(a.cause)} ${str(a.fix)}`, ...fix)],
      ['summary too long', (a: O) => wordCount(str(a.summary)) <= 60],
    ], 800, true);
  },
};

const FINDINGS = [{ severity: 'high', area: 'Security', title: 'SESSION_SECRET is shorter than 32 characters', detail: 'Tickets and links can be forged.', fix: 'Set a 32+ character secret.' },
  { severity: 'medium', area: 'Email', title: 'Email sending failed 4 times today', detail: 'Resend returned 429.', fix: 'Check the email quota.' },
  { severity: 'low', area: 'Accounts', title: '12 accounts never finished sign-up', detail: 'They started but did not confirm.', fix: 'Nothing to do.' },
  { severity: 'high', area: 'Errors', title: 'A page error happened 230 times', detail: 'TypeError on /student.', fix: 'Fix the error.' }];
const health: Paper = {
  n: 50,
  ask(r) {
    const findings = r.some(FINDINGS, r.int(1, 4)), high = findings.some((f) => f.severity === 'high');
    return json(HEALTH_CHECK_SYSTEM, HEALTH_CHECK_SCHEMA, JSON.stringify({ findings, passed: ['Backups', 'Security headers'], numbers: { users: r.int(8, 600), activeWeek: r.int(1, 80) }, openErrors: [] }), [
      ['score outside 0–100', (a: O) => Number(a.score) >= 0 && Number(a.score) <= 100],
      ['a high finding but a healthy score', (a: O) => !high || Number(a.score) < 85],
      ['lost a finding', (a: O) => list(a.findings).length >= findings.length - 1 && list(a.findings).length <= findings.length + 3],
      ['summary not 2–3 sentences', (a: O) => sentences(str(a.summary)) >= 2 && sentences(str(a.summary)) <= 4],
    ], 1500);
  },
};

export const SHARED_PAPERS = { assistant, chat, translate, docs, boards, meetings, 'daily-brief': dailyBrief, transcribe: spoken(FEEDBACK.concat(CHAT_LINES.filter((l) => !l.includes('http')).map((l) => l.split(': ')[1]))), feedback: spoken(FEEDBACK), diagnose, health };
