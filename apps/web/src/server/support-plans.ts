import prisma from '@/lib/db';
import { planLimits } from '@/lib/plan-limits';
import type { SessionUser } from '@/lib/server-auth';
import { spendAi } from './ai-budget';
import { geminiJson } from './gemini';
import { BadRequestException, HttpException, NotFoundException } from './http';
import { featureOff } from './moderation';
import { publish } from './realtime';
import { pushService } from './services/push.service';

// Upgrade 3, early help with an action plan: notice → act → follow up → measure. From an
// early-warning flag the teacher makes a short study plan (one AI request, from the student's weak
// topics: low rubric criteria and missed quiz questions; a plain plan when AI isn't available).
// The student sees it in their Study planner as encouragement; words like "at risk" never reach
// them. After 7 days the 15-minute cron (only when something is due) reminds the teacher in the
// app and records whether the concern score improved. No email anywhere.

const DAY = 86_400_000;
export const FOLLOW_UP_DAYS = 7;

export interface PlanStep { title: string; detail: string; minutes: number }
export interface PlanBody { intro: string; steps: PlanStep[]; closing: string }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** The flag, if this teacher (course teacher) or admin may act on it. */
export async function flagFor(flagId: string, user: SessionUser) {
  const flag = await prisma.studentRiskFlag.findUnique({
    where: { id: flagId },
    include: { course: { select: { id: true, code: true, name: true, teacherId: true } }, student: { select: { id: true, name: true } } },
  });
  if (!flag || (user.role !== 'ADMIN' && !(user.role === 'TEACHER' && flag.course.teacherId === user.id))) throw new NotFoundException('Not found.');
  return flag;
}

/** What to work on: rubric criteria scored under 60% and quiz questions answered wrongly in this course. */
export async function weakTopics(studentId: string, courseId: string): Promise<string[]> {
  const [subs, quizzes] = await Promise.all([
    prisma.assignmentSubmission.findMany({
      where: { studentId, status: 'RETURNED', assignment: { courseId } }, orderBy: { returnedAt: 'desc' }, take: 8,
      select: { criteriaScores: true, assignment: { select: { title: true, rubric: true } } },
    }),
    prisma.quizSubmission.findMany({
      where: { studentId, quiz: { courseId } }, orderBy: { submittedAt: 'desc' }, take: 8,
      select: { answers: true, quiz: { select: { title: true, questions: { select: { id: true, question: true, correctAnswer: true } } } } },
    }),
  ]);
  const out: string[] = [];
  for (const s of subs) {
    const rubric = Array.isArray(s.assignment.rubric) ? (s.assignment.rubric as { id: string; criterion: string; points: number }[]) : [];
    const scores = Array.isArray(s.criteriaScores) ? (s.criteriaScores as { id: string; score: number }[]) : [];
    for (const r of rubric) {
      const got = scores.find((x) => x.id === r.id)?.score;
      if (typeof got === 'number' && r.points > 0 && got / r.points < 0.6) out.push(`${r.criterion} (in “${s.assignment.title}”)`);
    }
  }
  for (const q of quizzes) {
    const answers = (q.answers && typeof q.answers === 'object' ? q.answers : {}) as Record<string, unknown>;
    for (const question of q.quiz.questions) if (answers[question.id] !== question.correctAnswer) out.push(`“${question.question.slice(0, 120)}” (quiz: ${q.quiz.title})`);
  }
  return [...new Set(out)].slice(0, 10);
}

const SYSTEM = [
  'You write a short, kind study plan from a teacher to one university student, to help them get back on track in a course.',
  'Tone: warm, practical, encouraging, like a good tutor. Never use words such as "at risk", "struggling", "failing", "warning", "flagged", "concern" or "behind": the student must feel supported, not judged.',
  'intro: 1–2 sentences addressed to the student by first name. steps: 3–5 concrete actions for the next 7 days, each with a short title (under 8 words), one sentence of detail and realistic minutes (15–90). Base them on the weak topics given; if none, use good general study habits for the course (reviewing notes, practice questions, office hours).',
  'closing: one sentence inviting them to reply or come to office hours. Use the course\'s language. Do not invent grades, dates or facts.',
].join(' ');
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    intro: { type: 'STRING' },
    steps: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, detail: { type: 'STRING' }, minutes: { type: 'INTEGER' } }, required: ['title', 'detail', 'minutes'] } },
    closing: { type: 'STRING' },
  },
  required: ['intro', 'steps', 'closing'],
};

function cleanPlan(raw: Partial<PlanBody> | null): PlanBody | null {
  if (!raw) return null;
  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map((x) => ({ title: str(x?.title, 80), detail: str(x?.detail, 300), minutes: Math.max(10, Math.min(120, Math.round(Number(x?.minutes) || 30))) }))
    .filter((x) => x.title).slice(0, 6);
  const intro = str(raw.intro, 400);
  if (!intro || !steps.length) return null;
  return { intro, steps, closing: str(raw.closing, 300) };
}

