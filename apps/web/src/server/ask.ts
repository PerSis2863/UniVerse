import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { ASK_PAGES, cleanPlan, localPlan, type AskPlan, type AskTurn, type ShowItem } from '@/lib/ask';
import { taughtBy } from '@/lib/course-access';
import { GREEN_FACTORS, GREEN_KINDS, streak } from '@/lib/green';
import { RELIEF_KINDS } from '@/lib/relief';
import { MATH_RULE } from '@/lib/tutor-rules';
import { spendAi } from './ai-budget';
import { BadRequestException } from './http';
import { featureOff } from './moderation';
import { geminiJson } from './gemini';
import { short } from './trace';
import type { Body } from './body';

// POST /ask { text, history? }: Ghidra, the assistant (M363; "Ask UniVerse", M30, until then; src/lib/ask.ts).
// The request becomes ONE proposed action the person confirms in the chat; this route never changes anything
// itself. 'my_due' and 'my_green' only read the asker's own data and come back as a list ('show'). AI goes through
// the daily allowance (spendAi) and the owner's switch (featureOff('ai')); without it, or when it fails, the simple
// matcher answers. Every field AI returns is checked again (cleanPlan). The last few turns come along so follow-ups
// work; they are the person's own words and Ghidra's replies, cut short, and only shape this one answer.

const SYSTEM = [
  'You are Ghidra, the assistant of UniVerse Impact: one account with several apps: UniVersity (school), Trace (product',
  'passports), Relief (needs and offers of help on a map), Green (climate actions), Travel (places, guides and trips) and Games.',
  'Turn the person\'s latest request into exactly one action. Earlier turns are only context for follow-ups. Actions:',
  '- my_due: they ask what schoolwork is due, coming up or still to hand in (their assignments and quizzes).',
  '- my_green: they ask how they are doing in Green (CO2 saved, streak, actions).',
  `- green_log: they did a climate action. kind is one of ${GREEN_KINDS.map((k) => `${k} (${GREEN_FACTORS[k].units})`).join(', ')}; amount is how many of that unit.`,
  `- relief_post: they need help (type NEED) or offer it (type OFFER). kind is one of ${RELIEF_KINDS.join(', ')}; title is a short line in their words; people is how many people; urgency LOW, MEDIUM, HIGH or CRITICAL.`,
  '- trace_check: they gave a product code to check.',
  `- open: they want a page. page is one of ${Object.keys(ASK_PAGES).join(', ')}.`,
  '- answer: anything else: a short, friendly answer about how to do it in UniVerse (never invent their data, marks or dates).',
  'If someone is in danger, answer that UniVerse is not an emergency service and they should call the local emergency number first (112 in Europe and India, 911 in North America), and offer relief_post.',
  'Always fill "say": one plain sentence telling them what will happen, or the answer. Be warm and brief.',
  MATH_RULE,
].join('\n');

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    action: { type: 'STRING', enum: ['my_due', 'my_green', 'green_log', 'relief_post', 'trace_check', 'open', 'answer'] },
    say: { type: 'STRING' }, kind: { type: 'STRING' }, amount: { type: 'NUMBER' }, note: { type: 'STRING' },
    type: { type: 'STRING' }, title: { type: 'STRING' }, people: { type: 'NUMBER' }, urgency: { type: 'STRING' },
    code: { type: 'STRING' }, page: { type: 'STRING' },
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
      { title: `${r1(kg)} kg CO₂ saved`, sub: `${rows.length} action${rows.length === 1 ? '' : 's'} in all`, href: '/green' },
      { title: `${r1(week)} kg this week`, sub: 'the last 7 days', href: '/green' },
      { title: days ? `${days}-day streak` : 'No streak yet', sub: days ? 'log one today to keep it' : 'log one today to start it', href: '/green' },
    ],
  };
}

/** A read action answered from the person's own data; any other plan as it is. */
async function resolve(u: SessionUser, plan: AskPlan): Promise<AskPlan> {
  return plan.action === 'my_due' ? myDue(u) : plan.action === 'my_green' ? myGreen(u) : plan;
}

export async function askUniverse(u: SessionUser, b: Body): Promise<AskPlan & { ai: boolean; note?: string }> {
  const text = short(b.text, 400);
  if (!text) throw new BadRequestException('Type what you’d like to do.');
  const local = async (note?: string) => ({ ...(await resolve(u, localPlan(text))), ai: false, ...(note ? { note } : {}) });
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) return local();
  const spend = await spendAi(u);
  if (!spend.ok) return local(spend.message);
  const history = cleanHistory(b.history);
  const prompt = history.length ? `Earlier in this chat:\n${history.map((t) => `${t.who === 'me' ? 'Person' : 'Ghidra'}: ${t.text}`).join('\n')}\n\nLatest request: ${text}` : text;
  const out = await geminiJson<Record<string, unknown>>(SYSTEM, prompt, SCHEMA, 400, true).catch(() => null);
  return out ? { ...(await resolve(u, cleanPlan(out))), ai: true } : local();
}
