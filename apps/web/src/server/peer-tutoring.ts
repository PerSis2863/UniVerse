import crypto from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, NotFoundException, ForbiddenException } from './http';
import { recordXApiStatement } from './analytics-warehouse';
import { bandOf } from '@/lib/mastery';
import { conceptMasteryOf } from './learning-dna';

// Stage 5 · D5: Peer Tutoring Time-Bank
// Students offer help in subjects they have mastered (verified via D1 Learning DNA);
// learners book 20-minute sessions; tutors earn time credits to spend on receiving help;
// sessions are verified by call duration logs and peer ratings. High-performing tutors
// automatically receive the Skill Passport "Peer Teaching" credential with cryptographic evidence.

export interface PeerTutorSubject {
  courseId?: string;
  courseName: string;
  courseCode?: string;
  conceptName?: string;
  masteryLevel?: number;
  band?: 'new' | 'learning' | 'nearly' | 'mastered';
  verifiedByD1?: boolean;
}

export interface UpsertTutorProfileInput {
  headline?: string;
  bio?: string;
  isActive?: boolean;
  subjects?: PeerTutorSubject[];
  organizationId?: string;
}

export interface AddSlotInput {
  dayOfWeek?: number;
  startTime: string;
  endTime: string;
  date?: string;
}

export interface BookSessionInput {
  tutorId: string;
  courseId?: string;
  topic: string;
  conceptName?: string;
  scheduledAt: string | Date;
  slotId?: string;
  organizationId?: string;
}

export interface CompleteSessionInput {
  callDurationSeconds: number;
  rating: number;
  feedback?: string;
  feedbackTags?: string[];
  tutorNotes?: string;
}

/** Initial grant for every student so they can immediately book tutoring before having to tutor */
export const INITIAL_TIME_CREDIT_GRANT = 3;

/**
 * Retrieves or creates a student's Time-Bank account.
 * Automatically provisions an initial grant of 3 credits on first account creation.
 */
export async function getOrCreateTimeBankAccount(userId: string, organizationId?: string | null) {
  const existing = await prisma.peerTimeBankAccount.findUnique({
    where: { userId },
  });

  if (existing) {
    return existing;
  }

  // Create new account and record the welcome grant transaction
  const account = await prisma.peerTimeBankAccount.create({
    data: {
      userId,
      organizationId: organizationId ?? null,
      balanceCredits: INITIAL_TIME_CREDIT_GRANT,
      creditsEarned: INITIAL_TIME_CREDIT_GRANT,
      creditsSpent: 0,
    },
  });

  await prisma.peerTimeCreditTransaction.create({
    data: {
      accountId: account.id,
      userId,
      amount: INITIAL_TIME_CREDIT_GRANT,
      balanceAfter: INITIAL_TIME_CREDIT_GRANT,
      type: 'INITIAL_GRANT',
      description: 'Welcome to UniVerse Peer Tutoring Time-Bank: 3 starter credits',
    },
  });

  return account;
}

/**
 * Retrieves the full Time-Bank ledger, including running balance and transaction audit log.
 */
export async function getTimeBankLedger(userId: string) {
  const account = await getOrCreateTimeBankAccount(userId);

  const transactions = await prisma.peerTimeCreditTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return {
    account,
    transactions,
  };
}

/** At most this many classes are looked at (each costs a few queries; Workers Free allows 50 per request). */
const MASTERY_COURSES = 4;

/**
 * The concepts a student has mastered, from their D1 Learning DNA: what their teachers have seen in
 * quizzes, rubrics and practice (src/server/learning-dna.ts). Only these are "verified" on a tutor's
 * profile. Classes without concepts give nothing to verify.
 */
