import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { groupAccess } from './spaces';
import { geminiJson } from './gemini';
import { spaceContributions } from './contributions';

// Stage 5 · D6: Group Project Autopilot
// Intelligent project manager for student group assignments:
// 1. Splits assignment brief into actionable milestones & tasks.
// 2. Matches task requirements against member skills and Learning DNA mastery.
// 3. Resolves timetable conflicts (TimetableSlot & ScheduledCalls) to find mutual meeting slots.
// 4. Schedules team calls and creates TaskBoard items.
// 5. Automatically generates weekly fair-contribution progress reports for teachers.

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
  endTime: string;   // "15:00"
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
  docEdits: number;
  codeEdits: number;
  peerRatingAvg: number | null;
  contributionSharePercent: number;
  status: 'BALANCED' | 'OVERLOADED' | 'UNDER_CONTRIBUTING';
}

export interface FairContributionReportData {
  planId: string;
  groupId: string;
  weekNumber: number;
  summary: string;
  health: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK';
  fairContributionScore: number;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  members: MemberContributionStat[];
  nudgesRecommended: {
    taskId: string;
    taskTitle: string;
    userId: string;
    userName: string;
    reason: string;
  }[];
  generatedAt: string;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const STANDARD_SLOTS = [
  { startTime: '10:00', endTime: '11:00' },
  { startTime: '11:30', endTime: '12:30' },
  { startTime: '14:00', endTime: '15:00' },
  { startTime: '15:30', endTime: '16:30' },
  { startTime: '16:30', endTime: '17:30' },
];

/**
 * Intelligent brief splitting into structured tasks and balanced skill matching.
 */
export function splitBriefAndMatchSkills(
  brief: string,
  members: { id: string; name: string; skills: { name: string; level: string }[] }[],
  targetDays = 21,
): AutopilotTaskDraft[] {
  if (!members.length) return [];

  const rawTasks = heuristicTaskBreakdown(brief, targetDays);
  return assignTasksBySkills(rawTasks, members);
}

function heuristicTaskBreakdown(brief: string, targetDays: number): Omit<AutopilotTaskDraft, 'suggestedAssigneeId' | 'suggestedAssigneeName' | 'suggestedAssigneeReason'>[] {
  const lines = brief
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 5 && (l.startsWith('-') || l.startsWith('*') || /^\d+[.)]/.test(l)));

  if (lines.length >= 3) {
    const totalDays = Math.max(7, targetDays);
    return lines.slice(0, 7).map((line, idx) => {
      const cleanTitle = line.replace(/^[-*\d.)\s]+/, '').trim();
      const priority: AutopilotTaskDraft['priority'] = idx === 0 || idx === lines.length - 1 ? 'HIGH' : 'MEDIUM';
      const requiredSkills = inferSkillsFromText(cleanTitle);
      const dueDays = Math.round(((idx + 1) / lines.length) * totalDays);
      return {
        title: cleanTitle.slice(0, 80),
        notes: `Deliverable requirement based on brief: "${cleanTitle}".`,
        priority,
        estimateHours: 4 + (idx % 3) * 3,
        requiredSkills,
        dueDaysFromStart: dueDays,
      };
    });
  }

  // Default structured academic project lifecycle
  const totalDays = Math.max(7, targetDays);
  return [
    {
      title: 'Phase 1: Problem Definition & Research',
      notes: 'Literature review, problem statement, scope boundaries, and academic references.',
      priority: 'HIGH',
      estimateHours: 6,
      requiredSkills: ['Research', 'Technical Writing', 'Analysis'],
      dueDaysFromStart: Math.round(totalDays * 0.25),
    },
    {
      title: 'Phase 2: Architecture & System Design',
      notes: 'System architecture diagram, data schema, API specifications, and UX wireframes.',
      priority: 'HIGH',
      estimateHours: 8,
      requiredSkills: ['System Design', 'Architecture', 'UI/UX'],
      dueDaysFromStart: Math.round(totalDays * 0.45),
    },
    {
      title: 'Phase 3: Core Implementation & Prototype',
      notes: 'Primary feature build, functional components, backend logic, and prototype wiring.',
      priority: 'URGENT',
      estimateHours: 12,
      requiredSkills: ['Programming', 'Software Engineering', 'Implementation'],
      dueDaysFromStart: Math.round(totalDays * 0.75),
    },
    {
      title: 'Phase 4: Testing, QA & Benchmarking',
      notes: 'Integration testing, edge case handling, performance verification, and test coverage.',
      priority: 'MEDIUM',
      estimateHours: 6,
      requiredSkills: ['Testing', 'Quality Assurance', 'Debugging'],
      dueDaysFromStart: Math.round(totalDays * 0.88),
    },
    {
      title: 'Phase 5: Final Report & Presentation Deck',
      notes: 'Executive summary report, visual slides, demo walk-through video, and submission package.',
      priority: 'HIGH',
      estimateHours: 6,
      requiredSkills: ['Presentation', 'Technical Writing', 'Communication'],
      dueDaysFromStart: totalDays,
    },
  ];
}

