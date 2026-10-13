import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ConflictException, HttpException, NotFoundException } from './http';
import { groupAccess, groupPeople } from './spaces';
import { geminiJson } from './gemini';
import { spendAi } from './ai-budget';
import { featureOff } from './moderation';
import { notify, notifyMany } from './email';
import { publish } from './realtime';
import { scheduleCall } from './scheduled-calls';
import { courseAccess } from '@/lib/course-access';

// Stage 5 · D6: Group project autopilot. For a group assignment it:
// 1. splits the brief into tasks (one AI request when AI is on, otherwise rules),
// 2. suggests an owner for each task from members' skills, keeping the work even,
// 3. finds a weekly meeting time from everyone's class timetable,
// 4. puts the tasks on the group's Tasks board and schedules the call (scheduled-calls.ts),
// 5. writes a weekly progress report with fair-contribution numbers (by itself once a week, from the
//    daily job), and lets members nudge late tasks.
// Everything is for members of the group only (groupAccess). A plan the group links to one of its
// courses is also visible to that course's teacher (Course board → Group projects). Nothing is emailed.

export interface AutopilotTaskDraft {
  title: string;
  notes: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  estimateHours: number;
  requiredSkills: string[];
  suggestedAssigneeId: string | null;
  suggestedAssigneeName: string | null;
  suggestedAssigneeReason: string;
  dueDaysFromStart: number;
}

export interface MeetingSlotCandidate {
  dayOfWeek: number; // 0=Mon ... 6=Sun
  dayName: string;
  startTime: string; // "14:00"
  endTime: string; // "15:00"
  availableMemberIds: string[];
  totalMembers: number;
  conflicts: { userId: string; userName: string; reason: string }[];
  score: number; // 0..100
}

export interface MemberContributionStat {
  userId: string;
  name: string;
  avatar: string | null;
  tasksAssigned: number;
  tasksCompleted: number;
  tasksOverdue: number;
  hoursDone: number;
  contributionSharePercent: number;
  status: 'BALANCED' | 'OVERLOADED' | 'UNDER_CONTRIBUTING';
}

export interface ContributionSummary {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  members: MemberContributionStat[];
  /** 1 = everyone did an even share of the finished work, 0 = one person did all of it; null until a task per person is done. */
  fairContributionScore: number | null;
  health: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK';
  nudgesRecommended: { taskId: string; taskTitle: string; userId: string; userName: string; reason: string }[];
}

type Member = { id: string; name: string; skills: { name: string; level: string }[] };
type Draft = Omit<AutopilotTaskDraft, 'suggestedAssigneeId' | 'suggestedAssigneeName' | 'suggestedAssigneeReason'>;

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const MAX_TASKS = 8;
const DAY = 86_400_000;

const STANDARD_SLOTS = [
  { startTime: '10:00', endTime: '11:00' },
  { startTime: '11:30', endTime: '12:30' },
  { startTime: '14:00', endTime: '15:00' },
  { startTime: '15:30', endTime: '16:30' },
  { startTime: '16:30', endTime: '17:30' },
];

// ─── Splitting the brief and matching skills (pure) ──────────────────────────────────────────────

/** Rules-based split of a brief into tasks, each with a suggested owner. */
export function splitBriefAndMatchSkills(brief: string, members: Member[], targetDays = 21): AutopilotTaskDraft[] {
  if (!members.length) return [];
  return assignTasksBySkills(heuristicTaskBreakdown(brief, targetDays), members);
}