/** A plain plan when AI isn't available: still useful, built from the weak topics. */
function simplePlan(first: string, course: string, topics: string[]): PlanBody {
  const steps: PlanStep[] = topics.slice(0, 3).map((t) => ({ title: `Revisit ${t.replace(/ \(.*$/, '').replace(/[“”]/g, '').slice(0, 50)}`, detail: `Go back over ${t} with your notes and the feedback, then try a similar question.`, minutes: 40 }));
  steps.push({ title: 'Plan two short study sessions', detail: `Put two 30-minute ${course} sessions in your week and keep them like appointments.`, minutes: 60 });
  if (steps.length < 4) steps.push({ title: 'Ask one question', detail: 'Bring one thing you’re unsure about to office hours or send it to me in Messages.', minutes: 15 });
  return { intro: `Hi ${first}, here’s a short plan to help you get the most out of ${course} this week.`, steps, closing: 'Reply to me any time if you’d like to talk it through.' };
}

async function tellStudent(studentId: string, title: string, body: string) {
  const link = '/student/planner#support';
  await prisma.notification.create({ data: { userId: studentId, title, body, type: 'info', link } });
  publish([studentId], { type: 'notification' });
  await pushService.sendToMany([studentId], { title, body, url: link, tag: 'support-plan' }).catch(() => 0);
}

/** POST /api/early-warning/[id]/plan { message? }: make and send a plan (teacher or admin). */
export async function createSupportPlan(flagId: string, user: SessionUser, body: Record<string, unknown>) {
  const flag = await flagFor(flagId, user);
  const open = await prisma.supportPlan.findFirst({ where: { flagId, status: 'ACTIVE' }, select: { id: true } });
  if (open) throw new BadRequestException('This student already has an active plan for this course. Follow it up first.');
  const first = flag.student.name.split(/\s+/)[0] || flag.student.name;
  const topics = await weakTopics(flag.studentId, flag.courseId);
  let plan: PlanBody | null = null;
  let usedAi = false;
  if (process.env.GEMINI_API_KEY && !(await featureOff('ai'))) {
    const spend = await spendAi(user);
    if (!spend.ok) throw new HttpException(spend.message, 429);
    plan = cleanPlan(await geminiJson<Partial<PlanBody>>(SYSTEM, `Student first name: ${first}\nCourse: ${flag.course.code} ${flag.course.name}\nTeacher: ${user.name}\nWeak topics:\n${topics.length ? topics.map((t) => `- ${t}`).join('\n') : '- (none recorded yet)'}`, SCHEMA, 900, true));
    usedAi = !!plan;
  }
  plan ??= simplePlan(first, flag.course.code, topics);
  const message = str(body.message, 1000) || null;
  const created = await prisma.supportPlan.create({
    data: {
      flagId, studentId: flag.studentId, courseId: flag.courseId, createdById: user.id, createdByName: user.name,
      plan: JSON.stringify(plan), message, followUpAt: new Date(Date.now() + FOLLOW_UP_DAYS * DAY), startScore: flag.score,
    },
  });
  await prisma.studentRiskFlag.update({ where: { id: flagId }, data: { status: 'CONTACTED', handledById: user.id, handledByName: user.name, handledAt: new Date(), handledScore: flag.score } });
  await tellStudent(flag.studentId, `A study plan from ${user.name}`, `${flag.course.code}: a few steps for this week. Open your Study planner to see them.`);
  return { id: created.id, plan, usedAi, topics, followUpAt: created.followUpAt };
}

const outcomeFor = (start: number | null, now: number) => (start === null ? 'SAME' : now <= start - 10 ? 'IMPROVED' : now >= start + 10 ? 'WORSE' : 'SAME');

/** 15-minute cron (only when one is due): remind the teacher and record the outcome. */
export async function remindSupportFollowUps() {
  const due = await prisma.supportPlan.findMany({
    where: { status: 'ACTIVE', followUpNotifiedAt: null, followUpAt: { lte: new Date() } }, take: 20,
    select: { id: true, flagId: true, studentId: true, courseId: true, createdById: true, startScore: true, student: { select: { name: true } } },
  });
  let sent = 0;
  for (const p of due) {
    const flag = p.flagId ? await prisma.studentRiskFlag.findUnique({ where: { id: p.flagId }, select: { id: true, score: true, course: { select: { code: true, teacherId: true } } } }) : null;
    const score = flag?.score ?? null;
    const outcome = score === null ? null : outcomeFor(p.startScore, score);
    await prisma.supportPlan.update({ where: { id: p.id }, data: { followUpNotifiedAt: new Date(), endScore: score, outcome } });
    if (flag) await prisma.studentRiskFlag.update({ where: { id: flag.id }, data: { followUpScore: score } });
    const word = outcome === 'IMPROVED' ? 'things look better' : outcome === 'WORSE' ? 'things haven’t improved yet' : 'about the same so far';
    const title = `Follow up with ${p.student.name}`;
    const body = `${flag?.course.code ?? 'Course'}: it’s been a week since the study plan — ${word}. Check in and close the follow-up.`;
    const link = '/teacher/early-warning';
    const ids = [...new Set([p.createdById, flag?.course.teacherId].filter((x): x is string => !!x))];
    await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, title, body, type: 'warning', link })) });
    publish(ids.slice(0, planLimits().livePushes), { type: 'notification' });
    await pushService.sendToMany(ids, { title, body, url: link, tag: `follow-up-${p.id}` }).catch(() => 0);
    sent += 1;
  }
  return sent;
}