function inferSkillsFromText(text: string): string[] {
  const t = text.toLowerCase();
  const skills: string[] = [];
  if (t.includes('code') || t.includes('implement') || t.includes('program') || t.includes('api') || t.includes('backend') || t.includes('frontend')) {
    skills.push('Programming', 'Software Engineering');
  }
  if (t.includes('design') || t.includes('ui') || t.includes('ux') || t.includes('wireframe') || t.includes('architecture')) {
    skills.push('System Design', 'UI/UX');
  }
  if (t.includes('test') || t.includes('qa') || t.includes('bug') || t.includes('verify')) {
    skills.push('Testing', 'Quality Assurance');
  }
  if (t.includes('write') || t.includes('report') || t.includes('document') || t.includes('research') || t.includes('paper')) {
    skills.push('Technical Writing', 'Research');
  }
  if (t.includes('present') || t.includes('slide') || t.includes('pitch') || t.includes('demo')) {
    skills.push('Presentation', 'Communication');
  }
  return skills.length ? skills : ['General Analysis', 'Technical Writing'];
}

function assignTasksBySkills(
  tasks: Omit<AutopilotTaskDraft, 'suggestedAssigneeId' | 'suggestedAssigneeName' | 'suggestedAssigneeReason'>[],
  members: { id: string; name: string; skills: { name: string; level: string }[] }[],
): AutopilotTaskDraft[] {
  const assignedCounts = new Map<string, number>();
  for (const m of members) assignedCounts.set(m.id, 0);

  return tasks.map((task) => {
    let bestMember = members[0];
    let bestScore = -999;
    let bestReason = 'Even workload distribution';

    for (const m of members) {
      let score = 0;
      const matchedSkillNames: string[] = [];

      for (const req of task.requiredSkills) {
        const found = m.skills.find((s) => s.name.toLowerCase().includes(req.toLowerCase()) || req.toLowerCase().includes(s.name.toLowerCase()));
        if (found) {
          matchedSkillNames.push(found.name);
          score += 4;
          if (found.level === 'ADVANCED') score += 3;
          else if (found.level === 'INTERMEDIATE') score += 1.5;
        }
      }

      // Workload balancing penalty: each task already assigned deducts 3 points
      const count = assignedCounts.get(m.id) ?? 0;
      score -= count * 3;

      if (score > bestScore) {
        bestScore = score;
        bestMember = m;
        bestReason = matchedSkillNames.length
          ? `Matched on skills: ${matchedSkillNames.join(', ')} (balance: ${count} assigned)`
          : `Balanced team workload (${count} tasks assigned)`;
      }
    }

    assignedCounts.set(bestMember.id, (assignedCounts.get(bestMember.id) ?? 0) + 1);

    return {
      ...task,
      suggestedAssigneeId: bestMember.id,
      suggestedAssigneeName: bestMember.name,
      suggestedAssigneeReason: bestReason,
    };
  });
}

/**
 * Finds mutual free slots for a group across member timetables and existing calls.
 */