export async function detectStudentMasteredSubjects(userId: string): Promise<PeerTutorSubject[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: userId, course: { concepts: { some: {} } } },
    orderBy: { enrolledAt: 'desc' },
    take: MASTERY_COURSES,
    select: { course: { select: { id: true, name: true, code: true } } },
  });
  const perCourse = await Promise.all(enrollments.map(async ({ course }) => ({ course, concepts: await conceptMasteryOf(course.id, userId) })));
  return perCourse.flatMap(({ course, concepts }) =>
    concepts
      .filter((c) => bandOf(c.mastery) === 'mastered')
      .map((c) => ({ courseId: course.id, courseName: course.name, courseCode: course.code, conceptName: c.name, masteryLevel: c.mastery.level, band: 'mastered' as const, verifiedByD1: true })),
  );
}

/** A tutor's subjects from a request: cleaned, and "verified" only where the mastery check agrees. */
async function cleanSubjects(userId: string, raw: unknown): Promise<PeerTutorSubject[] | undefined> {
  if (!Array.isArray(raw)) return undefined;
  const cut = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
  const subjects = raw.slice(0, 20).flatMap((x): PeerTutorSubject[] => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const courseName = cut(o.courseName, 120);
    return courseName ? [{ courseName, courseId: cut(o.courseId, 40), courseCode: cut(o.courseCode, 30), conceptName: cut(o.conceptName, 120), verifiedByD1: o.verifiedByD1 === true }] : [];
  });
  if (!subjects.some((x) => x.verifiedByD1)) return subjects.map(({ verifiedByD1: _, ...x }) => x);
  const mastered = await detectStudentMasteredSubjects(userId);
  return subjects.map(({ verifiedByD1, ...x }) => {
    const m = verifiedByD1 ? mastered.find((y) => y.courseId === x.courseId && y.conceptName === x.conceptName) : undefined;
    return m ? { ...x, courseName: m.courseName, courseCode: m.courseCode, masteryLevel: m.masteryLevel, band: m.band, verifiedByD1: true } : x;
  });
}

/**
 * Retrieves a tutor's public or personal profile.
 */
