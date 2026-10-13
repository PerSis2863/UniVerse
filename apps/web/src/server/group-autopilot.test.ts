import { describe, expect, it, vi } from 'vitest';
import {
  splitBriefAndMatchSkills,
  findCommonMeetingSlots,
  contributionSummary,
} from './group-autopilot';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  default: {
    enrollment: {
      findMany: vi.fn().mockResolvedValue([
        { studentId: 'user-1', courseId: 'c-1', course: { code: 'CS101', name: 'Intro to CS' } },
        { studentId: 'user-2', courseId: 'c-2', course: { code: 'MATH201', name: 'Linear Algebra' } },
      ]),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'user-1', name: 'Alice Smith' },
        { id: 'user-2', name: 'Bob Jones' },
      ]),
    },
    timetableSlot: {
      findMany: vi.fn().mockResolvedValue([
        // Alice has CS101 lecture on Monday 10:00 - 11:30
        { courseId: 'c-1', dayOfWeek: 0, startTime: '10:00', endTime: '11:30', course: { code: 'CS101' } },
        // Bob has MATH201 on Wednesday 14:00 - 15:30
        { courseId: 'c-2', dayOfWeek: 2, startTime: '14:00', endTime: '15:30', course: { code: 'MATH201' } },
      ]),
    },
    groupAutopilotPlan: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    groupAutopilotReport: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
    },
  },
}));