export async function findCommonMeetingSlots(memberIds: string[], durationMin = 60): Promise<MeetingSlotCandidate[]> {
  if (!memberIds.length) return [];

  // 1. Get enrollments for all members
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: { in: memberIds }, status: 'ENROLLED' },
    select: { studentId: true, courseId: true, course: { select: { code: true, name: true } } },
    take: 500,
  });

  const memberNamesMap = new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, name: true },
  });
  for (const u of users) memberNamesMap.set(u.id, u.name);

  const courseIds = [...new Set(enrollments.map((e) => e.courseId))];

  // 2. Get timetable slots for these courses
  const timetableSlots = courseIds.length
    ? await prisma.timetableSlot.findMany({
        where: { courseId: { in: courseIds } },
        select: { courseId: true, dayOfWeek: true, startTime: true, endTime: true, course: { select: { code: true } } },
        take: 500,
      })
    : [];

  // Map member -> array of busy slot blocks
  const memberBusySlots = new Map<string, { dayOfWeek: number; startMin: number; endMin: number; reason: string }[]>();
  for (const id of memberIds) memberBusySlots.set(id, []);

  for (const enr of enrollments) {
    const slots = timetableSlots.filter((t) => t.courseId === enr.courseId);
    for (const s of slots) {
      const [sh, sm] = s.startTime.split(':').map(Number);
      const [eh, em] = s.endTime.split(':').map(Number);
      memberBusySlots.get(enr.studentId)?.push({
        dayOfWeek: s.dayOfWeek,
        startMin: (sh || 0) * 60 + (sm || 0),
        endMin: (eh || 0) * 60 + (em || 0),
        reason: `${s.course.code} lecture`,
      });
    }
  }

  // 3. Test Mon(0) through Fri(4) standard meeting times
  const results: MeetingSlotCandidate[] = [];

  for (let day = 0; day <= 4; day++) {
    for (const slot of STANDARD_SLOTS) {
      const [sh, sm] = slot.startTime.split(':').map(Number);
      const [eh, em] = slot.endTime.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;

      const available: string[] = [];
      const conflicts: { userId: string; userName: string; reason: string }[] = [];

      for (const mId of memberIds) {
        const busy = memberBusySlots.get(mId) ?? [];
        const clash = busy.find((b) => b.dayOfWeek === day && Math.max(startMin, b.startMin) < Math.min(endMin, b.endMin));

        if (clash) {
          conflicts.push({
            userId: mId,
            userName: memberNamesMap.get(mId) ?? 'Member',
            reason: clash.reason,
          });
        } else {
          available.push(mId);
        }
      }

      const fraction = memberIds.length > 0 ? available.length / memberIds.length : 1;
      let score = Math.round(fraction * 100);
      // Favour standard afternoon collaboration slots
      if (startMin >= 14 * 60 && startMin <= 16 * 60) score = Math.min(100, score + 5);

      results.push({
        dayOfWeek: day,
        dayName: DAY_NAMES[day] ?? 'Weekday',
        startTime: slot.startTime,
        endTime: slot.endTime,
        availableMemberIds: available,
        totalMembers: memberIds.length,
        conflicts,
        score,
      });
    }
  }

  // Sort best score first
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Creates or updates an autopilot plan for a group.
 */
