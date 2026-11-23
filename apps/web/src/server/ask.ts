import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { ASK_PAGES, cleanPlan, localPlan, looksMultiStep, type AskPlan, type AskTurn, type ShowItem } from '@/lib/ask';
import { taughtBy } from '@/lib/course-access';
import { GREEN_FACTORS, GREEN_KINDS, streak } from '@/lib/green';
import { RELIEF_KINDS } from '@/lib/relief';
import { MATH_RULE } from '@/lib/tutor-rules';
import { guard, guardReply, UNTRUSTED_RULE } from '@/lib/ghidra-guard';
import { spendAi } from './ai-budget';
import { BadRequestException } from './http';
import { featureOff } from './moderation';
import { geminiJson } from './gemini';
import { isHard, thinkHardText } from './ghidra-think';
import { askChain } from './ghidra-chain';
import { research } from './agents/research';
import { socialPosts } from './agents/social';
import { support } from './agents/support';
import { planTrip } from './agents/travel';
import { short } from './trace';
import type { Body } from './body';

// POST /ask { text, history? }: Ghidra, the assistant (M422; "Ask UniVerse", M30, until then; src/lib/ask.ts).
// The request becomes ONE proposed action the person confirms in the chat; this route never changes anything
// itself. 'my_due', 'my_green', 'my_trips' and 'my_courses' only read the asker's own data and come back as a list
// ('show'). AI goes through
// the daily allowance (spendAi) and the owner's switch (featureOff('ai')); without it, or when it fails, the simple
// matcher answers. Every field AI returns is checked again (cleanPlan). The last few turns come along so follow-ups
// work; they are the person's own words and Ghidra's replies, cut short, and only shape this one answer.

const SYSTEM = [
  'You are Ghidra, the assistant of UniVerse Impact: one account with several apps: UniVersity (school), Trace (product',
  'passports), Relief (needs and offers of help on a map), Green (climate actions), Travel (places, guides and trips) and Games.',
  'Turn the person\'s latest request into exactly one action. Earlier turns are only context for follow-ups. Actions:',
  '- my_due: they ask what schoolwork is due, coming up or still to hand in (their assignments and quizzes).',
  '- my_green: they ask how they are doing in Green (CO2 saved, streak, actions).',
  '- my_trips: they ask which trips they have or are planning in Travel.',
  '- my_courses: they ask which courses they are in or teach.',
  '- trip_new: they want to plan a trip. The Travel Planner makes it. name is short, like "Trip to Jaipur"; place: the city or region; days: how many days if said; startDate YYYY-MM-DD only if they said when (assume the next such date); travellers is how many people.',
  '- product_help: they ask a question about a product and give its Trace code (code; question: their question without the code). Customer Support answers from its passport.',
  '- quiz_draft: a teacher wants a quiz written. topic is what it is about; count how many questions (default 5); course the course code or name if they said one.',
  '- research: they want information on a topic with sources (topic: the subject in a few words). The Research Assistant finds sources and cites them.',
  '- social_posts: they want social media posts or captions written (topic: what about; platforms: any of Instagram, LinkedIn, X, Facebook, WhatsApp; count: how many). The Social Media Manager drafts them.',
  '- message_draft: they want to tell or message someone. text is the message itself, written as they would send it, in their language; never claim it was sent (they choose the chat and press Send).',
  `- green_log: they did a climate action. kind is one of ${GREEN_KINDS.map((k) => `${k} (${GREEN_FACTORS[k].units})`).join(', ')}; amount is how many of that unit.`,
  `- relief_post: they need help (type NEED) or offer it (type OFFER). kind is one of ${RELIEF_KINDS.join(', ')}; title is a short line in their words; people is how many people; urgency LOW, MEDIUM, HIGH or CRITICAL.`,
  '- trace_check: they gave a product code to check.',
  `- open: they want a page. page is one of ${Object.keys(ASK_PAGES).join(', ')}.`,
  '- answer: anything else, on any topic, like a general-purpose assistant: answer it fully and helpfully in "say" (explain, write, translate, plan, solve step by step, code in fenced blocks). Never invent their own data, marks or dates. Keep it suitable for students; refuse harmful requests kindly.',
  'If someone is in danger, answer that UniVerse is not an emergency service and they should call the local emergency number first (112 in Europe and India, 911 in North America), and offer relief_post.',
  UNTRUSTED_RULE,
  'Always fill "say": for an action, one plain sentence telling them what will happen; for an answer, the whole answer in plain text (lists as lines starting with "- ", no ** or # marks). Be warm.',
  MATH_RULE,
].join('\n');

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    action: { type: 'STRING', enum: ['my_due', 'my_green', 'my_trips', 'my_courses', 'trip_new', 'message_draft', 'quiz_draft', 'research', 'social_posts', 'product_help', 'green_log', 'relief_post', 'trace_check', 'open', 'answer'] },
    say: { type: 'STRING' }, kind: { type: 'STRING' }, amount: { type: 'NUMBER' }, note: { type: 'STRING' },
    type: { type: 'STRING' }, title: { type: 'STRING' }, people: { type: 'NUMBER' }, urgency: { type: 'STRING' },
    code: { type: 'STRING' }, page: { type: 'STRING' }, name: { type: 'STRING' }, startDate: { type: 'STRING' }, travellers: { type: 'NUMBER' }, text: { type: 'STRING' }, topic: { type: 'STRING' }, count: { type: 'NUMBER' }, course: { type: 'STRING' }, platforms: { type: 'ARRAY', items: { type: 'STRING' } }, place: { type: 'STRING' }, days: { type: 'NUMBER' }, question: { type: 'STRING' },
  },
  required: ['action', 'say'],
};