describe('Group Project Autopilot (Stage 5 · D6)', () => {
  const members = [
    {
      id: 'user-1',
      name: 'Alice Smith',
      skills: [
        { name: 'Programming', level: 'ADVANCED' },
        { name: 'Software Engineering', level: 'INTERMEDIATE' },
      ],
    },
    {
      id: 'user-2',
      name: 'Bob Jones',
      skills: [
        { name: 'UI/UX', level: 'ADVANCED' },
        { name: 'System Design', level: 'INTERMEDIATE' },
      ],
    },
    {
      id: 'user-3',
      name: 'Charlie Brown',
      skills: [
        { name: 'Technical Writing', level: 'ADVANCED' },
        { name: 'Testing', level: 'INTERMEDIATE' },
      ],
    },
  ];

  describe('splitBriefAndMatchSkills', () => {
    it('returns empty array if no members are provided', () => {
      const tasks = splitBriefAndMatchSkills('Test brief', []);
      expect(tasks).toEqual([]);
    });

    it('splits generic brief into 5 structured academic project phases', () => {
      const brief = 'Build a collaborative cloud document editor with real-time sync and export.';
      const tasks = splitBriefAndMatchSkills(brief, members, 20);

      expect(tasks.length).toBe(5);
      expect(tasks[0]?.title).toContain('Phase 1: Problem Definition');
      expect(tasks[1]?.title).toContain('Phase 2: Architecture');
      expect(tasks[2]?.title).toContain('Phase 3: Core Implementation');
      expect(tasks[3]?.title).toContain('Phase 4: Testing');
      expect(tasks[4]?.title).toContain('Phase 5: Final Report');

      // Check due days ordering
      expect(tasks[0]?.dueDaysFromStart).toBeLessThan(tasks[1]!.dueDaysFromStart);
      expect(tasks[1]?.dueDaysFromStart).toBeLessThan(tasks[2]!.dueDaysFromStart);
      expect(tasks[2]?.dueDaysFromStart).toBeLessThan(tasks[4]!.dueDaysFromStart);
    });

    it('parses bulleted assignment briefs directly into milestones', () => {
      const brief = `
        1. Conduct literature review and user interview study
        2. Create Figma wireframes and technical component architecture
        3. Develop core REST API endpoints and data model
        4. Perform automated Cypress integration tests and benchmarking
      `;
      const tasks = splitBriefAndMatchSkills(brief, members, 14);

      expect(tasks.length).toBe(4);
      expect(tasks[0]?.title).toContain('literature review');
      expect(tasks[1]?.title).toContain('Figma wireframes');
      expect(tasks[2]?.title).toContain('REST API');
      expect(tasks[3]?.title).toContain('Cypress integration tests');
    });

    it('assigns tasks to members matching their specific skills', () => {
      const brief = `
        1. Design UI and UX wireframes for mobile screens
        2. Implement backend database models and REST API code
        3. Write technical research report and compile findings
      `;
      const tasks = splitBriefAndMatchSkills(brief, members, 14);

      // Task 1 (UI/UX) -> Bob
      expect(tasks[0]?.suggestedAssigneeId).toBe('user-2');
      expect(tasks[0]?.suggestedAssigneeName).toBe('Bob Jones');

      // Task 2 (Implementation / Code) -> Alice
      expect(tasks[1]?.suggestedAssigneeId).toBe('user-1');
      expect(tasks[1]?.suggestedAssigneeName).toBe('Alice Smith');

      // Task 3 (Writing / Report) -> Charlie
      expect(tasks[2]?.suggestedAssigneeId).toBe('user-3');
      expect(tasks[2]?.suggestedAssigneeName).toBe('Charlie Brown');
    });

    it('balances workload evenly across team when tasks require similar skills', () => {
      const coder1 = { id: 'u1', name: 'Coder 1', skills: [{ name: 'Programming', level: 'ADVANCED' }] };
      const coder2 = { id: 'u2', name: 'Coder 2', skills: [{ name: 'Programming', level: 'ADVANCED' }] };

      const brief = `
        - Implement authentication service
        - Implement database migration scripts
        - Implement websocket server gateway
        - Implement client SDK library
      `;
      const tasks = splitBriefAndMatchSkills(brief, [coder1, coder2], 10);

      const u1Count = tasks.filter((t) => t.suggestedAssigneeId === 'u1').length;
      const u2Count = tasks.filter((t) => t.suggestedAssigneeId === 'u2').length;

      expect(u1Count).toBe(2);
      expect(u2Count).toBe(2);
    });
  });

  describe('findCommonMeetingSlots', () => {
    it('returns ranked meeting slot candidates', async () => {
      const candidates = await findCommonMeetingSlots(['user-1', 'user-2']);

      expect(candidates.length).toBeGreaterThan(0);
      // Alice has lecture Mon 10:00 - 11:30
      const monMorning = candidates.find((c) => c.dayOfWeek === 0 && c.startTime === '10:00');
      expect(monMorning).toBeDefined();
      expect(monMorning?.conflicts.some((clash) => clash.userId === 'user-1')).toBe(true);

      // A slot with no clash (e.g. Tuesday 14:00 - 15:00) should have 100 score and both available
      const tueAfternoon = candidates.find((c) => c.dayOfWeek === 1 && c.startTime === '14:00');
      expect(tueAfternoon).toBeDefined();
      expect(tueAfternoon?.availableMemberIds).toContain('user-1');
      expect(tueAfternoon?.availableMemberIds).toContain('user-2');
      expect(tueAfternoon?.score).toBe(100);
    });

    it('returns empty array when memberIds is empty', async () => {
      const candidates = await findCommonMeetingSlots([]);
      expect(candidates).toEqual([]);
    });
  });

  describe('contributionSummary', () => {
    const now = Date.parse('2026-10-13T12:00:00Z');
    const day = 86_400_000;
    const people = [{ id: 'a', name: 'Asha', avatar: null }, { id: 'b', name: 'Ben', avatar: null }, { id: 'c', name: 'Chen', avatar: null }];
    const task = (id: string, assigneeId: string | null, opts: { done?: boolean; dueIn?: number; estimate?: number } = {}) => ({
      id, title: `Task ${id}`, assigneeId, doneAt: opts.done ? new Date(now - day) : null, dueAt: opts.dueIn == null ? null : new Date(now + opts.dueIn * day), estimate: opts.estimate ?? 2,
    });

    it('marks nobody behind and has no fairness score before any work is done', () => {
      const s = contributionSummary([task('1', 'a', { dueIn: 5 }), task('2', 'b', { dueIn: 5 }), task('3', 'c', { dueIn: 5 })], people, now);
      expect(s.fairContributionScore).toBeNull();
      expect(s.members.every((m) => m.status === 'BALANCED')).toBe(true);
      expect(s.health).toBe('ON_TRACK');
    });

    it('scores an even split as fair (1) and one person doing everything as 0', () => {
      const even = contributionSummary([task('1', 'a', { done: true }), task('2', 'b', { done: true }), task('3', 'c', { done: true })], people, now);
      expect(even.fairContributionScore).toBe(1);
      const solo = contributionSummary([task('1', 'a', { done: true }), task('2', 'a', { done: true }), task('3', 'a', { done: true })], people, now);
      expect(solo.fairContributionScore).toBe(0);
      expect(solo.members.find((m) => m.userId === 'a')?.status).toBe('OVERLOADED');
      expect(solo.members.find((m) => m.userId === 'b')?.status).toBe('UNDER_CONTRIBUTING');
    });

    it('counts late tasks, recommends nudges and flags the project at risk', () => {
      const s = contributionSummary([task('1', 'a', { dueIn: -2 }), task('2', 'b', { done: true }), task('3', 'c', { dueIn: 3 }), task('4', null, { dueIn: -1 })], people, now);
      expect(s.overdueTasks).toBe(2);
      expect(s.nudgesRecommended.map((n) => n.taskId)).toEqual(['1']); // the unassigned late task has nobody to nudge
      expect(s.health).toBe('OFF_TRACK'); // 2 late out of 4
    });
  });
});