function heuristicTaskBreakdown(brief: string, targetDays: number): Draft[] {
  const lines = brief
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 5 && (l.startsWith('-') || l.startsWith('*') || /^\d+[.)]/.test(l)));
  const totalDays = Math.max(7, targetDays);

  // A brief written as a list: one task per line.
  if (lines.length >= 3) {
    const used = lines.slice(0, MAX_TASKS);
    return used.map((line, idx) => {
      const title = line.replace(/^[-*\d.)\s]+/, '').trim();
      return {
        title: title.slice(0, 80),
        notes: `From the brief: "${title.slice(0, 300)}"`,
        priority: idx === 0 || idx === used.length - 1 ? 'HIGH' : 'MEDIUM',
        estimateHours: 4 + (idx % 3) * 3,
        requiredSkills: inferSkillsFromText(title),
        dueDaysFromStart: Math.max(1, Math.round(((idx + 1) / used.length) * totalDays)),
      };
    });
  }

  // Otherwise the usual shape of a project.
  return [
    { title: 'Phase 1: Problem Definition & Research', notes: 'Problem statement, scope, background reading and references.', priority: 'HIGH', estimateHours: 6, requiredSkills: ['Research', 'Technical Writing', 'Analysis'], dueDaysFromStart: Math.round(totalDays * 0.25) },
    { title: 'Phase 2: Architecture & System Design', notes: 'How it fits together: diagrams, data, interfaces and sketches of the screens.', priority: 'HIGH', estimateHours: 8, requiredSkills: ['System Design', 'Architecture', 'UI/UX'], dueDaysFromStart: Math.round(totalDays * 0.45) },
    { title: 'Phase 3: Core Implementation & Prototype', notes: 'Build the main parts and a working prototype.', priority: 'URGENT', estimateHours: 12, requiredSkills: ['Programming', 'Software Engineering', 'Implementation'], dueDaysFromStart: Math.round(totalDays * 0.75) },
    { title: 'Phase 4: Testing, QA & Benchmarking', notes: 'Test it, fix the problems found and check it works as promised.', priority: 'MEDIUM', estimateHours: 6, requiredSkills: ['Testing', 'Quality Assurance', 'Debugging'], dueDaysFromStart: Math.round(totalDays * 0.88) },
    { title: 'Phase 5: Final Report & Presentation Deck', notes: 'The report, the slides, a short demo and everything to hand in.', priority: 'HIGH', estimateHours: 6, requiredSkills: ['Presentation', 'Technical Writing', 'Communication'], dueDaysFromStart: totalDays },
  ];
}

function inferSkillsFromText(text: string): string[] {
  const t = text.toLowerCase();
  const skills: string[] = [];
  if (/code|implement|program|api|backend|frontend/.test(t)) skills.push('Programming', 'Software Engineering');
  if (/design|\bui\b|\bux\b|wireframe|architecture/.test(t)) skills.push('System Design', 'UI/UX');
  if (/test|\bqa\b|bug|verify/.test(t)) skills.push('Testing', 'Quality Assurance');
  if (/write|report|document|research|paper|literature/.test(t)) skills.push('Technical Writing', 'Research');
  if (/present|slide|pitch|demo/.test(t)) skills.push('Presentation', 'Communication');
  return skills.length ? skills : ['General Analysis', 'Technical Writing'];
}

/** Gives each task to the member whose skills fit best, with a penalty per task already given. */
function assignTasksBySkills(tasks: Draft[], members: Member[]): AutopilotTaskDraft[] {
  const counts = new Map(members.map((m) => [m.id, 0]));
  return tasks.map((task) => {
    let best = members[0];
    let bestScore = -Infinity;
    let bestReason = 'Keeps the work even';
    for (const m of members) {
      let score = 0;
      const matched: string[] = [];
      for (const req of task.requiredSkills) {
        const r = req.toLowerCase();
        const found = m.skills.find((s) => s.name.toLowerCase().includes(r) || r.includes(s.name.toLowerCase()));
        if (found) {
          matched.push(found.name);
          score += 4 + (found.level === 'ADVANCED' ? 3 : found.level === 'INTERMEDIATE' ? 1.5 : 0);
        }
      }
      const count = counts.get(m.id) ?? 0;
      score -= count * 3;
      if (score > bestScore) {
        bestScore = score;
        best = m;
        bestReason = matched.length ? `Good at ${[...new Set(matched)].join(', ')}` : 'Keeps the work even';
      }
    }
    counts.set(best.id, (counts.get(best.id) ?? 0) + 1);
    return { ...task, suggestedAssigneeId: best.id, suggestedAssigneeName: best.name, suggestedAssigneeReason: bestReason };
  });
}

/** Cleans the AI's tasks: known priorities, sensible hours and days, short text, at most MAX_TASKS. */
function cleanAiTasks(raw: unknown, targetDays: number): Draft[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_TASKS).flatMap((t): Draft[] => {
    const o = (t ?? {}) as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim().slice(0, 80) : '';
    if (!title) return [];
    const priority = PRIORITIES.find((p) => p === o.priority) ?? 'MEDIUM';
    const skills = Array.isArray(o.requiredSkills) ? o.requiredSkills.filter((s): s is string => typeof s === 'string').map((s) => s.trim().slice(0, 30)).filter(Boolean).slice(0, 4) : [];
    return [{
      title,
      notes: typeof o.notes === 'string' ? o.notes.trim().slice(0, 500) : '',
      priority,
      estimateHours: Math.min(40, Math.max(1, Math.round(Number(o.estimateHours) || 4))),
      requiredSkills: skills.length ? skills : inferSkillsFromText(title),
      dueDaysFromStart: Math.min(targetDays, Math.max(1, Math.round(Number(o.dueDaysFromStart) || targetDays))),
    }];
  });
}