const DAY = 86_400_000;
const isStaff = (role: string) => role === 'TEACHER' || role === 'ADMIN';
const home = (role: string) => (role === 'ADMIN' ? '/admin' : role === 'TEACHER' ? '/teacher' : '/student');
const when = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** The last few turns of the chat, checked: who said it and their words, cut short. */
export function cleanHistory(raw: unknown): AskTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-6).flatMap((t): AskTurn[] => {
    const r = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
    const text = short(r.text, 400);
    return (r.who === 'me' || r.who === 'ghidra') && text ? [{ who: r.who, text }] : [];
  });
}

/** What's due in the next two weeks: a student's own unfinished work, or a teacher's courses' deadlines. Three queries. */
async function myDue(u: SessionUser): Promise<AskPlan> {
  const now = new Date(), until = new Date(now.getTime() + 14 * DAY), staff = isStaff(u.role);
  const courses = staff
    ? await prisma.course.findMany({ where: taughtBy(u.id), select: { id: true, code: true }, take: 60 })
    : (await prisma.enrollment.findMany({ where: { studentId: u.id }, select: { course: { select: { id: true, code: true } } }, take: 60 })).map((e) => e.course);
  if (!courses.length) return { action: 'show', say: staff ? 'You don’t teach a course yet. Choose New course to start one.' : 'You’re not in a course yet. Open the invite link your teacher shares to join one.', items: [] };
  const ids = courses.map((c) => c.id), code = new Map(courses.map((c) => [c.id, c.code]));
  const mine = staff ? {} : { submissions: { none: { studentId: u.id } } };
  const [work, quizzes] = await Promise.all([
    prisma.assignment.findMany({ where: { courseId: { in: ids }, status: 'OPEN', dueDate: { gte: now, lte: until }, ...mine }, orderBy: { dueDate: 'asc' }, take: 8, select: { title: true, dueDate: true, courseId: true } }),
    prisma.quiz.findMany({ where: { courseId: { in: ids }, status: 'PUBLISHED', dueDate: { gte: now, lte: until }, ...mine }, orderBy: { dueDate: 'asc' }, take: 8, select: { title: true, dueDate: true, courseId: true } }),
  ]);
  const base = home(u.role);
  const items: (ShowItem & { at: number })[] = [
    ...work.map((a) => ({ title: a.title, sub: `${code.get(a.courseId) ?? ''} · due ${when(a.dueDate!)}`, href: `${base}/assignments`, at: a.dueDate!.getTime() })),
    ...quizzes.map((q) => ({ title: `Quiz: ${q.title}`, sub: `${code.get(q.courseId) ?? ''} · due ${when(q.dueDate!)}`, href: `${base}/quizzes`, at: q.dueDate!.getTime() })),
  ].sort((a, b) => a.at - b.at).slice(0, 8);
  const say = !items.length ? (staff ? 'Nothing in your courses is due in the next two weeks.' : 'Nothing is due in the next two weeks. Well done!')
    : staff ? `${items.length} deadline${items.length === 1 ? '' : 's'} in your courses in the next two weeks:` : `You have ${items.length} thing${items.length === 1 ? '' : 's'} to finish in the next two weeks:`;
  return { action: 'show', say, items: items.map((i) => ({ title: i.title, sub: i.sub, href: i.href })) };
}