/** PATCH /api/support-plans/[id]: the teacher closes the follow-up (or cancels), the student ticks steps. */
export async function updateSupportPlan(planId: string, user: SessionUser, body: Record<string, unknown>) {
  const p = await prisma.supportPlan.findUnique({ where: { id: planId } });
  if (!p) throw new NotFoundException('Plan not found.');
  if (user.id === p.studentId) {
    const step = Number(body.step);
    let done: number[] = [];
    try { done = JSON.parse(p.stepsDone); } catch { /* none */ }
    const steps = (JSON.parse(p.plan) as PlanBody).steps.length;
    if (!Number.isInteger(step) || step < 0 || step >= steps) throw new BadRequestException('Unknown step.');
    done = body.done === true ? [...new Set([...done, step])] : done.filter((x) => x !== step);
    await prisma.supportPlan.update({ where: { id: p.id }, data: { stepsDone: JSON.stringify(done.sort((a, b) => a - b)) } });
    return { stepsDone: done };
  }
  if (!p.flagId) throw new NotFoundException('Plan not found.');
  const flag = await flagFor(p.flagId, user);
  if (body.cancel === true) {
    await prisma.supportPlan.update({ where: { id: p.id }, data: { status: 'CANCELLED' } });
    return { status: 'CANCELLED' };
  }
  if (body.followUpDone === true) {
    const outcome = p.outcome ?? outcomeFor(p.startScore, flag.score);
    await prisma.supportPlan.update({ where: { id: p.id }, data: { status: 'DONE', followUpDoneAt: new Date(), endScore: p.endScore ?? flag.score, outcome } });
    await prisma.studentRiskFlag.update({ where: { id: flag.id }, data: { followUpScore: p.endScore ?? flag.score } });
    return { status: 'DONE', outcome };
  }
  throw new BadRequestException('Nothing to change.');
}

/** The student's plans for their Study planner: encouragement only (no scores, flags or outcomes). */
export async function myPlans(userId: string) {
  const rows = await prisma.supportPlan.findMany({
    where: { studentId: userId, OR: [{ status: 'ACTIVE' }, { status: 'DONE', updatedAt: { gte: new Date(Date.now() - 14 * DAY) } }] },
    orderBy: { createdAt: 'desc' }, take: 5,
    select: { id: true, courseId: true, createdByName: true, plan: true, message: true, stepsDone: true, status: true, createdAt: true },
  });
  if (!rows.length) return [];
  const courses = await prisma.course.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.courseId))] } }, select: { id: true, code: true, name: true } });
  return rows.map((r) => {
    const c = courses.find((x) => x.id === r.courseId);
    let stepsDone: number[] = [];
    try { stepsDone = JSON.parse(r.stepsDone); } catch { /* none */ }
    return { id: r.id, course: c ? { code: c.code, name: c.name } : null, from: r.createdByName, plan: JSON.parse(r.plan) as PlanBody, message: r.message, stepsDone, active: r.status === 'ACTIVE', createdAt: r.createdAt };
  });
}

/** For the early-warning board: each flag's latest plan (teacher / admin view). */
export async function plansForFlags(flagIds: string[]) {
  if (!flagIds.length) return new Map<string, unknown>();
  const rows = await prisma.supportPlan.findMany({
    where: { flagId: { in: flagIds }, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' },
    select: { id: true, flagId: true, plan: true, message: true, stepsDone: true, status: true, followUpAt: true, followUpNotifiedAt: true, followUpDoneAt: true, startScore: true, endScore: true, outcome: true, createdByName: true, createdAt: true },
  });
  const latest = new Map<string, unknown>();
  for (const r of rows) {
    if (!r.flagId || latest.has(r.flagId)) continue;
    let stepsDone: number[] = [];
    try { stepsDone = JSON.parse(r.stepsDone); } catch { /* none */ }
    latest.set(r.flagId, { ...r, plan: JSON.parse(r.plan) as PlanBody, stepsDone });
  }
  return latest;
}