// ─── Meeting times ───────────────────────────────────────────────────────────────────────────────

/** Weekday meeting times ranked by how many members are free (from their classes' timetable). */
export async function findCommonMeetingSlots(memberIds: string[]): Promise<MeetingSlotCandidate[]> {
  if (!memberIds.length) return [];
  const ids = memberIds.slice(0, 50);
  const [enrollments, users] = await Promise.all([
    prisma.enrollment.findMany({ where: { studentId: { in: ids } }, select: { studentId: true, courseId: true }, take: 500 }),
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  const courseIds = [...new Set(enrollments.map((e) => e.courseId))];
  const timetable = courseIds.length
    ? (await Promise.all(Array.from({ length: Math.ceil(courseIds.length / 90) }, (_, i) => prisma.timetableSlot.findMany({
        where: { courseId: { in: courseIds.slice(i * 90, i * 90 + 90) } },
        select: { courseId: true, dayOfWeek: true, startTime: true, endTime: true, course: { select: { code: true } } },
        take: 500,
      })))).flat()
    : [];

  const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const busy = new Map<string, { day: number; start: number; end: number; reason: string }[]>(ids.map((id) => [id, []]));
  for (const e of enrollments) {
    for (const s of timetable) if (s.courseId === e.courseId) busy.get(e.studentId)?.push({ day: s.dayOfWeek, start: minutes(s.startTime), end: minutes(s.endTime), reason: `${s.course.code} class` });
  }

  const results: MeetingSlotCandidate[] = [];
  for (let day = 0; day <= 4; day++) {
    for (const slot of STANDARD_SLOTS) {
      const start = minutes(slot.startTime), end = minutes(slot.endTime);
      const available: string[] = [];
      const conflicts: MeetingSlotCandidate['conflicts'] = [];
      for (const id of ids) {
        const clash = busy.get(id)?.find((b) => b.day === day && Math.max(start, b.start) < Math.min(end, b.end));
        if (clash) conflicts.push({ userId: id, userName: names.get(id) ?? 'Member', reason: clash.reason });
        else available.push(id);
      }
      const score = Math.round((available.length / ids.length) * 100);
      results.push({ dayOfWeek: day, dayName: DAY_NAMES[day], startTime: slot.startTime, endTime: slot.endTime, availableMemberIds: available, totalMembers: ids.length, conflicts, score });
    }
  }
  // Most people free first; among equals, afternoons (they suit group work), then earlier in the week.
  const afternoon = (s: MeetingSlotCandidate) => (s.startTime >= '14:00' && s.startTime <= '16:00' ? 1 : 0);
  return results.sort((a, b) => b.score - a.score || afternoon(b) - afternoon(a) || a.dayOfWeek - b.dayOfWeek);
}

// ─── Fair contribution (pure) ────────────────────────────────────────────────────────────────────

/** Progress and fairness from the board's tasks: who has what, what's done, what's late. */
export function contributionSummary(
  tasks: { id: string; title: string; assigneeId: string | null; doneAt: Date | null; dueAt: Date | null; estimate: number | null }[],
  people: { id: string; name: string; avatar: string | null }[],
  now: number,
): ContributionSummary {
  const late = (t: (typeof tasks)[number]) => !t.doneAt && !!t.dueAt && t.dueAt.getTime() < now;
  const hours = (t: (typeof tasks)[number]) => (t.estimate && t.estimate > 0 ? t.estimate : 1);
  const n = Math.max(1, people.length);
  const even = 1 / n;
  const completedTasks = tasks.filter((t) => t.doneAt).length;
  const totalHours = tasks.filter((t) => t.doneAt && t.assigneeId).reduce((s, t) => s + hours(t), 0);

  const members = people.map((p): MemberContributionStat => {
    const mine = tasks.filter((t) => t.assigneeId === p.id);
    const done = mine.filter((t) => t.doneAt);
    const hoursDone = done.reduce((s, t) => s + hours(t), 0);
    const share = totalHours ? hoursDone / totalHours : 0;
    const overdue = mine.filter(late).length;
    // Only judge shares once there's enough finished work to compare (one task per person).
    const enough = completedTasks >= n;
    const status: MemberContributionStat['status'] = overdue >= 2 || (enough && n > 1 && share < even / 2)
      ? 'UNDER_CONTRIBUTING'
      : enough && n > 2 && share > even * 2 ? 'OVERLOADED' : 'BALANCED';
    return { userId: p.id, name: p.name, avatar: p.avatar, tasksAssigned: mine.length, tasksCompleted: done.length, tasksOverdue: overdue, hoursDone, contributionSharePercent: Math.round(share * 100), status };
  });

  // Fairness needs enough finished work to compare: at least one task per person.
  let fairContributionScore: number | null = null;
  if (totalHours > 0 && completedTasks >= n) {
    if (n === 1) fairContributionScore = 1;
    else {
      const deviation = members.reduce((s, m) => s + Math.abs(m.hoursDone / totalHours - even), 0);
      fairContributionScore = Math.round((1 - deviation / (2 * (1 - even))) * 100) / 100;
    }
  }

  const overdueTasks = tasks.filter(late).length;
  const behind = members.some((m) => m.status === 'UNDER_CONTRIBUTING');
  const health: ContributionSummary['health'] = overdueTasks >= Math.max(2, Math.ceil(tasks.length * 0.4))
    ? 'OFF_TRACK'
    : overdueTasks >= 1 || behind ? 'AT_RISK' : 'ON_TRACK';
  const named = new Map(people.map((p) => [p.id, p.name]));
  const nudgesRecommended = tasks.filter((t) => late(t) && t.assigneeId && named.has(t.assigneeId)).map((t) => ({
    taskId: t.id, taskTitle: t.title, userId: t.assigneeId!, userName: named.get(t.assigneeId!)!, reason: 'Past its due date and not done yet.',
  }));
  return { totalTasks: tasks.length, completedTasks, overdueTasks, members, fairContributionScore, health, nudgesRecommended };
}

// ─── Plans ───────────────────────────────────────────────────────────────────────────────────────

const parse = <T,>(json: string | null | undefined, fallback: T): T => { try { return json ? (JSON.parse(json) as T) : fallback; } catch { return fallback; } };

async function member(groupId: string, user: SessionUser) {
  const g = await groupAccess(groupId, user);
  if (!g) throw new NotFoundException('Group not found.');
  return g;
}

async function memberIds(groupId: string) {
  return (await prisma.groupMembership.findMany({ where: { groupId }, select: { userId: true }, take: 50 })).map((m) => m.userId);
}

/** The group's latest plan (a draft or the one on the board) and the best meeting times. */
export async function planView(groupId: string, user: SessionUser) {
  await member(groupId, user);
  const [plan, ids] = await Promise.all([
    prisma.groupAutopilotPlan.findFirst({
      where: { groupId, status: { in: ['DRAFT', 'ACTIVE'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, brief: true, status: true, targetDueDate: true, meetingSlot: true, breakdownJson: true, createdAt: true, updatedAt: true,
        course: { select: { id: true, code: true, name: true } },
        board: { select: { id: true, title: true } },
        scheduledCall: { select: { id: true, title: true, startAt: true, durationMin: true } },
      },
    }),
    memberIds(groupId),
  ]);
  const slots = await findCommonMeetingSlots(ids);
  return {
    plan: plan ? { ...plan, breakdownJson: undefined, breakdown: parse<AutopilotTaskDraft[]>(plan.breakdownJson, []), meetingSlot: parse<MeetingSlotCandidate | null>(plan.meetingSlot, null) } : null,
    candidateMeetingSlots: slots.slice(0, 5),
  };
}

/** Makes (or remakes) the group's draft plan from a brief. */
export async function makePlan(groupId: string, user: SessionUser, input: { title?: unknown; brief?: unknown; targetDueDate?: unknown; courseId?: unknown }) {
  await member(groupId, user);
  // The course this project is for (one the person takes or teaches): its teacher sees the reports.
  const courseId = typeof input.courseId === 'string' && input.courseId ? input.courseId : null;
  if (courseId && !(await courseAccess(courseId, user))) throw new BadRequestException('Pick one of your own courses.');
  const title = (typeof input.title === 'string' ? input.title.trim().slice(0, 120) : '') || 'Group project';
  const brief = typeof input.brief === 'string' ? input.brief.trim().slice(0, 4000) : '';
  if (brief.length < 10) throw new BadRequestException('Paste the assignment brief (at least a sentence) so Autopilot can split it into tasks.');
  const due = typeof input.targetDueDate === 'string' && input.targetDueDate ? new Date(input.targetDueDate) : null;
  if (due && (Number.isNaN(due.getTime()) || due.getTime() < Date.now() - DAY)) throw new BadRequestException('Pick a due date that hasn’t passed.');
  const targetDays = due ? Math.min(180, Math.max(3, Math.round((due.getTime() - Date.now()) / DAY))) : 21;

  const memberships = await prisma.groupMembership.findMany({
    where: { groupId },
    select: { user: { select: { id: true, name: true, skills: { select: { name: true, level: true }, take: 30 } } } },
    take: 50,
  });
  const members: Member[] = memberships.map((m) => ({ id: m.user.id, name: m.user.name, skills: m.user.skills.map((s) => ({ name: s.name, level: String(s.level) })) }));

  // One AI request when AI is on and the person has some left today; otherwise the rules.
  // The AI sees the brief and the team's skills, never names.
  let tasks: AutopilotTaskDraft[] = [];
  let aiUsed = false;
  if (process.env.GEMINI_API_KEY && !(await featureOff('ai')) && (await spendAi(user)).ok) {
    const skills = [...new Set(members.flatMap((m) => m.skills.map((s) => s.name)))].slice(0, 40);
    const ai = await geminiJson<{ tasks: unknown }>(
      'You plan student group projects. Split the brief into 4 to 6 balanced, concrete tasks a student team can each own. Keep titles short. Spread due days across the time available.',
      `Project: ${title}\nDays available: ${targetDays}\nTeam size: ${members.length}\nSkills in the team: ${skills.join(', ') || 'not listed'}\n<brief>\n${brief.replace(/<\/?brief>/gi, '')}\n</brief>`,
      {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' }, notes: { type: 'string' }, priority: { type: 'string', enum: [...PRIORITIES] },
                estimateHours: { type: 'number' }, requiredSkills: { type: 'array', items: { type: 'string' } }, dueDaysFromStart: { type: 'number' },
              },
              required: ['title', 'notes', 'priority', 'estimateHours', 'requiredSkills', 'dueDaysFromStart'],
            },
          },
        },
        required: ['tasks'],
      },
      1200,
    ).catch(() => null);
    const drafts = cleanAiTasks(ai?.tasks, targetDays);
    if (drafts.length >= 2 && members.length) { tasks = assignTasksBySkills(drafts, members); aiUsed = true; }
  }
  if (!tasks.length) tasks = splitBriefAndMatchSkills(brief, members, targetDays);

  const slots = await findCommonMeetingSlots(members.map((m) => m.id));
  const best = slots[0] ?? null;
  const data = {
    title, brief, targetDueDate: due, courseId,
    meetingSlot: best ? JSON.stringify({ dayOfWeek: best.dayOfWeek, dayName: best.dayName, startTime: best.startTime, endTime: best.endTime }) : null,
    breakdownJson: JSON.stringify(tasks),
  };
  // One draft at a time: remaking replaces it. A plan already on the board stays until a new one is applied.
  const draft = await prisma.groupAutopilotPlan.findFirst({ where: { groupId, status: 'DRAFT' }, select: { id: true } });
  const plan = draft
    ? await prisma.groupAutopilotPlan.update({ where: { id: draft.id }, data, select: { id: true } })
    : await prisma.groupAutopilotPlan.create({ data: { ...data, groupId, status: 'DRAFT', createdById: user.id }, select: { id: true } });
  publish(await groupPeople(groupId), { type: 'refresh', keys: [`/api/groups/${groupId}/autopilot/plan`] });
  return { planId: plan.id, aiUsed, tasks: tasks.length };
}

