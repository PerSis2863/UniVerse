import prisma from '@/lib/db';
import { SYSTEM_EMAIL } from '@/lib/chat';
import { HHMM, validZone } from '@/lib/local-time';
import type { SessionUser } from '@/lib/server-auth';
import { spendAi } from './ai-budget';
import { notify, notifyMany } from './email';
import { geminiJson } from './gemini';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { featureOff } from './moderation';
import { pushService } from './services/push.service';

// Safe by default for young students (Stage 4 · 4.10).
//  - The school's policy (Admin → Safety → Policy): the chat safety check on or off, recording calls
//    with students under 18 (off unless the school allows it), quiet hours for them, and whether
//    students without a birth date count as under 18 (schools: yes; universities: no).
//  - Chat safety check: every text message in a chat with a student gets a quick word check here;
//    only one that looks unsafe goes to AI (with the few messages before it), and a confirmed one is
//    flagged for the school's moderators (Admin → Safety → Chat safety), never shown to anyone else
//    and never told to the sender. Without AI, only the clearest danger signs (self-harm, threats)
//    are flagged. Moderators review, dismiss, or pause the sender's messages for a day.
//  - Quiet hours (src/server/quiet-hours.ts): no pushes during them; for students under 18 the
//    school's hours apply and they can't turn them off; anyone else sets their own.
//  - Guardians see a weekly activity summary on the student's shared link, never message contents.

const DAY = 86_400_000;
export interface Policy { guard: boolean; recordMinors: boolean; quietMinors: boolean; quietStart: string; quietEnd: string; studentsMinors: boolean; parentMessaging: boolean }
const DEFAULT_POLICY: Policy = { guard: true, recordMinors: false, quietMinors: true, quietStart: '22:00', quietEnd: '07:00', studentsMinors: false, parentMessaging: true };
let cache: { p: Policy; at: number } | null = null;

/** The school's policy (read at most once a minute per instance). */
export async function schoolPolicy(): Promise<Policy> {
  if (cache && Date.now() - cache.at < 60_000) return cache.p;
  const row = await prisma.schoolPolicy.findUnique({ where: { id: 'main' } }).catch(() => null);
  const p: Policy = row ? { guard: row.guard, recordMinors: row.recordMinors, quietMinors: row.quietMinors, quietStart: row.quietStart, quietEnd: row.quietEnd, studentsMinors: row.studentsMinors, parentMessaging: row.parentMessaging } : DEFAULT_POLICY;
  cache = { p, at: Date.now() };
  return p;
}

const isAdmin = (u: SessionUser) => u.role === 'ADMIN' || u.owner === true;

/** POST /api/safety/policy: a school admin changes the policy. */
export async function setSchoolPolicy(user: SessionUser, b: Record<string, unknown>) {
  if (!isAdmin(user)) throw new ForbiddenException('Only school admins can change the safety policy.');
  const before = await schoolPolicy();
  const bool = (k: keyof Policy) => (typeof b[k] === 'boolean' ? (b[k] as boolean) : (before[k] as boolean));
  const time = (k: 'quietStart' | 'quietEnd') => (typeof b[k] === 'string' && HHMM.test(b[k] as string) ? (b[k] as string) : before[k]);
  const p: Policy = { guard: bool('guard'), recordMinors: bool('recordMinors'), quietMinors: bool('quietMinors'), quietStart: time('quietStart'), quietEnd: time('quietEnd'), studentsMinors: bool('studentsMinors'), parentMessaging: bool('parentMessaging') };
  if (p.quietStart === p.quietEnd) throw new BadRequestException('Quiet hours need to start and end at different times.');
  await prisma.schoolPolicy.upsert({ where: { id: 'main' }, update: { ...p, updatedAt: new Date(), updatedById: user.id }, create: { id: 'main', ...p, updatedById: user.id } });
  // Students under 18 follow the school's hours: changed hours apply at once; switched off, they're free.
  if (!p.quietMinors) await prisma.quietHours.deleteMany({ where: { bySchool: true } });
  else if (p.quietStart !== before.quietStart || p.quietEnd !== before.quietEnd) await prisma.quietHours.updateMany({ where: { bySchool: true }, data: { start: p.quietStart, end: p.quietEnd, updatedAt: new Date() } });
  cache = { p, at: Date.now() };
  return p;
}

/** Under 18: a student whose birth date says so, or with none when the school says students are. */
export function isMinor(u: { role: string; dateOfBirth: Date | null }, p: Policy, now = new Date()) {
  if (u.role !== 'STUDENT') return false;
  if (!u.dateOfBirth) return p.studentsMinors;
  const adult = new Date(u.dateOfBirth);
  adult.setUTCFullYear(adult.getUTCFullYear() + 18);
  return now < adult;
}

