import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '@/lib/db';
import {
  getOrCreateTimeBankAccount,
  getTimeBankLedger,
  detectStudentMasteredSubjects,
  getTutorProfile,
  upsertTutorProfile,
  listPeerTutors,
  addTutorSlots,
  deleteTutorSlot,
  bookTutoringSession,
  completeAndRateTutoringSession,
  cancelTutoringSession,
  issuePeerTeachingPassportEvidence,
  INITIAL_TIME_CREDIT_GRANT,
} from './peer-tutoring';
import type { SessionUser } from '@/lib/server-auth';

vi.mock('@/lib/db', () => ({
  default: {
    peerTimeBankAccount: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    peerTimeCreditTransaction: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    enrollment: {
      findMany: vi.fn(),
    },
    quizSubmission: {
      findMany: vi.fn(),
    },
    peerTutorProfile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    peerTutorSlot: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    peerTutoringSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    skillEvidence: {
      upsert: vi.fn(),
    },
    studentSkill: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock('./analytics-warehouse', () => ({
  recordXApiStatement: vi.fn().mockResolvedValue({ id: 'xapi_1' }),
}));

describe('Peer Tutoring Time-Bank (Stage 5 · D5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Time-Bank Account & Ledger', () => {
    it('creates a new account with 3 starter credits and records initial grant transaction', async () => {
      vi.mocked(prisma.peerTimeBankAccount.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.peerTimeBankAccount.create).mockResolvedValue({
        id: 'acc_1',
        userId: 'student_1',
        organizationId: 'org_1',
        balanceCredits: INITIAL_TIME_CREDIT_GRANT,
        creditsEarned: INITIAL_TIME_CREDIT_GRANT,
        creditsSpent: 0,
        sessionsCompletedAsTutor: 0,
        sessionsCompletedAsLearner: 0,
        totalMinutesTutored: 0,
        averageRating: 0,
        ratingsCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      vi.mocked(prisma.peerTimeCreditTransaction.create).mockResolvedValue({
        id: 'tx_1',
        accountId: 'acc_1',
        userId: 'student_1',
        amount: 3,
        balanceAfter: 3,
        type: 'INITIAL_GRANT',
        description: 'Welcome grant',
        createdAt: new Date(),
        referenceId: null,
      } as never);

      const account = await getOrCreateTimeBankAccount('student_1', 'org_1');

      expect(account.balanceCredits).toBe(3);
      expect(prisma.peerTimeBankAccount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'student_1',
          balanceCredits: 3,
        }),
      });
      expect(prisma.peerTimeCreditTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'INITIAL_GRANT',
          amount: 3,
        }),
      });
    });

    it('returns existing account without re-creating', async () => {
      vi.mocked(prisma.peerTimeBankAccount.findUnique).mockResolvedValue({
        id: 'acc_existing',
        userId: 'student_1',
        balanceCredits: 5,
      } as never);

      const account = await getOrCreateTimeBankAccount('student_1');

      expect(account.id).toBe('acc_existing');
      expect(account.balanceCredits).toBe(5);
      expect(prisma.peerTimeBankAccount.create).not.toHaveBeenCalled();
    });

    it('returns ledger with account stats and transaction history', async () => {
      vi.mocked(prisma.peerTimeBankAccount.findUnique).mockResolvedValue({
        id: 'acc_1',
        userId: 'student_1',
        balanceCredits: 4,
      } as never);
      vi.mocked(prisma.peerTimeCreditTransaction.findMany).mockResolvedValue([
        {
          id: 'tx_2',
          amount: 1,
          balanceAfter: 4,
          type: 'SESSION_EARNED',
          description: 'Tutored session',
          createdAt: new Date(),
        },
      ] as never);

      const ledger = await getTimeBankLedger('student_1');

      expect(ledger.account.balanceCredits).toBe(4);
      expect(ledger.transactions).toHaveLength(1);
    });
  });

  describe('D1 Learning DNA Mastery Matching', () => {
    it('detects mastered concepts from quiz scores and course concepts', async () => {
      vi.mocked(prisma.enrollment.findMany).mockResolvedValue([
        {
          course: {
            id: 'course_cs101',
            name: 'Computer Science 101',
            code: 'CS101',
            skills: '["Algorithms"]',
            concepts: [
              { id: 'c1', name: 'Binary Trees', description: null, parentId: null },
            ],
          },
        },
      ] as never);

      vi.mocked(prisma.quizSubmission.findMany).mockResolvedValue([
        { score: 95, maxScore: 100 },
      ] as never);

      const mastered = await detectStudentMasteredSubjects('student_1');

      expect(mastered).toHaveLength(1);
      expect(mastered[0]?.courseCode).toBe('CS101');
      expect(mastered[0]?.conceptName).toBe('Binary Trees');
      expect(mastered[0]?.verifiedByD1).toBe(true);
      expect(mastered[0]?.band).toBe('mastered');
    });
  });

  describe('Tutor Profile & Availability Slots', () => {
    it('retrieves full tutor profile with slots and statistics', async () => {
      vi.mocked(prisma.peerTutorProfile.findUnique).mockResolvedValue({
        id: 'prof_1',
        userId: 'tutor_1',
        headline: 'Senior Math Tutor',
        bio: 'Exam expert',
        isActive: true,
        subjects: JSON.stringify([{ courseName: 'Calculus', verifiedByD1: true }]),
        user: { id: 'tutor_1', name: 'Alex', email: 'alex@school.edu', avatar: null },
      } as never);
      vi.mocked(prisma.peerTimeBankAccount.findUnique).mockResolvedValue({
        balanceCredits: 4,
        sessionsCompletedAsTutor: 5,
        totalMinutesTutored: 100,
        averageRating: 4.8,
        ratingsCount: 5,
      } as never);
      vi.mocked(prisma.peerTutorSlot.findMany).mockResolvedValue([] as never);

      const res = await getTutorProfile('tutor_1');
      expect(res?.headline).toBe('Senior Math Tutor');
      expect(res?.stats.sessionsCompletedAsTutor).toBe(5);
    });

    it('creates or updates tutor profile and subjects', async () => {
      vi.mocked(prisma.peerTutorProfile.upsert).mockResolvedValue({
        id: 'prof_1',
        userId: 'tutor_1',
        headline: 'CS & Math Tutor',
        bio: 'Senior student offering exam prep',
        isActive: true,
        subjects: JSON.stringify([{ courseName: 'CS101', verifiedByD1: true }]),
        user: { id: 'tutor_1', name: 'Alex Tutor', email: 'alex@school.edu', avatar: null },
      } as never);

      vi.mocked(prisma.peerTimeBankAccount.findUnique).mockResolvedValue({
        id: 'acc_tutor',
        userId: 'tutor_1',
        balanceCredits: 3,
      } as never);

      const profile = await upsertTutorProfile('tutor_1', {
        headline: 'CS & Math Tutor',
        bio: 'Senior student offering exam prep',
        subjects: [{ courseName: 'CS101', verifiedByD1: true }],
      });

      expect(profile.headline).toBe('CS & Math Tutor');
      expect(profile.subjects).toHaveLength(1);
    });

    it('lists tutors and filters by D1 verification', async () => {
      vi.mocked(prisma.peerTutorProfile.findMany).mockResolvedValue([
        {
          id: 'prof_1',
          userId: 'tutor_1',
          headline: 'Algorithms Guru',
          bio: 'Top scorer',
          subjects: JSON.stringify([
            { courseName: 'Data Structures', verifiedByD1: true },
          ]),
          user: { id: 'tutor_1', name: 'Bob', email: 'bob@school.edu', avatar: null },
        },
      ] as never);
      vi.mocked(prisma.peerTutorProfile.count).mockResolvedValue(1);
      vi.mocked(prisma.peerTimeBankAccount.findUnique).mockResolvedValue({
        averageRating: 4.9,
        ratingsCount: 8,
        sessionsCompletedAsTutor: 8,
        totalMinutesTutored: 160,
      } as never);
      vi.mocked(prisma.peerTutorSlot.findFirst).mockResolvedValue(null);

      const res = await listPeerTutors({ onlyD1Verified: true });

      expect(res.tutors).toHaveLength(1);
      expect(res.tutors[0]?.stats.averageRating).toBe(4.9);
      expect(res.tutors[0]?.subjects[0]?.verifiedByD1).toBe(true);
    });

    it('adds availability slots in bulk and allows deleting unbooked slots', async () => {
      vi.mocked(prisma.peerTutorSlot.create).mockResolvedValue({
        id: 'slot_1',
        tutorId: 'tutor_1',
        dayOfWeek: 2,
        startTime: '14:00',
        endTime: '14:20',
        date: '2026-10-15',
        isBooked: false,
      } as never);

      const slots = await addTutorSlots('tutor_1', [
        { dayOfWeek: 2, startTime: '14:00', endTime: '14:20', date: '2026-10-15' },
      ]);
      expect(slots).toHaveLength(1);

      // Delete slot
      vi.mocked(prisma.peerTutorSlot.findUnique).mockResolvedValue({
        id: 'slot_1',
        tutorId: 'tutor_1',
        isBooked: false,
      } as never);
      vi.mocked(prisma.peerTutorSlot.delete).mockResolvedValue({ id: 'slot_1' } as never);

      const del = await deleteTutorSlot('tutor_1', 'slot_1');
      expect(del.success).toBe(true);
    });
  });

  describe('Session Booking, Completion & Rating', () => {
    it('refuses booking if learner does not have enough time credits', async () => {
      vi.mocked(prisma.peerTutorProfile.findUnique).mockResolvedValue({
        id: 'prof_1',
        userId: 'tutor_1',
        isActive: true,
      } as never);

      vi.mocked(prisma.peerTimeBankAccount.findUnique).mockResolvedValue({
        id: 'acc_learner',
        userId: 'learner_poor',
        balanceCredits: 0, // No credits
        creditsSpent: 3,
      } as never);

      await expect(
        bookTutoringSession('learner_poor', {
          tutorId: 'tutor_1',
          topic: 'Calculus Review',
          scheduledAt: new Date(),
        }),
      ).rejects.toThrow(/Insufficient Time Credits/);
    });

    it('books a session, deducts 1 credit from learner, and generates call room', async () => {
      vi.mocked(prisma.peerTutorProfile.findUnique).mockResolvedValue({
        id: 'prof_1',
        userId: 'tutor_1',
        isActive: true,
        organizationId: 'org_1',
      } as never);

      vi.mocked(prisma.peerTimeBankAccount.findUnique).mockResolvedValue({
        id: 'acc_learner',
        userId: 'learner_1',
        balanceCredits: 3,
        creditsSpent: 0,
      } as never);

      vi.mocked(prisma.peerTimeBankAccount.update).mockResolvedValue({} as never);
      vi.mocked(prisma.peerTimeCreditTransaction.create).mockResolvedValue({} as never);

      vi.mocked(prisma.peerTutoringSession.create).mockResolvedValue({
        id: 'session_1',
        tutorId: 'tutor_1',
        learnerId: 'learner_1',
        topic: 'Graph Theory',
        durationMinutes: 20,
        status: 'SCHEDULED',
        callRoomId: 'peer_tutoring_abc123',
        creditTransacted: true,
        scheduledAt: new Date(),
        tutor: { id: 'tutor_1', name: 'Alex' },
        learner: { id: 'learner_1', name: 'Charlie' },
      } as never);

      const session = await bookTutoringSession('learner_1', {
        tutorId: 'tutor_1',
        topic: 'Graph Theory',
        scheduledAt: new Date(),
      });

      expect(session.status).toBe('SCHEDULED');
      expect(prisma.peerTimeBankAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc_learner' },
        data: expect.objectContaining({ balanceCredits: 2 }),
      });
      expect(prisma.peerTimeCreditTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'SESSION_SPENT',
          amount: -1,
        }),
      });
    });

    it('completes session, awards 1 credit to tutor, and checks for Passport credential', async () => {
      const actor: SessionUser = {
        id: 'learner_1',
        role: 'STUDENT',
        email: 'learner@school.edu',
        name: 'Charlie',
      };

      vi.mocked(prisma.peerTutoringSession.findUnique).mockResolvedValue({
        id: 'session_1',
        tutorId: 'tutor_1',
        learnerId: 'learner_1',
        organizationId: 'org_1',
        topic: 'Data Structures',
        durationMinutes: 20,
        status: 'SCHEDULED',
        feedbackTags: '[]',
        tutor: { id: 'tutor_1', name: 'Alex' },
        learner: { id: 'learner_1', name: 'Charlie' },
      } as never);

      vi.mocked(prisma.peerTimeBankAccount.findUnique)
        .mockResolvedValueOnce({
          id: 'acc_tutor',
          userId: 'tutor_1',
          balanceCredits: 4,
          creditsEarned: 2,
          sessionsCompletedAsTutor: 2, // Will become 3!
          totalMinutesTutored: 40,
          averageRating: 4.8,
          ratingsCount: 2,
        } as never)
        .mockResolvedValueOnce({
          id: 'acc_learner',
          userId: 'learner_1',
          sessionsCompletedAsLearner: 0,
        } as never);

      vi.mocked(prisma.peerTimeBankAccount.update).mockResolvedValue({} as never);
      vi.mocked(prisma.peerTimeCreditTransaction.create).mockResolvedValue({} as never);
      vi.mocked(prisma.peerTutoringSession.update).mockResolvedValue({
        id: 'session_1',
        status: 'COMPLETED',
        learnerRating: 5,
        callVerified: true,
      } as never);

      vi.mocked(prisma.skillEvidence.upsert).mockResolvedValue({} as never);
      vi.mocked(prisma.studentSkill.upsert).mockResolvedValue({} as never);
      vi.mocked(prisma.peerTutorProfile.update).mockResolvedValue({} as never);

      const result = await completeAndRateTutoringSession('session_1', actor, {
        callDurationSeconds: 1200, // 20 minutes
        rating: 5,
        feedback: 'Fantastic explanations and solved all my doubts!',
        feedbackTags: ['Clear explanations', 'Great examples'],
      });

      expect(result.session.status).toBe('COMPLETED');
      expect(result.tutorStats.sessionsCompletedAsTutor).toBe(3);
      expect(result.tutorStats.badgeAwarded).toBe(true);

      // Verify tutor was credited +1
      expect(prisma.peerTimeCreditTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'SESSION_EARNED',
          amount: 1,
        }),
      });

      // Verify Skill Evidence was issued
      expect(prisma.skillEvidence.upsert).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId_kind_sourceId_skill: expect.objectContaining({
            skill: 'peer teaching',
          }),
        }),
        create: expect.objectContaining({
          label: 'Peer Teaching',
          level: 'Developing',
        }),
        update: expect.any(Object),
      });
    });

    it('cancels scheduled session and refunds 1 credit to learner', async () => {
      vi.mocked(prisma.peerTutoringSession.findUnique).mockResolvedValue({
        id: 'session_1',
        tutorId: 'tutor_1',
        learnerId: 'learner_1',
        status: 'SCHEDULED',
        topic: 'Chemistry Kinetics',
      } as never);

      vi.mocked(prisma.peerTimeBankAccount.findUnique).mockResolvedValue({
        id: 'acc_learner',
        userId: 'learner_1',
        balanceCredits: 2,
        creditsSpent: 1,
      } as never);

      vi.mocked(prisma.peerTimeBankAccount.update).mockResolvedValue({} as never);
      vi.mocked(prisma.peerTimeCreditTransaction.create).mockResolvedValue({} as never);
      vi.mocked(prisma.peerTutoringSession.update).mockResolvedValue({
        id: 'session_1',
        status: 'CANCELLED',
      } as never);

      const cancelled = await cancelTutoringSession('session_1', 'learner_1', 'Illness');

      expect(cancelled.status).toBe('CANCELLED');
      expect(prisma.peerTimeBankAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc_learner' },
        data: expect.objectContaining({ balanceCredits: 3 }),
      });
      expect(prisma.peerTimeCreditTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'SESSION_REFUND',
          amount: 1,
        }),
      });
    });
  });

  describe('Skill Passport Integration', () => {
    it('issues Advanced badge when tutor has >= 10 sessions', async () => {
      vi.mocked(prisma.skillEvidence.upsert).mockResolvedValue({} as never);
      vi.mocked(prisma.studentSkill.upsert).mockResolvedValue({} as never);
      vi.mocked(prisma.peerTutorProfile.update).mockResolvedValue({} as never);

      const ok = await issuePeerTeachingPassportEvidence('tutor_1', 12, 4.9, 240);

      expect(ok).toBe(true);
      expect(prisma.skillEvidence.upsert).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId_kind_sourceId_skill: expect.objectContaining({
            skill: 'peer teaching',
          }),
        }),
        create: expect.objectContaining({
          level: 'Advanced',
          title: 'Peer Teaching (12 Sessions)',
        }),
        update: expect.objectContaining({
          level: 'Advanced',
        }),
      });
    });
  });
});