/**
 * Puts a draft plan's tasks on the group's Tasks board, and schedules the weekly call when the
 * browser sends the chosen time (`startAt`, worked out in the person's own time zone).
 */
export async function applyPlan(groupId: string, user: SessionUser, input: { planId?: unknown; startAt?: unknown; slot?: unknown }) {
  const g = await member(groupId, user);
  const planId = typeof input.planId === 'string' ? input.planId : '';
  const plan = await prisma.groupAutopilotPlan.findFirst({ where: { id: planId, groupId }, select: { id: true, title: true, status: true, breakdownJson: true } });
  if (!plan) throw new NotFoundException('That plan isn’t there any more. Make a new one.');
  if (plan.status !== 'DRAFT') throw new ConflictException('This plan is already on the board.');

  const ids = new Set(await memberIds(groupId));
  const tasks = parse<AutopilotTaskDraft[]>(plan.breakdownJson, []).slice(0, MAX_TASKS);
  if (!tasks.length) throw new BadRequestException('This plan has no tasks. Make it again.');

  // The group's board, or a new one with the usual lists.
  let board = await prisma.taskBoard.findFirst({ where: { groupId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!board) {
    board = await prisma.taskBoard.create({ data: { title: `${g.group.name} · Tasks`.slice(0, 80), ownerId: user.id, groupId }, select: { id: true } });
    await prisma.taskList.createMany({ data: ['To do', 'Doing', 'Done'].map((t, i) => ({ boardId: board!.id, title: t, position: i + 1 })) });
  }
  const list = await prisma.taskList.findFirst({ where: { boardId: board.id }, orderBy: { position: 'asc' }, select: { id: true } });
  if (!list) throw new BadRequestException('The group’s board has no lists. Add one on the board first.');
  if ((await prisma.task.count({ where: { boardId: board.id } })) + tasks.length > 500) throw new BadRequestException('The group’s board is full (500 cards).');
  const last = await prisma.task.findFirst({ where: { listId: list.id }, orderBy: { position: 'desc' }, select: { position: true } });

  const now = Date.now();
  const rows = tasks.map((t, i) => ({
    boardId: board!.id,
    listId: list.id,
    title: t.title.slice(0, 200),
    notes: [t.notes, t.suggestedAssigneeReason && t.suggestedAssigneeName ? `Suggested for ${t.suggestedAssigneeName}: ${t.suggestedAssigneeReason}.` : ''].filter(Boolean).join('\n\n').slice(0, 2000),
    priority: PRIORITIES.includes(t.priority) ? t.priority : 'MEDIUM',
    estimate: Math.min(40, Math.max(1, Number(t.estimateHours) || 1)),
    assigneeId: t.suggestedAssigneeId && ids.has(t.suggestedAssigneeId) ? t.suggestedAssigneeId : null,
    dueAt: new Date(now + Math.max(1, Number(t.dueDaysFromStart) || 7) * DAY),
    position: (last?.position ?? 0) + i + 1,
    createdById: user.id,
  }));
  // 10 values a card: 8 cards per insert stays under D1's 100 bound values.
  for (let i = 0; i < rows.length; i += 8) await prisma.task.createMany({ data: rows.slice(i, i + 8) });

  // The weekly call, at the time the person picked (scheduleCall checks the time and tells the group).
  let callId: string | null = null;
  if (typeof input.startAt === 'string' && input.startAt) {
    const startAt = new Date(input.startAt);
    if (Number.isNaN(startAt.getTime()) || startAt.getTime() > now + 15 * DAY) throw new BadRequestException('Pick a meeting time in the next two weeks.');
    const call = await scheduleCall(user, { room: 'group', roomId: groupId, startAt: startAt.toISOString(), durationMin: 45, kind: 'video', title: `${plan.title} · team meeting` });
    callId = (call as { id?: string }).id ?? null;
  }
  const slot = input.slot && typeof input.slot === 'object' ? input.slot as Record<string, unknown> : null;
  const chosen = slot && typeof slot.dayOfWeek === 'number' && typeof slot.startTime === 'string'
    ? JSON.stringify({ dayOfWeek: slot.dayOfWeek, dayName: DAY_NAMES[slot.dayOfWeek] ?? '', startTime: String(slot.startTime).slice(0, 5), endTime: String(slot.endTime ?? '').slice(0, 5) })
    : undefined;

  // This plan is now the group's plan; an earlier one is archived.
  await prisma.groupAutopilotPlan.updateMany({ where: { groupId, status: 'ACTIVE' }, data: { status: 'ARCHIVED' } });
  await prisma.groupAutopilotPlan.update({ where: { id: plan.id }, data: { status: 'ACTIVE', boardId: board.id, ...(callId ? { scheduledCallId: callId } : {}), ...(chosen ? { meetingSlot: chosen } : {}) } });
  await prisma.taskBoard.update({ where: { id: board.id }, data: { updatedAt: new Date() } }).catch(() => {});

  const people = [...ids];
  publish(people, { type: 'refresh', keys: [`/api/tasks/${board.id}`, '/api/tasks', `/api/groups/${groupId}/autopilot/plan`] });
  const owners = [...new Set(rows.map((r) => r.assigneeId).filter((x): x is string => !!x && x !== user.id))];
  if (owners.length) await notifyMany(owners, { type: 'reminder', title: `${user.name} planned “${plan.title}”`, body: 'You have tasks on the group’s board. Open it to see what’s yours and when it’s due.', link: `/tasks/${board.id}`, email: false });
  return { ok: true, boardId: board.id, tasksCreated: rows.length, callScheduled: !!callId };
}

// ─── Weekly report and nudges ────────────────────────────────────────────────────────────────────

async function activePlan(groupId: string) {
  const plan = await prisma.groupAutopilotPlan.findFirst({ where: { groupId, status: 'ACTIVE' }, orderBy: { updatedAt: 'desc' }, select: { id: true, title: true, boardId: true, createdAt: true } });
  if (!plan?.boardId) throw new NotFoundException('Put a plan on the board first.');
  return plan as typeof plan & { boardId: string };
}

type ReportPlan = { id: string; title: string; groupId: string; boardId: string; createdAt: Date };

/** Whether a plan is in the last two days of one of its weeks (when its weekly report is made). */
export const weeklyReportDue = (createdAt: Date, now: number) => Math.floor((now - createdAt.getTime()) / DAY) % 7 >= 5;
const weekOf = (plan: { createdAt: Date }, now: number) => Math.floor((now - plan.createdAt.getTime()) / (7 * DAY)) + 1;

/** Works out and saves this week's report for a plan (updating it if this week already has one). */
async function buildReport(plan: ReportPlan, now = Date.now()) {
  const [tasks, people] = await Promise.all([
    prisma.task.findMany({ where: { boardId: plan.boardId }, select: { id: true, title: true, assigneeId: true, doneAt: true, dueAt: true, estimate: true }, take: 500 }),
    prisma.groupMembership.findMany({ where: { groupId: plan.groupId }, select: { user: { select: { id: true, name: true, avatar: true } } }, take: 50 }).then((r) => r.map((m) => m.user)),
  ]);
  const s = contributionSummary(tasks, people, now);
  const weekNumber = weekOf(plan, now);
  const words = { ON_TRACK: 'on track', AT_RISK: 'at risk', OFF_TRACK: 'off track' }[s.health];
  const summary = `Week ${weekNumber}: ${s.completedTasks} of ${s.totalTasks} tasks done${s.overdueTasks ? `, ${s.overdueTasks} late` : ''}. The project is ${words}.${
    s.fairContributionScore == null ? ' Fairness shows once each member could have finished a task.' : s.members.some((m) => m.status === 'UNDER_CONTRIBUTING') ? ' Some members need a hand to catch up.' : ' The work is shared fairly.'}`;
  const data = {
    summary, health: s.health, fairContributionScore: s.fairContributionScore ?? 1,
    metricsJson: JSON.stringify({ members: s.members, totalTasks: s.totalTasks, completedTasks: s.completedTasks, overdueTasks: s.overdueTasks, fair: s.fairContributionScore }),
    nudgesJson: JSON.stringify(s.nudgesRecommended),
  };
  const existing = await prisma.groupAutopilotReport.findFirst({ where: { planId: plan.id, weekNumber }, select: { id: true } });
  const saved = existing
    ? await prisma.groupAutopilotReport.update({ where: { id: existing.id }, data, select: { id: true, createdAt: true } })
    : await prisma.groupAutopilotReport.create({ data: { ...data, planId: plan.id, groupId: plan.groupId, weekNumber }, select: { id: true, createdAt: true } });
  publish(people.map((p) => p.id), { type: 'refresh', keys: [`/api/groups/${plan.groupId}/autopilot/reports`] });
  return { report: { id: saved.id, planId: plan.id, weekNumber, summary, ...s, generatedAt: saved.createdAt.toISOString() }, people: people.map((p) => p.id) };
}

/** This week's report for the group's plan (made again if asked again in the same week). */
export async function progressReport(groupId: string, user: SessionUser) {
  await member(groupId, user);
  const plan = await activePlan(groupId);
  return (await buildReport({ ...plan, groupId })).report;
}

// ─── The teacher's view (Course board → Group projects) ──────────────────────────────────────────

async function teacherOf(courseId: string, user: SessionUser) {
  const access = await courseAccess(courseId, user);
  if (!access?.canManage) throw new NotFoundException('Course not found.');
}

/** The group projects linked to a course, each with its latest report. */
export async function courseProjects(courseId: string, user: SessionUser) {
  await teacherOf(courseId, user);
  const plans = await prisma.groupAutopilotPlan.findMany({
    where: { courseId, status: 'ACTIVE' },
    orderBy: { updatedAt: 'desc' },
    take: 60,
    select: {
      id: true, title: true, targetDueDate: true, createdAt: true, boardId: true,
      group: { select: { id: true, name: true, _count: { select: { members: true } } } },
      reports: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  return plans.map(({ reports, ...p }) => {
    const r = reports[0];
    return { ...p, report: r ? { id: r.id, weekNumber: r.weekNumber, summary: r.summary, health: r.health, createdAt: r.createdAt, metrics: parse<Record<string, unknown>>(r.metricsJson, {}) } : null };
  });
}

/** The teacher asks for an up-to-date report for one of the course's group projects. */
export async function refreshCourseProject(courseId: string, user: SessionUser, planIdRaw: unknown) {
  await teacherOf(courseId, user);
  const planId = typeof planIdRaw === 'string' ? planIdRaw : '';
  const plan = await prisma.groupAutopilotPlan.findFirst({ where: { id: planId, courseId, status: 'ACTIVE' }, select: { id: true, title: true, groupId: true, boardId: true, createdAt: true } });
  if (!plan?.boardId) throw new NotFoundException('That project isn’t linked to this course any more.');
  return (await buildReport(plan as ReportPlan)).report;
}

// ─── Weekly reports by themselves (daily job) ────────────────────────────────────────────────────

/**
 * For plans on a board, makes the week's report near the end of each plan week (its last two days,
 * so a missed run still catches it), tells the group in the app, and tells the course's teacher when
 * a linked project is at risk or off track. At most `limit` reports a run.
 */
export async function weeklyAutopilotReports({ limit = 25, now = Date.now() } = {}) {
  const plans = (await prisma.groupAutopilotPlan.findMany({
    where: { status: 'ACTIVE', boardId: { not: null } },
    orderBy: { updatedAt: 'asc' },
    take: 300,
    select: { id: true, title: true, groupId: true, boardId: true, createdAt: true, courseId: true, group: { select: { name: true } }, course: { select: { teacherId: true } } },
  })).filter((p) => weeklyReportDue(p.createdAt, now));
  if (!plans.length) return { made: 0 };
  const done = new Set((await Promise.all(Array.from({ length: Math.ceil(plans.length / 45) }, (_, i) => {
    const part = plans.slice(i * 45, i * 45 + 45);
    // 2 values a plan: under D1's 100 bound values.
    return prisma.groupAutopilotReport.findMany({ where: { OR: part.map((p) => ({ planId: p.id, weekNumber: weekOf(p, now) })) }, select: { planId: true } });
  }))).flat().map((r) => r.planId));
  const due = plans.filter((p) => !done.has(p.id)).slice(0, limit);

  let made = 0;
  for (const p of due) {
    try {
      const { report: r, people } = await buildReport(p as ReportPlan, now);
      made++;
      const words = { ON_TRACK: 'on track', AT_RISK: 'at risk', OFF_TRACK: 'off track' }[r.health];
      await notifyMany(people, { type: 'info', title: `Week ${r.weekNumber} report: ${p.title}`, body: `${r.completedTasks} of ${r.totalTasks} tasks done${r.overdueTasks ? `, ${r.overdueTasks} late` : ''}. The project is ${words}. Open the group’s Project autopilot to see more.`, link: '/student/groups', email: false });
      if (p.courseId && p.course?.teacherId && r.health !== 'ON_TRACK') {
        await notify(p.course.teacherId, { type: 'info', title: `${p.group.name}: “${p.title}” is ${words}`, body: r.summary, link: `/teacher/blackboard?course=${p.courseId}&tab=projects`, email: false });
      }
    } catch (e) {
      console.error('autopilot weekly report failed:', p.id, e);
    }
  }
  return { made };
}

/** The group's reports, newest first. */
export async function listReports(groupId: string, user: SessionUser) {
  await member(groupId, user);
  const reports = await prisma.groupAutopilotReport.findMany({ where: { groupId }, orderBy: { createdAt: 'desc' }, take: 12 });
  return reports.map(({ metricsJson, nudgesJson, ...r }) => ({ ...r, metrics: parse<Record<string, unknown>>(metricsJson, {}), nudges: parse<unknown[]>(nudgesJson, []) }));
}

/** Reminds a teammate about their unfinished task on the plan's board (once a day per task). */
export async function nudge(groupId: string, user: SessionUser, taskIdRaw: unknown) {
  const g = await member(groupId, user);
  const plan = await activePlan(groupId);
  const taskId = typeof taskIdRaw === 'string' ? taskIdRaw : '';
  const task = await prisma.task.findFirst({ where: { id: taskId, boardId: plan.boardId }, select: { id: true, title: true, assigneeId: true, doneAt: true } });
  if (!task) throw new NotFoundException('That task isn’t on the group’s board.');
  if (task.doneAt) throw new BadRequestException('That task is already done.');
  if (!task.assigneeId) throw new BadRequestException('Nobody has that task yet.');
  if (task.assigneeId === user.id) throw new BadRequestException('That’s your own task.');
  const link = `/tasks/${plan.boardId}?task=${task.id}`;
  if (await prisma.notification.findFirst({ where: { userId: task.assigneeId, link, type: 'nudge', createdAt: { gt: new Date(Date.now() - DAY) } }, select: { id: true } })) {
    throw new HttpException('They were reminded about this task in the last day.', 429);
  }
  await notify(task.assigneeId, {
    type: 'nudge',
    title: `${user.name} is checking on “${task.title}”`,
    body: `Your group “${g.group.name}” is waiting on this task. Update it on the board, or say what’s blocking you.`,
    link,
    email: false,
  });
  return { ok: true };
}