/** Their Green numbers: CO₂ saved in all and this week, actions, the streak. One query. */
async function myGreen(u: SessionUser): Promise<AskPlan> {
  const now = Date.now();
  const rows = await prisma.greenAction.findMany({ where: { userId: u.id }, select: { co2Kg: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 5000 });
  if (!rows.length) return { action: 'show', say: 'You haven’t logged a climate action yet. Tell me one, like “I cycled 5 km”, and I’ll log it.', items: [] };
  const kg = rows.reduce((s, r) => s + r.co2Kg, 0), week = rows.filter((r) => r.createdAt.getTime() >= now - 7 * DAY).reduce((s, r) => s + r.co2Kg, 0);
  const days = streak(rows.map((r) => r.createdAt.toISOString().slice(0, 10)), new Date(now).toISOString().slice(0, 10));
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    action: 'show',
    say: days ? `Nice work: a ${days}-day streak, and ${r1(kg)} kg of CO₂ saved in all.` : `You’ve saved ${r1(kg)} kg of CO₂ in all. Log an action today to start a streak.`,
    items: [
      { title: `${r1(kg)} kg CO₂ saved`, sub: `${rows.length} action${rows.length === 1 ? '' : 's'} in all`, href: '/student/life/green' },
      { title: `${r1(week)} kg this week`, sub: 'the last 7 days', href: '/student/life/green' },
      { title: days ? `${days}-day streak` : 'No streak yet', sub: days ? 'log one today to keep it' : 'log one today to start it', href: '/student/life/green' },
    ],
  };
}

/** M424: their trips in Travel, newest first, with their cities and dates. One query. */
async function myTrips(u: SessionUser): Promise<AskPlan> {
  const rows = await prisma.travelTripMember.findMany({
    where: { userId: u.id }, take: 20,
    select: { trip: { select: { id: true, name: true, startDate: true, updatedAt: true, stops: { select: { name: true, days: true }, orderBy: { position: 'asc' } } } } },
  });
  if (!rows.length) return { action: 'show', say: 'You have no trips yet. Tell me where you’d like to go, like “Plan a trip to Jaipur for 3 of us”.', items: [] };
  const trips = rows.map((r) => r.trip).sort((a, b) => +b.updatedAt - +a.updatedAt).slice(0, 8);
  return {
    action: 'show', say: `You have ${rows.length} trip${rows.length === 1 ? '' : 's'}:`,
    items: trips.map((t) => {
      const days = t.stops.reduce((n, s) => n + s.days, 0);
      const parts = [t.startDate ? `from ${when(new Date(`${t.startDate}T12:00:00Z`))}` : 'no date yet', t.stops.length ? t.stops.map((s) => s.name).slice(0, 3).join(', ') : 'no cities yet', days ? `${days} day${days === 1 ? '' : 's'}` : ''];
      return { title: t.name, sub: parts.filter(Boolean).join(' · '), href: `/travel/trip?id=${t.id}` };
    }),
  };
}

/** M424: the courses they are in (a student) or teach. One query. */
async function myCourses(u: SessionUser): Promise<AskPlan> {
  const staff = isStaff(u.role);
  const courses = staff
    ? await prisma.course.findMany({ where: taughtBy(u.id), select: { id: true, code: true, name: true }, orderBy: { code: 'asc' }, take: 30 })
    : (await prisma.enrollment.findMany({ where: { studentId: u.id }, select: { course: { select: { id: true, code: true, name: true } } }, take: 30 })).map((e) => e.course);
  if (!courses.length) return { action: 'show', say: staff ? 'You don’t teach a course yet. Choose New course to start one.' : 'You’re not in a course yet. Open the invite link your teacher shares to join one.', items: [] };
  return {
    action: 'show', say: staff ? `You teach ${courses.length} course${courses.length === 1 ? '' : 's'}:` : `You’re in ${courses.length} course${courses.length === 1 ? '' : 's'}:`,
    items: courses.slice(0, 12).map((c) => ({ title: c.name, sub: c.code, href: staff ? '/teacher/courses' : `/student/courses/${c.id}` })),
  };
}

/** M425: which of the teacher's courses a quiz is for: the one they named, or their only one; otherwise ask. One query. */
async function quizFor(u: SessionUser, plan: Extract<AskPlan, { action: 'quiz_draft' }>): Promise<AskPlan> {
  if (!isStaff(u.role)) return { action: 'answer', say: 'Only teachers can have Ghidra draft a quiz. I can show what’s due for you instead.' };
  const courses = await prisma.course.findMany({ where: taughtBy(u.id, ['CO_TEACHER']), select: { id: true, code: true, name: true }, orderBy: { code: 'asc' }, take: 60 });
  if (!courses.length) return { action: 'show', say: 'You don’t teach a course yet. Choose New course to start one.', items: [] };
  const said = (plan.course ?? '').toLowerCase().trim();
  const named = said ? courses.filter((c) => c.code.toLowerCase() === said || c.name.toLowerCase().includes(said) || said.includes(c.code.toLowerCase())) : [];
  const course = named.length === 1 ? named[0] : courses.length === 1 ? courses[0] : null;
  if (!course) return { action: 'show', say: `Which course is it for? Say it again with the course, like “a quiz on ${plan.topic} for ${courses[0].code}”. You teach:`, items: courses.slice(0, 12).map((c) => ({ title: c.name, sub: c.code, href: null })) };
  return { ...plan, courseId: course.id, courseName: `${course.name} (${course.code})`, say: `Write a ${plan.count}-question quiz on ${plan.topic} for ${course.name}? It’ll be a draft only you can see until you publish it.` };
}