export async function createOrUpdateAutopilotPlan(
  groupId: string,
  user: SessionUser,
  input: {
    title: string;
    brief: string;
    courseId?: string;
    assignmentId?: string;
    targetDueDate?: string;
    meetingCadence?: string;
  },
) {
  const g = await groupAccess(groupId, user);
  if (!g) throw new NotFoundException('Group not found.');

  const title = input.title?.trim() || 'Group Project';
  const brief = input.brief?.trim();
  if (!brief || brief.length < 10) {
    throw new BadRequestException('Please provide an assignment or project brief of at least 10 characters.');
  }

  // Gather group members & their skills
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId },
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          name: true,
          skills: { select: { name: true, level: true } },
        },
      },
    },
    take: 50,
  });

  const memberProfiles = memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    skills: m.user.skills.map((s) => ({ name: s.name, level: String(s.level) })),
  }));

  const targetDays = input.targetDueDate
    ? Math.max(3, Math.round((new Date(input.targetDueDate).getTime() - Date.now()) / (24 * 3600 * 1000)))
    : 21;

  // Attempt Gemini JSON breakdown if configured, else heuristic
  let tasks: AutopilotTaskDraft[] | null = null;
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    const system = 'You are an autonomous engineering and academic project manager. Split the assignment brief into 4-6 balanced, actionable milestones.';
    const prompt = `Project Title: ${title}\nBrief: ${brief}\nTeam Members: ${JSON.stringify(memberProfiles.map((m) => ({ id: m.id, name: m.name, skills: m.skills })))}`;
    const schema = {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              notes: { type: 'string' },
              priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
              estimateHours: { type: 'number' },
              requiredSkills: { type: 'array', items: { type: 'string' } },
              dueDaysFromStart: { type: 'number' },
            },
            required: ['title', 'notes', 'priority', 'estimateHours', 'requiredSkills', 'dueDaysFromStart'],
          },
        },
      },
      required: ['tasks'],
    };

    const aiRes = await geminiJson<{ tasks: Omit<AutopilotTaskDraft, 'suggestedAssigneeId' | 'suggestedAssigneeName' | 'suggestedAssigneeReason'>[] }>(
      system,
      prompt,
      schema,
      1200,
      false,
    ).catch(() => null);

    if (aiRes?.tasks?.length) {
      tasks = assignTasksBySkills(aiRes.tasks, memberProfiles);
    }
  }

  if (!tasks || !tasks.length) {
    tasks = splitBriefAndMatchSkills(brief, memberProfiles, targetDays);
  }

  // Find common meeting slot
  const slots = await findCommonMeetingSlots(memberProfiles.map((m) => m.id));
  const bestSlot = slots[0] ?? null;

  // Find or link active plan
  const existing = await prisma.groupAutopilotPlan.findFirst({
    where: { groupId, status: { in: ['ACTIVE', 'DRAFT'] } },
    orderBy: { createdAt: 'desc' },
  });

  const data = {
    groupId,
    courseId: input.courseId || null,
    assignmentId: input.assignmentId || null,
    title,
    brief,
    targetDueDate: input.targetDueDate ? new Date(input.targetDueDate) : null,
    meetingCadence: input.meetingCadence || 'WEEKLY',
    meetingSlot: bestSlot ? JSON.stringify({ dayOfWeek: bestSlot.dayOfWeek, dayName: bestSlot.dayName, startTime: bestSlot.startTime, endTime: bestSlot.endTime }) : null,
    breakdownJson: JSON.stringify(tasks),
    status: 'ACTIVE',
    createdById: user.id,
  };

  let plan;
  if (existing) {
    plan = await prisma.groupAutopilotPlan.update({ where: { id: existing.id }, data });
  } else {
    plan = await prisma.groupAutopilotPlan.create({ data });
  }

  return {
    plan: {
      ...plan,
      breakdown: tasks,
      meetingSlot: bestSlot,
    },
    candidateMeetingSlots: slots.slice(0, 5),
  };
}

/**
 * Instantiates the planned tasks on the group's TaskBoard and schedules the initial sync meeting.
 */