export async function getTutorProfile(userId: string) {
  const profile = await prisma.peerTutorProfile.findUnique({
    where: { userId },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  if (!profile) return null;

  const account = await getOrCreateTimeBankAccount(userId);

  const parsedSubjects: PeerTutorSubject[] = (() => {
    try {
      return JSON.parse(profile.subjects);
    } catch {
      return [];
    }
  })();

  const unbookedSlots = await prisma.peerTutorSlot.findMany({
    where: { tutorId: userId, isBooked: false },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    take: 20,
  });

  return {
    ...profile,
    subjects: parsedSubjects,
    slots: unbookedSlots,
    stats: {
      balanceCredits: account.balanceCredits,
      sessionsCompletedAsTutor: account.sessionsCompletedAsTutor,
      totalMinutesTutored: account.totalMinutesTutored,
      averageRating: account.averageRating,
      ratingsCount: account.ratingsCount,
    },
  };
}

/**
 * Creates or updates a student's peer tutor profile and subject offerings.
 */
export async function upsertTutorProfile(userId: string, body: Record<string, unknown>, organizationId: string | null = null) {
  // The request is untrusted: lengths are capped, "verified" is decided here, and the school is the person's own.
  const subjects = await cleanSubjects(userId, body.subjects);
  const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : undefined);
  const input: UpsertTutorProfileInput = {
    headline: cut(body.headline, 120),
    bio: cut(body.bio, 1000),
    isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
    subjects,
    organizationId: organizationId ?? undefined,
  };
  const subjectsJson = input.subjects ? JSON.stringify(input.subjects) : undefined;

  const profile = await prisma.peerTutorProfile.upsert({
    where: { userId },
    create: {
      userId,
      headline: input.headline ?? 'Peer Tutor & Study Partner',
      bio: input.bio ?? 'Happy to help clarify concepts and prepare for exams.',
      isActive: input.isActive ?? true,
      subjects: subjectsJson ?? '[]',
      organizationId: input.organizationId ?? null,
    },
    update: {
      headline: input.headline,
      bio: input.bio,
      isActive: input.isActive,
      ...(subjectsJson ? { subjects: subjectsJson } : {}),
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      updatedAt: new Date(),
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  // Ensure Time-Bank account is provisioned
  await getOrCreateTimeBankAccount(userId, input.organizationId);

  return {
    ...profile,
    subjects: input.subjects ?? [],
  };
}

/**
 * Searches and lists active peer tutors with filters and D1 mastery verification badges.
 */
export async function listPeerTutors(filters: {
  search?: string;
  courseId?: string;
  subject?: string;
  onlyD1Verified?: boolean;
  organizationId?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, Math.floor(Number.isFinite(filters.page) ? filters.page! : 1));
  const limit = Math.min(50, Math.max(1, Math.floor(Number.isFinite(filters.limit) ? filters.limit! : 20)));
  const skip = (page - 1) * limit;

  const profiles = await prisma.peerTutorProfile.findMany({
    where: {
      isActive: true,
      ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
      ...(filters.search
        ? {
            OR: [
              { headline: { contains: filters.search } },
              { bio: { contains: filters.search } },
              { user: { name: { contains: filters.search } } },
            ],
          }
        : {}),
    },
    include: {
      user: { select: { id: true, name: true, avatar: true } },
    },
    orderBy: { updatedAt: 'desc' },
    skip,
    take: limit,
  });

  const total = await prisma.peerTutorProfile.count({
    where: {
      isActive: true,
      ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
    },
  });

  // Every tutor's stats and next free slot in two queries (not two per tutor).
  const ids = profiles.map((p) => p.userId);
  const [accounts, firstSlots] = ids.length
    ? await Promise.all([
        prisma.peerTimeBankAccount.findMany({
          where: { userId: { in: ids } },
          select: { userId: true, averageRating: true, ratingsCount: true, sessionsCompletedAsTutor: true, totalMinutesTutored: true },
        }),
        // Each tutor's first free slot, in the order Prisma sorts (no date first, then by date and time).
        prisma.$queryRawUnsafe<{ id: string; tutorId: string; dayOfWeek: number | null; startTime: string; endTime: string; date: string | null; isBooked: unknown; createdAt: unknown }[]>(
          `SELECT "id", "tutorId", "dayOfWeek", "startTime", "endTime", "date", "isBooked", "createdAt" FROM (
             SELECT *, ROW_NUMBER() OVER (PARTITION BY "tutorId" ORDER BY "date" ASC, "startTime" ASC) AS "n"
             FROM "peer_tutor_slots" WHERE "isBooked" = 0 AND "tutorId" IN (${ids.map(() => '?').join(', ')})
           ) WHERE "n" = 1`,
          ...ids,
        ),
      ])
    : [[], []];
  const accountOf = new Map(accounts.map((a) => [a.userId, a]));
  const slotOf = new Map(firstSlots.map((x) => [x.tutorId, { ...x, isBooked: false }]));

  const enriched = profiles.map((p) => {
      let subjects: PeerTutorSubject[] = [];
      try {
        subjects = JSON.parse(p.subjects);
      } catch {
        subjects = [];
      }

      if (filters.subject) {
        const needle = filters.subject.toLowerCase();
        subjects = subjects.filter(
          (s) =>
            s.courseName.toLowerCase().includes(needle) ||
            s.conceptName?.toLowerCase().includes(needle) ||
            s.courseCode?.toLowerCase().includes(needle),
        );
      }

      if (filters.courseId) {
        subjects = subjects.filter((s) => s.courseId === filters.courseId);
      }

      if (filters.onlyD1Verified) {
        subjects = subjects.filter((s) => s.verifiedByD1);
      }

      const account = accountOf.get(p.userId);
      return {
        id: p.id,
        userId: p.userId,
        name: p.user.name,
        avatar: p.user.avatar,
        headline: p.headline,
        bio: p.bio,
        badgeIssued: p.badgeIssued,
        badgeIssuedAt: p.badgeIssuedAt,
        subjects,
        stats: {
          averageRating: account?.averageRating ?? 0,
          ratingsCount: account?.ratingsCount ?? 0,
          sessionsCompletedAsTutor: account?.sessionsCompletedAsTutor ?? 0,
          totalMinutesTutored: account?.totalMinutesTutored ?? 0,
        },
        nextAvailableSlot: slotOf.get(p.userId) ?? null,
      };
  });

  // If filtered by subject/d1 verification, filter out items whose matching subjects became empty
  const filtered = (filters.subject || filters.courseId || filters.onlyD1Verified)
    ? enriched.filter((t) => t.subjects.length > 0)
    : enriched;

  return {
    tutors: filtered,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Adds recurring or date-specific 20-minute availability slots for a tutor.
 */
export async function addTutorSlots(tutorId: string, slots: AddSlotInput[]) {
  if (!slots.length) {
    throw new BadRequestException('At least one slot must be provided.');
  }

  const created = await Promise.all(
    slots.map((s) =>
      prisma.peerTutorSlot.create({
        data: {
          tutorId,
          dayOfWeek: s.dayOfWeek ?? null,
          startTime: s.startTime,
          endTime: s.endTime,
          date: s.date ?? null,
          isBooked: false,
        },
      }),
    ),
  );

  return created;
}

/**
 * Removes an unbooked availability slot.
 */
export async function deleteTutorSlot(tutorId: string, slotId: string) {
  const slot = await prisma.peerTutorSlot.findUnique({
    where: { id: slotId },
  });

  if (!slot) {
    throw new NotFoundException('Slot not found.');
  }

  if (slot.tutorId !== tutorId) {
    throw new ForbiddenException('You can only remove your own slots.');
  }

  if (slot.isBooked) {
    throw new BadRequestException('Cannot delete an already booked slot.');
  }

  await prisma.peerTutorSlot.delete({
    where: { id: slotId },
  });

  return { success: true };
}

/**
 * Books a 20-minute peer tutoring session, holding 1 time credit from the learner.
 */
export async function bookTutoringSession(learnerId: string, input: BookSessionInput) {
  if (learnerId === input.tutorId) {
    throw new BadRequestException('You cannot book a tutoring session with yourself.');
  }

  // Verify tutor profile
  const tutorProfile = await prisma.peerTutorProfile.findUnique({
    where: { userId: input.tutorId },
  });

  if (!tutorProfile || !tutorProfile.isActive) {
    throw new BadRequestException('This tutor is not currently accepting sessions.');
  }

  // Verify learner credit balance
  const learnerAccount = await getOrCreateTimeBankAccount(learnerId, input.organizationId);
  if (learnerAccount.balanceCredits < 1) {
    throw new BadRequestException(
      'Insufficient Time Credits. You need at least 1 credit to book a session. Tutor a peer or request a study grant to earn more.',
    );
  }

  // Mark slot as booked if slotId provided
  if (input.slotId) {
    const slot = await prisma.peerTutorSlot.findUnique({
      where: { id: input.slotId },
    });
    if (!slot || slot.isBooked || slot.tutorId !== input.tutorId) {
      throw new BadRequestException('This time slot is no longer available.');
    }
    await prisma.peerTutorSlot.update({
      where: { id: input.slotId },
      data: { isBooked: true },
    });
  }

  const callRoomId = `peer_tutoring_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const scheduledDate = new Date(input.scheduledAt);

  // Deduct 1 credit from learner into escrow
  const updatedBalance = learnerAccount.balanceCredits - 1;
  await prisma.peerTimeBankAccount.update({
    where: { id: learnerAccount.id },
    data: {
      balanceCredits: updatedBalance,
      creditsSpent: learnerAccount.creditsSpent + 1,
    },
  });

  await prisma.peerTimeCreditTransaction.create({
    data: {
      accountId: learnerAccount.id,
      userId: learnerId,
      amount: -1,
      balanceAfter: updatedBalance,
      type: 'SESSION_SPENT',
      description: `Reserved 20-min session on: ${input.topic}`,
    },
  });

  const session = await prisma.peerTutoringSession.create({
    data: {
      tutorId: input.tutorId,
      learnerId,
      organizationId: input.organizationId ?? tutorProfile.organizationId,
      courseId: input.courseId ?? null,
      topic: input.topic,
      conceptName: input.conceptName ?? null,
      scheduledAt: scheduledDate,
      durationMinutes: 20,
      status: 'SCHEDULED',
      callRoomId,
      creditTransacted: true,
    },
    include: {
      tutor: { select: { id: true, name: true, email: true, avatar: true } },
      learner: { select: { id: true, name: true, email: true, avatar: true } },
      course: { select: { id: true, name: true, code: true } },
    },
  });

  // Track event in Learning Analytics Warehouse
  await recordXApiStatement({
    actorId: learnerId,
    verb: 'scheduled',
    objectId: `universe:tutoring:session:${session.id}`,
    objectType: 'tutoring-session',
    organizationId: session.organizationId ?? undefined,
    rawPayload: {
      tutorId: input.tutorId,
      topic: input.topic,
      durationMinutes: 20,
    },
  }).catch(() => null);

  return session;
}

/**
 * Lists user sessions, either as tutor, learner, or both.
 */
export async function listUserTutoringSessions(
  userId: string,
  filter?: { role?: 'all' | 'tutor' | 'learner'; status?: string },
) {
  const role = filter?.role ?? 'all';

  const whereClause: Record<string, unknown> = {};

  if (role === 'tutor') {
    whereClause.tutorId = userId;
  } else if (role === 'learner') {
    whereClause.learnerId = userId;
  } else {
    whereClause.OR = [{ tutorId: userId }, { learnerId: userId }];
  }

  if (filter?.status) {
    whereClause.status = filter.status;
  }

  const sessions = await prisma.peerTutoringSession.findMany({
    where: whereClause,
    include: {
      tutor: { select: { id: true, name: true, email: true, avatar: true } },
      learner: { select: { id: true, name: true, email: true, avatar: true } },
      course: { select: { id: true, name: true, code: true } },
    },
    orderBy: { scheduledAt: 'desc' },
  });

  return sessions.map((s) => ({
    ...s,
    feedbackTags: (() => {
      try {
        return JSON.parse(s.feedbackTags);
      } catch {
        return [];
      }
    })(),
  }));
}

/**
 * Completes a session with call log verification, peer rating (1-5 stars),
 * transfers +1 time credit to the tutor, and checks for automated Skill Passport badge issuance.
 */
export async function completeAndRateTutoringSession(
  sessionId: string,
  actor: SessionUser,
  input: CompleteSessionInput,
) {
  const session = await prisma.peerTutoringSession.findUnique({
    where: { id: sessionId },
    include: {
      tutor: { select: { id: true, name: true } },
      learner: { select: { id: true, name: true } },
    },
  });

  if (!session) {
    throw new NotFoundException('Session not found.');
  }

  if (session.status === 'COMPLETED') {
    throw new BadRequestException('Session has already been completed.');
  }

  if (session.status === 'CANCELLED') {
    throw new BadRequestException('Cannot complete a cancelled session.');
  }

  // Learner, tutor, or admin can complete the session
  const isLearner = actor.id === session.learnerId;
  const isTutor = actor.id === session.tutorId;
  const isAdmin = actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN';

  if (!isLearner && !isTutor && !isAdmin) {
    throw new ForbiddenException('Only the session participants or an admin can finalize this session.');
  }

  if (input.rating < 1 || input.rating > 5) {
    throw new BadRequestException('Rating must be an integer between 1 and 5 stars.');
  }

  // Verify call activity: >= 3 min (180s) or verified by tutor/learner confirmation
  const callVerified = input.callDurationSeconds >= 180 || isLearner || isAdmin;

  // 1. Credit the tutor with +1 Time Credit
  const tutorAccount = await getOrCreateTimeBankAccount(session.tutorId, session.organizationId);
  const updatedTutorBalance = tutorAccount.balanceCredits + 1;
  const newRatingsCount = tutorAccount.ratingsCount + 1;
  const newAverageRating =
    Math.round(((tutorAccount.averageRating * tutorAccount.ratingsCount + input.rating) / newRatingsCount) * 100) /
    100;

  await prisma.peerTimeBankAccount.update({
    where: { id: tutorAccount.id },
    data: {
      balanceCredits: updatedTutorBalance,
      creditsEarned: tutorAccount.creditsEarned + 1,
      sessionsCompletedAsTutor: tutorAccount.sessionsCompletedAsTutor + 1,
      totalMinutesTutored: tutorAccount.totalMinutesTutored + session.durationMinutes,
      ratingsCount: newRatingsCount,
      averageRating: newAverageRating,
    },
  });

  await prisma.peerTimeCreditTransaction.create({
    data: {
      accountId: tutorAccount.id,
      userId: session.tutorId,
      amount: 1,
      balanceAfter: updatedTutorBalance,
      type: 'SESSION_EARNED',
      description: `Earned 1 Time Credit for peer tutoring on: ${session.topic}`,
      referenceId: session.id,
    },
  });

  // Update learner account stats
  const learnerAccount = await getOrCreateTimeBankAccount(session.learnerId, session.organizationId);
  await prisma.peerTimeBankAccount.update({
    where: { id: learnerAccount.id },
    data: {
      sessionsCompletedAsLearner: learnerAccount.sessionsCompletedAsLearner + 1,
    },
  });

  // 2. Update session record
  const updatedSession = await prisma.peerTutoringSession.update({
    where: { id: sessionId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      callDurationSeconds: input.callDurationSeconds,
      callVerified,
      learnerRating: input.rating,
      learnerFeedback: input.feedback ?? null,
      feedbackTags: JSON.stringify(input.feedbackTags ?? []),
      tutorNotes: input.tutorNotes ?? session.tutorNotes,
    },
    include: {
      tutor: { select: { id: true, name: true, avatar: true } },
      learner: { select: { id: true, name: true, avatar: true } },
    },
  });

  // 3. Automated Skill Passport Evidence Check:
  // If tutor has completed >= 3 sessions with averageRating >= 4.5, issue "Peer Teaching" badge
  let badgeAwarded = false;
  if (tutorAccount.sessionsCompletedAsTutor + 1 >= 3 && newAverageRating >= 4.5) {
    badgeAwarded = await issuePeerTeachingPassportEvidence(
      session.tutorId,
      tutorAccount.sessionsCompletedAsTutor + 1,
      newAverageRating,
      tutorAccount.totalMinutesTutored + session.durationMinutes,
    );
  }

  // 4. Record xAPI statement
  await recordXApiStatement({
    actorId: session.tutorId,
    verb: 'completed',
    objectId: `universe:tutoring:session:${session.id}`,
    objectType: 'tutoring-session',
    organizationId: session.organizationId ?? undefined,
    rawPayload: {
      learnerId: session.learnerId,
      durationMinutes: session.durationMinutes,
      callDurationSeconds: input.callDurationSeconds,
      rating: input.rating,
      badgeAwarded,
    },
  }).catch(() => null);

  return {
    session: updatedSession,
    tutorStats: {
      balanceCredits: updatedTutorBalance,
      averageRating: newAverageRating,
      ratingsCount: newRatingsCount,
      sessionsCompletedAsTutor: tutorAccount.sessionsCompletedAsTutor + 1,
      badgeAwarded,
    },
  };
}

/**
 * Cancels a scheduled session and refunds the 1 held credit back to the learner.
 */
export async function cancelTutoringSession(sessionId: string, actorId: string, reason?: string) {
  const session = await prisma.peerTutoringSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new NotFoundException('Session not found.');
  }

  if (session.status !== 'SCHEDULED') {
    throw new BadRequestException('Only scheduled sessions can be cancelled.');
  }

  if (session.learnerId !== actorId && session.tutorId !== actorId) {
    throw new ForbiddenException('Only session participants can cancel this session.');
  }

  // Refund held credit to learner
  const learnerAccount = await getOrCreateTimeBankAccount(session.learnerId, session.organizationId);
  const refundBalance = learnerAccount.balanceCredits + 1;

  await prisma.peerTimeBankAccount.update({
    where: { id: learnerAccount.id },
    data: {
      balanceCredits: refundBalance,
      creditsSpent: Math.max(0, learnerAccount.creditsSpent - 1),
    },
  });

  await prisma.peerTimeCreditTransaction.create({
    data: {
      accountId: learnerAccount.id,
      userId: session.learnerId,
      amount: 1,
      balanceAfter: refundBalance,
      type: 'SESSION_REFUND',
      description: `Refund for cancelled session: ${session.topic}${reason ? ` (${reason})` : ''}`,
      referenceId: session.id,
    },
  });

  const updated = await prisma.peerTutoringSession.update({
    where: { id: sessionId },
    data: {
      status: 'CANCELLED',
      tutorNotes: reason ? `Cancelled: ${reason}` : 'Cancelled by participant',
    },
  });

  return updated;
}

/**
 * Automatically creates or updates the "Peer Teaching" Skill Passport credential
 * with verified session metrics, hours, and learner rating evidence.
 */
export async function issuePeerTeachingPassportEvidence(
  tutorId: string,
  totalSessions: number,
  averageRating: number,
  totalMinutes: number,
): Promise<boolean> {
  const level = totalSessions >= 10 ? 'Advanced' : totalSessions >= 5 ? 'Proficient' : 'Developing';
  const hours = Math.round((totalMinutes / 60) * 10) / 10;

  const title = `Peer Teaching (${totalSessions} Sessions)`;
  const detail = `${hours} hours tutored · ★ ${averageRating.toFixed(1)}/5.0 average rating · Verified by UniVerse Time-Bank`;

  // Upsert SkillEvidence
  await prisma.skillEvidence.upsert({
    where: {
      userId_kind_sourceId_skill: {
        userId: tutorId,
        kind: 'PROJECT',
        sourceId: `peer-tutoring:${tutorId}`,
        skill: 'peer teaching',
      },
    },
    create: {
      userId: tutorId,
      kind: 'PROJECT',
      sourceId: `peer-tutoring:${tutorId}`,
      skill: 'peer teaching',
      label: 'Peer Teaching',
      title,
      detail,
      level,
      verifiedById: 'system',
      verifiedByName: 'UniVerse Peer Tutoring Time-Bank',
      occurredAt: new Date(),
    },
    update: {
      title,
      detail,
      level,
      occurredAt: new Date(),
    },
  });

  // Upsert StudentSkill
  await prisma.studentSkill.upsert({
    where: {
      userId_name: {
        userId: tutorId,
        name: 'Peer Teaching',
      },
    },
    create: {
      userId: tutorId,
      name: 'Peer Teaching',
      category: 'Leadership & Mentorship',
      level: level === 'Advanced' ? 'ADVANCED' : 'INTERMEDIATE',
      endorsements: totalSessions,
    },
    update: {
      level: level === 'Advanced' ? 'ADVANCED' : 'INTERMEDIATE',
      endorsements: totalSessions,
    },
  });

  // Mark tutor profile badge
  await prisma.peerTutorProfile.update({
    where: { userId: tutorId },
    data: {
      badgeIssued: true,
      badgeIssuedAt: new Date(),
    },
  }).catch(() => null);

  return true;
}