/** A read action answered from the person's own data; any other plan as it is. */
async function resolve(u: SessionUser, plan: AskPlan): Promise<AskPlan> {
  switch (plan.action) {
    case 'my_due': return myDue(u);
    case 'my_green': return myGreen(u);
    case 'my_trips': return myTrips(u);
    case 'my_courses': return myCourses(u);
    case 'quiz_draft': return quizFor(u, plan);
    // M433: the app agents, each in src/server/agents.
    case 'research': return research(u, plan.topic);
    case 'social_posts': return socialPosts(u, plan.topic, plan.platforms, plan.count);
    case 'product_help': return support(u, plan.code, plan.question);
    case 'trip_new': return planTrip(u, plan);
    default: return plan;
  }
}

/** One request, one reply: the answer, a list of the person's own things, or one action to confirm. The chain's
 *  specialists (src/server/ghidra-chain.ts, M432) use it for each step, so every step has the same checks. */
export async function askOne(u: SessionUser, text: string, history: AskTurn[]): Promise<AskPlan & { ai: boolean; note?: string }> {
  // M429: someone in crisis or in danger gets the safe, human answer first, whatever AI would say (src/lib/ghidra-guard.ts).
  const g = guard(text);
  if (g) return { action: 'answer', say: guardReply(g), ai: false };
  const local = async (note?: string) => ({ ...(await resolve(u, localPlan(text))), ai: false, ...(note ? { note } : {}) });
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) return local();
  const spend = await spendAi(u);
  if (!spend.ok) return local(spend.message);
  const prompt = history.length ? `Earlier in this chat:\n${history.map((t) => `${t.who === 'me' ? 'Person' : 'Ghidra'}: ${t.text}`).join('\n')}\n\nLatest request: ${text}` : text;
  const out = await geminiJson<Record<string, unknown>>(SYSTEM, prompt, SCHEMA, 2000, true).catch(() => null);
  if (!out) return local();
  const plan = await resolve(u, cleanPlan(out));
  // M430: a hard question (maths, code, logic) answered by DeepSeek when the owner has it on; Gemini's answer otherwise.
  if (plan.action === 'answer' && isHard(text)) {
    const deep = await thinkHardText(`You are Ghidra, UniVerse's assistant. Answer fully and correctly, in plain text (lists as lines starting with "- "). Suitable for students; with graded schoolwork help them learn rather than handing over finished work. ${UNTRUSTED_RULE}`, [...history.map((t) => ({ role: t.who === 'me' ? 'user' as const : 'assistant' as const, content: t.text })), { role: 'user', content: text }]);
    if (deep) return { action: 'answer', say: deep.slice(0, 6000), ai: true };
  }
  return { ...plan, ai: true };
}

export async function askUniverse(u: SessionUser, b: Body): Promise<AskPlan & { ai: boolean; note?: string }> {
  const text = short(b.text, 400);
  if (!text) throw new BadRequestException('Type what you’d like to do.');
  const g = guard(text);
  if (g) return { action: 'answer', say: guardReply(g), ai: false };
  const history = cleanHistory(b.history);
  // M432: a request with several parts ("… and then …") becomes a short plan of steps, approved together.
  if (looksMultiStep(text)) {
    const chain = await askChain(u, text, history);
    if (chain) return chain;
  }
  return askOne(u, text, history);
}

/** M429: POST /ghidra/report { question, answer, reason? }: someone reports one of Ghidra's answers (wrong, unsafe, unkind)
 *  for the owner console's Moderation. Only what they send; at most 20 a day each. */
export async function reportAnswer(u: SessionUser, b: Body) {
  const question = short(b.question, 1000), answer = short(b.answer, 6000), reason = short(b.reason, 300);
  if (!question || !answer) throw new BadRequestException('Nothing to report.');
  const today = await prisma.ghidraReport.count({ where: { userId: u.id, createdAt: { gte: new Date(Date.now() - DAY) } } });
  if (today >= 20) throw new BadRequestException('Thanks: you’ve sent a lot of reports today. Try again tomorrow.');
  await prisma.ghidraReport.create({ data: { userId: u.id, question, answer, reason: reason || null } });
  return { ok: true };
}