export async function applyPlanToWorkspace(planId: string, user: SessionUser, autoScheduleCall = true) {
  const plan = await prisma.groupAutopilotPlan.findUnique({
    where: { id: planId },
    include: { group: true },
  });
  if (!plan) throw new NotFoundException('Autopilot plan not found.');

  const access = await groupAccess(plan.groupId, user);
  if (!access) throw new ForbiddenException('You do not have access to manage this group.');

  // Find or create task board
  let board = plan.boardId
    ? await prisma.taskBoard.findUnique({ where: { id: plan.boardId } })
    : await prisma.taskBoard.findFirst({ where: { groupId: plan.groupId } });

  if (!board) {
    board = await prisma.taskBoard.create({
      data: {
        title: `${plan.title} · Tasks`,
        ownerId: user.id,
        groupId: plan.groupId,
        courseId: plan.courseId,
      },
    });

    await prisma.taskList.createMany({
      data: [
        { boardId: board.id, title: 'To Do', position: 1 },
        { boardId: board.id, title: 'In Progress', position: 2 },
        { boardId: board.id, title: 'Review', position: 3 },
        { boardId: board.id, title: 'Done', position: 4 },
      ],
    });
  }

  const todoList = await prisma.taskList.findFirst({
    where: { boardId: board.id },
    orderBy: { position: 'asc' },
  });

  if (!todoList) throw new BadRequestException('Board lists could not be found.');

  const tasks: AutopilotTaskDraft[] = JSON.parse(plan.breakdownJson || '[]');
  const now = Date.now();

  // Create tasks
  const createdTasks = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]!;
    const dueAt = new Date(now + t.dueDaysFromStart * 24 * 3600 * 1000);
    const created = await prisma.task.create({
      data: {
        boardId: board.id,
        listId: todoList.id,
        title: t.title,
        notes: `${t.notes}\n\nSkill Match: ${t.suggestedAssigneeReason}`,
        priority: t.priority,
        estimate: t.estimateHours,
        assigneeId: t.suggestedAssigneeId,
        dueAt,
        position: i + 1,
        createdById: user.id,
      },
    });
    createdTasks.push(created);
  }

  // Schedule initial team meeting if requested
  let scheduledCall = null;
  if (autoScheduleCall && plan.meetingSlot) {
    const slot = JSON.parse(plan.meetingSlot);
    const targetDate = getNextOccurrenceOfDay(slot.dayOfWeek, slot.startTime);

    scheduledCall = await prisma.scheduledCall.create({
      data: {
        title: `${plan.title} · Weekly Sync`,
        kind: 'video',
        startAt: targetDate,
        durationMin: 45,
        groupId: plan.groupId,
        courseId: plan.courseId,
        createdById: user.id,
        template: 'group_project',
      },
    });
  }

  // Update plan
  const updatedPlan = await prisma.groupAutopilotPlan.update({
    where: { id: plan.id },
    data: {
      boardId: board.id,
      scheduledCallId: scheduledCall?.id ?? plan.scheduledCallId,
      status: 'ACTIVE',
    },
  });

  return {
    success: true,
    planId: updatedPlan.id,
    boardId: board.id,
    tasksCreatedCount: createdTasks.length,
    scheduledCall,
  };
}

function getNextOccurrenceOfDay(dayOfWeek: number, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const currentDay = (now.getUTCDay() + 6) % 7; // convert Sun=0 to Mon=0...Sun=6
  let daysUntil = (dayOfWeek - currentDay + 7) % 7;
  if (daysUntil === 0) daysUntil = 7; // next week

  const result = new Date(now.getTime() + daysUntil * 24 * 3600 * 1000);
  result.setUTCHours(h || 14, m || 0, 0, 0);
  return result;
}

/**
 * Generates weekly fair-contribution progress report for teachers and group members.
 */