/** Of these people, the ones under 18 (one query). */
export async function minorsAmong(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const p = await schoolPolicy();
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(ids)].slice(0, 90) }, role: 'STUDENT' }, select: { id: true, role: true, dateOfBirth: true } });
  return new Set(people.filter((u) => isMinor(u, p)).map((u) => u.id));
}

/** Recording a call with these people in it: refused when one is under 18 and the school doesn't allow it. */
export async function recordingBlocked(ids: string[]) {
  const p = await schoolPolicy();
  return !p.recordMinors && (await minorsAmong(ids)).size > 0;
}

// ── Quiet hours ─────────────────────────────────────────────────────────────────────────────

/** For a student under 18 while the school's quiet hours are on: their row is the school's. */
export async function ensureQuietDefault(userId: string, tzRaw: unknown) {
  const tz = validZone(tzRaw);
  const [p, u, row] = await Promise.all([
    schoolPolicy(),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true, dateOfBirth: true } }),
    prisma.quietHours.findUnique({ where: { userId } }),
  ]);
  if (!u) return null;
  const school = p.quietMinors && isMinor(u, p);
  if (school) {
    if (row?.bySchool && row.timeZone === tz && row.start === p.quietStart && row.end === p.quietEnd && row.on) return row;
    const data = { on: true, start: p.quietStart, end: p.quietEnd, timeZone: tz, bySchool: true, updatedAt: new Date() };
    return prisma.quietHours.upsert({ where: { userId }, update: data, create: { userId, ...data } });
  }
  // No longer under the school's rule (turned 18, or the policy changed): their own choice again (off).
  if (row?.bySchool) { await prisma.quietHours.delete({ where: { userId } }); return null; }
  if (row && row.timeZone !== tz) return prisma.quietHours.update({ where: { userId }, data: { timeZone: tz, updatedAt: new Date() } });
  return row;
}

/** GET /api/me/quiet?tz=: my quiet hours (and whether the school sets them). */
export async function quietSettings(user: SessionUser, tz: unknown) {
  const row = await ensureQuietDefault(user.id, tz);
  return { on: row?.on ?? false, start: row?.start ?? '22:00', end: row?.end ?? '07:00', locked: row?.bySchool ?? false };
}

/** POST /api/me/quiet { on, start, end, tz }: my own quiet hours (not when the school sets them). */
export async function setQuiet(user: SessionUser, b: Record<string, unknown>) {
  const current = await ensureQuietDefault(user.id, b.tz);
  if (current?.bySchool) throw new ForbiddenException('Your school sets your quiet hours.');
  const start = typeof b.start === 'string' && HHMM.test(b.start) ? b.start : current?.start ?? '22:00';
  const end = typeof b.end === 'string' && HHMM.test(b.end) ? b.end : current?.end ?? '07:00';
  if (start === end) throw new BadRequestException('Quiet hours need to start and end at different times.');
  const data = { on: b.on === true, start, end, timeZone: validZone(b.tz), bySchool: false, updatedAt: new Date() };
  const row = await prisma.quietHours.upsert({ where: { userId: user.id }, update: data, create: { userId: user.id, ...data } });
  return { on: row.on, start: row.start, end: row.end, locked: false };
}

// ── Chat safety check ───────────────────────────────────────────────────────────────────────

export type SafetyKind = 'bullying' | 'threat' | 'self_harm' | 'sexual' | 'personal_info' | 'hate';
/** The quick check: phrases that often mean trouble. `strong` ones are flagged even without AI. */
const PATTERNS: { kind: SafetyKind; strong?: boolean; re: RegExp }[] = [
  { kind: 'self_harm', strong: true, re: /\b(kill(ing)? my ?self|kms|(want|wanted|going) to die|wanna die|end (it all|my life)|suicid(e|al)|self[- ]?harm(ing)?|cut(ting)? my ?self|no reason to live|better off (dead|without me)|hurt(ing)? my ?self)\b/i },
  { kind: 'threat', strong: true, re: /\b(i('?ll| will| am going to|'?m gonna) (kill|hurt|beat|stab|shoot) (you|u|him|her|them)|bring(ing)? a (gun|knife) to school|shoot (up )?the school|bomb (the|this|our) (school|class)|you('?re| are) dead|watch your back)\b/i },
  { kind: 'bullying', re: /\b(kys|kill (yo)?urself|go die|nobody (likes|wants) you|every(one|body) hates you|no ?one cares about you|you('?re| are)( so)? (ugly|fat|worthless|pathetic|disgusting|useless|a loser|a freak)|retard(ed)?)\b/i },
  { kind: 'sexual', re: /\b(send (me )?(nudes?|pics? of you|a pic of you)|nudes?|naked|sexy|don'?t tell (your|ur) (mom|mum|dad|parents?|teacher)|(our|a) (little )?secret between us|meet (me )?alone|are (you|u) home alone)\b/i },
  { kind: 'personal_info', re: /(\b\d{10}\b|\+\d[\d\s-]{8,}\d|\b(what('?s| is) (your|ur) (home )?(address|phone number|number)|where do (you|u) live|i live at)\b)/i },
  { kind: 'hate', re: /\b(go back to (your|ur) (own )?country|(you|your) people are (animals|dirty|vermin)|subhuman)\b/i },
];

/** What the quick check found in a message, or null. */
export function quickCheck(text: string): { kinds: SafetyKind[]; strong: boolean } | null {
  const hits = PATTERNS.filter((p) => p.re.test(text));
  return hits.length ? { kinds: [...new Set(hits.map((h) => h.kind))], strong: hits.some((h) => h.strong) } : null;
}

interface Verdict { unsafe: boolean; kind: SafetyKind | 'none'; severity: 'low' | 'medium' | 'high'; reason: string }
const GUARD_SYSTEM = `You check chat messages in a school app to keep students safe. Given the last few messages of a chat and a NEW message, decide whether the NEW message is any of:
- bullying: insulting, humiliating, excluding or harassing someone;
- threat: a threat of violence against someone or a school;
- self_harm: the writer may hurt themselves or is in crisis;
- sexual: sexual content, or an adult or stranger grooming a young person (secrets, meeting alone, asking for photos);
- personal_info: asking for or sharing a home address or phone number in a way that could put a student at risk;
- hate: attacking people for their race, religion, origin, gender, sexuality or disability.
Friendly teasing between friends, jokes that are clearly jokes, song lyrics, quotes, and schoolwork about these topics are NOT unsafe. When a mild case is unclear, answer unsafe=false.
severity: high = someone may be in danger now (self-harm, a real threat, grooming); medium = clear bullying, hate, or risky personal details; low = borderline.
reason: one short, neutral sentence for a school moderator (no quotes from the messages).`;
const VERDICT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    unsafe: { type: 'BOOLEAN' },
    kind: { type: 'STRING', enum: ['bullying', 'threat', 'self_harm', 'sexual', 'personal_info', 'hate', 'none'] },
    severity: { type: 'STRING', enum: ['low', 'medium', 'high'] },
    reason: { type: 'STRING' },
  },
  required: ['unsafe', 'kind', 'severity', 'reason'],
};
export const KIND_LABEL: Record<SafetyKind, string> = { bullying: 'Bullying', threat: 'Threat', self_harm: 'May be at risk', sexual: 'Sexual or grooming', personal_info: 'Personal details', hate: 'Hate' };

/** The school's moderators: admins (not the app's own account). */
async function moderators() {
  return (await prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE', email: { not: SYSTEM_EMAIL } }, select: { id: true }, take: 50 })).map((u) => u.id);
}

/**
 * After a text message is saved (chat-notify.ts afterSend, in the background): the quick check, then
 * AI, then a flag for the moderators. Only chats with a student in them; a burst from the same person
 * in the same chat stays one flag (counted, no more AI requests).
 */
export async function guardMessage(m: { id: string; conversationId: string; body: string }, from: { id: string; name: string }) {
  const hit = quickCheck(m.body);
  if (!hit) return null;
  const policy = await schoolPolicy();
  if (!policy.guard) return null;
  const [members, recent] = await Promise.all([
    prisma.conversationParticipant.findMany({ where: { conversationId: m.conversationId }, select: { userId: true, user: { select: { role: true } } }, take: 500 }),
    prisma.safetyFlag.findFirst({ where: { conversationId: m.conversationId, senderId: from.id, status: 'OPEN', createdAt: { gt: new Date(Date.now() - 10 * 60_000) } }, select: { id: true } }),
  ]);
  // Chats with a student, and parent–teacher chats (Stage 5 · B16.2).
  if (!members.some((x) => x.user.role === 'STUDENT' || x.user.role === 'GUARDIAN')) return null;
  if (recent) { await prisma.safetyFlag.update({ where: { id: recent.id }, data: { repeats: { increment: 1 } } }); return recent.id; }

  let verdict: Verdict | null = null;
  let source: 'ai' | 'words' = 'ai';
  if (process.env.GEMINI_API_KEY && !(await featureOff('ai')) && (await spendAi(null)).ok) {
    const before = await prisma.message.findMany({
      where: { conversationId: m.conversationId, id: { not: m.id }, deletedAt: null, type: 'TEXT' }, orderBy: { createdAt: 'desc' }, take: 5,
      select: { body: true, senderId: true, sender: { select: { name: true } } },
    });
    const who = (id: string, name: string) => (id === from.id ? 'Writer' : name.split(/\s+/)[0]);
    const context = before.reverse().map((x) => `${who(x.senderId, x.sender.name)}: ${x.body.slice(0, 300)}`).join('\n');
    verdict = await geminiJson<Verdict>(GUARD_SYSTEM, `Chat so far:\n${context || '(nothing before)'}\n\nNEW message from the Writer:\n${m.body.slice(0, 1000)}`, VERDICT_SCHEMA, 200, true).catch(() => null);
    if (verdict && (!verdict.unsafe || verdict.kind === 'none')) return null;
  }
  // No AI answer: only the clearest danger signs are flagged.
  if (!verdict) {
    if (!hit.strong) return null;
    const kind = hit.kinds.find((k) => k === 'self_harm' || k === 'threat') ?? hit.kinds[0];
    verdict = { unsafe: true, kind, severity: 'medium', reason: 'Words that often mean someone may be at risk (checked without AI).' };
    source = 'words';
  }
  const kind = verdict.kind as SafetyKind;
  const flag = await prisma.safetyFlag.create({
    data: { messageId: m.id, conversationId: m.conversationId, senderId: from.id, kind, severity: verdict.severity, reason: verdict.reason.slice(0, 300), excerpt: m.body.slice(0, 1000), source },
    select: { id: true },
  });
  const mods = await moderators();
  const title = `${verdict.severity === 'high' ? 'Urgent: ' : ''}a chat message may need a look`;
  const body = `${KIND_LABEL[kind]} · ${verdict.severity} · from ${from.name}`;
  await notifyMany(mods, { type: 'warning', title, body, link: '/admin/safety/chats', email: false });
  if (verdict.severity === 'high') await pushService.sendToMany(mods, { title, body, url: '/admin/safety/chats', tag: `safety-${flag.id}` }).catch(() => 0);
  // Someone who may be at risk gets a quiet pointer to help (nothing says why).
  if (kind === 'self_harm' && verdict.severity === 'high') {
    await notify(from.id, { type: 'info', title: 'You’re not alone', body: 'If things feel hard right now, talk to someone you trust, or reach out through Help & support. People at your school want to help.', link: '/student/support', email: false });
  }
  return flag.id;
}

/** GET /api/safety/flags?status=: flagged messages for the school's moderators. */
export async function listFlags(user: SessionUser, statusRaw: unknown) {
  if (!isAdmin(user)) throw new ForbiddenException('Only school admins see chat safety flags.');
  const status = statusRaw === 'REVIEWED' || statusRaw === 'DISMISSED' ? statusRaw : 'OPEN';
  const [flags, open] = await Promise.all([
    prisma.safetyFlag.findMany({
      where: { status }, orderBy: { createdAt: 'desc' }, take: 100,
      select: {
        id: true, kind: true, severity: true, reason: true, excerpt: true, source: true, repeats: true, status: true, note: true, createdAt: true, reviewedAt: true,
        sender: { select: { id: true, name: true, role: true, avatar: true, chatMutedUntil: true } },
        conversation: { select: { id: true, isGroup: true, name: true, community: { select: { name: true } }, _count: { select: { participants: true } } } },
      },
    }),
    prisma.safetyFlag.count({ where: { status: 'OPEN' } }),
  ]);
  const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
  return {
    open,
    flags: flags
      .sort((a, b) => (status === 'OPEN' ? (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3) : 0) || b.createdAt.getTime() - a.createdAt.getTime())
      .map((f) => ({
        ...f,
        where: f.conversation.community ? `${f.conversation.community.name} › ${f.conversation.name ?? 'channel'}` : f.conversation.isGroup ? f.conversation.name ?? 'Group chat' : 'Direct message',
        people: f.conversation._count.participants,
        paused: !!f.sender.chatMutedUntil && f.sender.chatMutedUntil > new Date(),
      })),
  };
}

/** GET /api/safety/flags/:id: a flag with the messages around it (for judging it). */
export async function flagContext(user: SessionUser, id: string) {
  if (!isAdmin(user)) throw new ForbiddenException('Only school admins see chat safety flags.');
  const flag = await prisma.safetyFlag.findUnique({ where: { id }, select: { conversationId: true, messageId: true, createdAt: true } });
  if (!flag) throw new NotFoundException('That flag doesn’t exist.');
  const at = flag.createdAt;
  const pick = { id: true, body: true, type: true, createdAt: true, deletedAt: true, sender: { select: { name: true, role: true } } } as const;
  const [before, after] = await Promise.all([
    prisma.message.findMany({ where: { conversationId: flag.conversationId, createdAt: { lte: at } }, orderBy: { createdAt: 'desc' }, take: 6, select: pick }),
    prisma.message.findMany({ where: { conversationId: flag.conversationId, createdAt: { gt: at } }, orderBy: { createdAt: 'asc' }, take: 3, select: pick }),
  ]);
  return {
    messages: [...before.reverse(), ...after].map((x) => ({ id: x.id, name: x.sender.name, role: x.sender.role, at: x.createdAt, flagged: x.id === flag.messageId, text: x.deletedAt ? '(deleted)' : x.type === 'TEXT' ? x.body.slice(0, 600) : `(${x.type.toLowerCase()})` })),
  };
}

/** POST /api/safety/flags/:id { action: 'reviewed' | 'dismiss' | 'pause' | 'unpause', note? }. */
export async function reviewFlag(user: SessionUser, id: string, b: Record<string, unknown>) {
  if (!isAdmin(user)) throw new ForbiddenException('Only school admins review chat safety flags.');
  const flag = await prisma.safetyFlag.findUnique({ where: { id }, select: { id: true, senderId: true } });
  if (!flag) throw new NotFoundException('That flag doesn’t exist.');
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 500) || null : undefined;
  if (b.action === 'pause' || b.action === 'unpause') {
    // A day without sending messages (they can still read), or lifted.
    await prisma.user.update({ where: { id: flag.senderId }, data: { chatMutedUntil: b.action === 'pause' ? new Date(Date.now() + DAY) : null } });
    return { ok: true, paused: b.action === 'pause' };
  }
  if (b.action !== 'reviewed' && b.action !== 'dismiss') throw new BadRequestException('Unknown action.');
  await prisma.safetyFlag.update({ where: { id }, data: { status: b.action === 'dismiss' ? 'DISMISSED' : 'REVIEWED', reviewedById: user.id, reviewedAt: new Date(), ...(note !== undefined ? { note } : {}) } });
  return { ok: true };
}

/** GET /api/safety/policy: the policy (school admins), with how many flags are open. */
export async function policyView(user: SessionUser) {
  if (!isAdmin(user)) throw new ForbiddenException('Only school admins see the safety policy.');
  const [p, open] = await Promise.all([schoolPolicy(), prisma.safetyFlag.count({ where: { status: 'OPEN' } })]);
  return { ...p, open, ai: !!process.env.GEMINI_API_KEY && !(await featureOff('ai')) };
}

// ── For guardians ───────────────────────────────────────────────────────────────────────────

/**
 * The student's week in numbers for their shared guardian link: days active, messages sent, calls
 * (how many, minutes), work handed in, and their quiet hours. Never what they wrote or who to.
 */
export async function weekActivity(userId: string) {
  const since = new Date(Date.now() - 7 * DAY);
  const [days, messages, calls, work, quizzes, quiet] = await Promise.all([
    prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(DISTINCT substr("createdAt", 1, 10)) AS n FROM ui_events WHERE "userId" = ? AND "createdAt" >= ?`, userId, since.toISOString().replace('Z', '+00:00')),
    prisma.message.count({ where: { senderId: userId, createdAt: { gte: since }, deletedAt: null } }),
    prisma.callStat.aggregate({ where: { userId, createdAt: { gte: since }, seconds: { gt: 0 } }, _count: { _all: true }, _sum: { seconds: true } }),
    prisma.assignmentSubmission.count({ where: { studentId: userId, submittedAt: { gte: since } } }),
    prisma.quizSubmission.count({ where: { studentId: userId, submittedAt: { gte: since } } }),
    prisma.quietHours.findUnique({ where: { userId }, select: { on: true, start: true, end: true, bySchool: true } }),
  ]);
  return {
    daysActive: Number(days[0]?.n ?? 0),
    messages,
    calls: calls._count._all,
    callMinutes: Math.round((calls._sum.seconds ?? 0) / 60),
    handedIn: work + quizzes,
    quiet: quiet?.on ? { start: quiet.start, end: quiet.end, bySchool: quiet.bySchool } : null,
  };
}