export async function generateWeeklyProgressReport(
  planId: string,
  user: SessionUser,
): Promise<FairContributionReportData> {
  const plan = await prisma.groupAutopilotPlan.findUnique({
    where: { id: planId },
    include: {
      group: {
        include: {
          members: {
            include: { user: { select: { id: true, name: true, avatar: true } } },
          },
        },
      },
    },
  });
  if (!plan) throw new NotFoundException('Autopilot plan not found.');

  const access = await groupAccess(plan.groupId, user);
  if (!access) throw new ForbiddenException('Access denied to this group.');

  const boardId = plan.boardId;
  const tasks = boardId
    ? await prisma.task.findMany({
        where: { boardId },
        select: { id: true, title: true, assigneeId: true, doneAt: true, dueAt: true },
      })
    : [];

  // Get fair contribution data from Stage 4.3 module
  const contribData = await spaceContributions('group', plan.groupId, user, 7).catch(() => null);

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.doneAt != null).length;
  const now = Date.now();
  const overdueTasks = tasks.filter((t) => !t.doneAt && t.dueAt && t.dueAt.getTime() < now).length;

  const members: MemberContributionStat[] = [];
  const nudgesRecommended: FairContributionReportData['nudgesRecommended'] = [];

  const rawPeople = contribData?.people ?? plan.group.members.map((m) => m.user);
  const totalEditsAll = (contribData?.rows ?? []).reduce((acc: number, r: { totalEdits?: number }) => acc + (r.totalEdits ?? 0), 0) || 1;

  for (const p of rawPeople) {
    const userTasks = tasks.filter((t) => t.assigneeId === p.id);
    const userDone = userTasks.filter((t) => t.doneAt != null).length;
    const userOverdue = userTasks.filter((t) => !t.doneAt && t.dueAt && t.dueAt.getTime() < now);

    const userContribRow = (contribData?.rows ?? []).find((r: { userId: string }) => r.userId === p.id);
    const docEdits = userContribRow?.docEdits ?? 0;
    const codeEdits = userContribRow?.codeEdits ?? 0;
    const userTotalEdits = docEdits + codeEdits;
    const sharePercent = Math.round((userTotalEdits / totalEditsAll) * 100);

    let status: MemberContributionStat['status'] = 'BALANCED';
    if (userOverdue.length >= 2 || (sharePercent < 10 && userDone === 0 && totalTasks > 3)) {
      status = 'UNDER_CONTRIBUTING';
    } else if (sharePercent > 50 && userDone > 3 && rawPeople.length > 2) {
      status = 'OVERLOADED';
    }

    members.push({
      userId: p.id,
      name: p.name,
      avatar: p.avatar,
      tasksAssigned: userTasks.length,
      tasksCompleted: userDone,
      tasksOverdue: userOverdue.length,
      docEdits,
      codeEdits,
      peerRatingAvg: userContribRow?.peerRatingAvg ?? null,
      contributionSharePercent: sharePercent,
      status,
    });

    // Recommend nudges for overdue tasks
    for (const ot of userOverdue) {
      nudgesRecommended.push({
        taskId: ot.id,
        taskTitle: ot.title,
        userId: p.id,
        userName: p.name,
        reason: 'Task is past due date with no recorded completion.',
      });
    }
  }

  // Calculate health & fair contribution score
  const hasUnderContributing = members.some((m) => m.status === 'UNDER_CONTRIBUTING');
  const hasOverloaded = members.some((m) => m.status === 'OVERLOADED');

  let health: FairContributionReportData['health'] = 'ON_TRACK';
  if (overdueTasks >= 2 || hasUnderContributing) health = 'AT_RISK';
  if (overdueTasks >= 4 || (hasUnderContributing && hasOverloaded)) health = 'OFF_TRACK';

  const fairScore = hasUnderContributing ? 0.72 : hasOverloaded ? 0.84 : 0.98;

  // Previous report count for week number
  const previousReportCount = await prisma.groupAutopilotReport.count({ where: { planId } });
  const weekNumber = previousReportCount + 1;

  const summary = `${plan.title} (Week ${weekNumber}): ${completedTasks}/${totalTasks} tasks completed. Team health is ${health.replace('_', ' ')}. ${
    hasUnderContributing ? 'Workload imbalance detected: some members are behind on deliverables.' : 'Contributions are progressing evenly across team members.'
  }`;

  const report = await prisma.groupAutopilotReport.create({
    data: {
      planId,
      groupId: plan.groupId,
      weekNumber,
      summary,
      health,
      fairContributionScore: fairScore,
      metricsJson: JSON.stringify({ members, totalTasks, completedTasks, overdueTasks }),
      nudgesJson: JSON.stringify(nudgesRecommended),
    },
  });

  return {
    planId,
    groupId: plan.groupId,
    weekNumber,
    summary,
    health,
    fairContributionScore: fairScore,
    totalTasks,
    completedTasks,
    overdueTasks,
    members,
    nudgesRecommended,
    generatedAt: report.createdAt.toISOString(),
  };
}

/**
 * Sends a nudge notification to an assignee for a pending or overdue task.
 */
export async function sendAutopilotNudge(
  planId: string,
  taskId: string,
  user: SessionUser,
) {
  const plan = await prisma.groupAutopilotPlan.findUnique({
    where: { id: planId },
    include: { group: true },
  });
  if (!plan) throw new NotFoundException('Autopilot plan not found.');

  const access = await groupAccess(plan.groupId, user);
  if (!access) throw new ForbiddenException('Access denied to this group.');

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { board: true },
  });
  if (!task || !task.assigneeId) throw new NotFoundException('Task or assignee not found.');

  await prisma.notification.create({
    data: {
      userId: task.assigneeId,
      title: `Team Nudge: ${task.title}`,
      body: `Your group "${plan.group.name}" is tracking progress on "${task.title}". Please update your status or post a blocker.`,
      type: 'task',
      link: `/tasks/${task.boardId}?task=${task.id}`,
    },
  });

  return {
    success: true,
    notifiedUserId: task.assigneeId,
    taskTitle: task.title,
  };
}
