import prisma, { queriesUsed } from '@/lib/db';
import { deleteFile } from '@/lib/storage';
import { emailDue, parseEmailSchedule } from '@/lib/feature-switches';
import { notifyMany } from './email';
import { diagnoseErrors, emailErrorDigest } from './errors';
import { assessCourse } from './early-warning';
import { sendWeeklyDigests } from './guardians';
import { purgeLostFound } from './campus-life';
import { pruneCallRecordings } from './call-recordings';
import { weeklyAutopilotReports } from './group-autopilot';
import { wellbeingNudges } from './wellbeing';
import { applyLateFees } from './fees';

// The daily jobs, in steps (Stage 5 · bug review). D1 answers at most 50 queries in one run on
// Workers Free (a cron run is one run), and the daily jobs need far more once a school is real:
// early warning reads every course, wellbeing nudges a dozen queries a student. So each run does
// what fits (BUDGET queries, counted in src/lib/db.ts) and stops; the 15-minute timer
// (cloudflare/worker.ts, due-check.ts `dailyPending`) carries on from `job_runs` until today's
// list is done. Each step can be stopped and started again: it only does what isn't done yet.

const DAY = 24 * 60 * 60_000;
/** Queries a run may use for these steps; the rest of D1's 50 is left for whatever else the run does. */
export const BUDGET = 42;
const left = () => BUDGET - queriesUsed();

interface Step { job: string; run: (cursor: string | null) => Promise<{ done: boolean; cursor?: string | null; info?: unknown }> }

/** Quizzes due in the next 24 hours: students who haven't taken them get a reminder (once). */
async function quizReminders(): Promise<{ done: boolean; info: number }> {
  const now = new Date();
  const quizzes = await prisma.quiz.findMany({
    where: { status: 'PUBLISHED', dueDate: { gt: now, lte: new Date(now.getTime() + DAY) } },
    select: { id: true, title: true, dueDate: true, course: { select: { code: true, name: true, enrollments: { select: { studentId: true } } } }, submissions: { select: { studentId: true } } },
    take: 200,
  });
  let sent = 0;
  for (const quiz of quizzes) {
    if (left() < 6) return { done: false, info: sent };
    const link = `/student/quizzes?quiz=${quiz.id}`;
    const done = new Set(quiz.submissions.map((s) => s.studentId));
    const already = new Set((await prisma.notification.findMany({ where: { type: 'reminder', link }, select: { userId: true } })).map((n) => n.userId));
    const students = quiz.course.enrollments.map((e) => e.studentId).filter((id) => !done.has(id) && !already.has(id));
    const due = quiz.dueDate!.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    sent += await notifyMany(students, { type: 'reminder', title: `Quiz due soon: ${quiz.title}`, body: `${quiz.course.code ?? quiz.course.name} · due ${due} UTC. You haven't taken it yet.`, link });
  }
  return { done: true, info: sent };
}

/**
 * Deletes records older than the retention periods promised in the Privacy Policy (section 8,
 * public/legal/UniVerse-Privacy-Policy.pdf): technical / sign-in logs after 90 days, audit and
 * security logs after 2 years. Change both together. (Files: the next step.)
 */
async function retention() {
  const now = Date.now();
  const [signIns, audit, ownerChanges] = await Promise.all([
    prisma.loginEvent.deleteMany({ where: { createdAt: { lt: new Date(now - 90 * DAY) } } }),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: new Date(now - 730 * DAY) } } }),
    prisma.ownerChange.deleteMany({ where: { createdAt: { lt: new Date(now - 730 * DAY) } } }),
  ]);
  await Promise.all([
    // Pages opened and buttons clicked (technical / usage logs) after 90 days; page-speed measures 30.
    prisma.uiEvent.deleteMany({ where: { createdAt: { lt: new Date(now - 90 * DAY) } } }),
    prisma.webVital.deleteMany({ where: { createdAt: { lt: new Date(now - 30 * DAY) } } }),
    // Class notes and meeting notes transcripts after 90 days (the study pack and notes stay).
    prisma.classSession.updateMany({ where: { createdAt: { lt: new Date(now - 90 * DAY) }, transcript: { not: null } }, data: { transcript: null } }),
    prisma.callNote.updateMany({ where: { createdAt: { lt: new Date(now - 90 * DAY) }, transcript: { not: null } }, data: { transcript: null } }),
    // Voice tutor conversations after 90 days; expired disappearing messages; error groups unseen for 90 days.
    prisma.voiceSession.deleteMany({ where: { createdAt: { lt: new Date(now - 90 * DAY) } } }),
    prisma.message.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }),
    prisma.errorReport.deleteMany({ where: { lastSeen: { lt: new Date(now - 90 * DAY) } } }),
  ]);
  return { signIns: signIns.count, audit: audit.count, ownerChanges: ownerChanges.count };
}

/**
 * Old files, a few at a time: status photos after 24 hours, lost & found photos, call recordings
 * after 90 days, staff application documents 12 months after the decision.
 */
async function oldFiles(): Promise<{ done: boolean; info: number }> {
  const now = Date.now();
  let removed = 0;
  const statuses = await prisma.chatStatus.findMany({ where: { expiresAt: { lt: new Date(now) } }, select: { id: true, mediaUrl: true }, take: 300 });
  for (const st of statuses) if (st.mediaUrl) await deleteFile(st.mediaUrl).catch(() => {});
  if (statuses.length) await prisma.chatStatus.deleteMany({ where: { id: { in: statuses.map((st) => st.id) } } });
  removed += statuses.length + (await purgeLostFound(now).catch(() => 0));
  // A recording is about 3 queries; a document 1.
  const recordings = Math.max(0, Math.floor((left() - 12) / 3));
  if (recordings) removed += await pruneCallRecordings(Math.min(recordings, 10)).catch((e) => (console.error('call recordings cleanup failed:', e), 0));
  const decided = await prisma.roleApplication.findMany({
    where: { status: { in: ['APPROVED', 'REJECTED', 'WITHDRAWN'] }, proofUrl: { not: null }, updatedAt: { lt: new Date(now - 365 * DAY) } },
    select: { id: true, proofUrl: true }, take: 50,
  });
  for (const a of decided) {
    if (left() < 3) return { done: false, info: removed };
    try {
      await deleteFile(a.proofUrl!);
      await prisma.roleApplication.update({ where: { id: a.id }, data: { proofUrl: null, proofName: null } });
      removed++;
    } catch (e) { console.error('Could not delete application document', a.id, e); }
  }
  // Anything still over (a busy day of recordings) goes with tomorrow's run.
  return { done: true, info: removed };
}

/** Early warning for every published course, a few courses a run (the cursor: the last course done). */
async function earlyWarning(cursor: string | null) {
  let flagged = 0;
  for (;;) {
    const next = await prisma.course.findMany({ where: { status: 'PUBLISHED', ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: 5, select: { id: true } });
    if (!next.length) return { done: true, cursor, info: flagged };
    for (const c of next) {
      // A course is about 8 queries, more when many of its flags change.
      if (left() < 12) return { done: false, cursor, info: flagged };
      flagged += (await assessCourse(c.id).catch((e) => (console.error('early warning failed for course', c.id, e), []))).length;
      cursor = c.id;
    }
  }
}

/** Repeats a job that takes `n` at a time while the run has room (`cost`: about the queries one takes). */
async function inSlices(cost: number, slice: (n: number) => Promise<{ more: boolean; count: number }>) {
  let count = 0;
  for (;;) {
    const n = Math.min(5, Math.floor((left() - 6) / cost));
    if (n < 1) return { done: false, info: count };
    const r = await slice(n);
    count += r.count;
    if (!r.more) return { done: true, info: count };
  }
}

/** The steps, in the order they run each day. */
export const STEPS: Step[] = [
  { job: 'quiz-reminders', run: () => quizReminders() },
  { job: 'late-fees', run: async () => ({ done: true, info: await applyLateFees() }) },
  { job: 'retention', run: async () => (left() < 16 ? { done: false } : { done: true, info: await retention() }) },
  { job: 'old-files', run: () => oldFiles() },
  { job: 'guardian-digests', run: () => inSlices(10, async (n) => { const r = await sendWeeklyDigests(n); return { more: r.checked === n, count: r.sent }; }) },
  { job: 'early-warning', run: (cursor) => earlyWarning(cursor) },
  { job: 'autopilot', run: () => inSlices(12, async (n) => { const r = await weeklyAutopilotReports({ limit: n }); return { more: r.more > 0, count: r.made }; }) },
  { job: 'wellbeing', run: () => inSlices(14, async (n) => { const r = await wellbeingNudges(n); return { more: r.checked === n, count: r.sent }; }) },
  // AI explains the day's new problems (a few a run), then the owner's problems email when it's due.
  // At most 8 a day, as before (the cursor counts today's).
  {
    job: 'error-diagnosis',
    run: async (cursor) => {
      let made = Number(cursor) || 0;
      const r = await inSlices(4, async (n) => { const d = await diagnoseErrors({ limit: Math.min(n, 2, 8 - made) }); made += d; return { more: d > 0 && made < 8, count: d }; });
      return { ...r, cursor: String(made) };
    },
  },
  {
    job: 'error-digest',
    run: async () => {
      const ctl = await prisma.serverControl.findUnique({ where: { id: 'main' }, select: { switches: true } }).catch(() => null);
      const errorsEmail = emailDue(parseEmailSchedule(ctl?.switches).errors);
      return { done: true, info: errorsEmail.due ? await emailErrorDigest(new Date(Date.now() - errorsEmail.days * DAY)) : 0 };
    },
  },
];

/** Today's list, fresh: every step to do again (from the daily cron, one statement). */
export async function startDailyJobs(now = new Date()) {
  const day = now.toISOString().slice(0, 10), at = now.toISOString().replace('Z', '+00:00');
  await prisma.$executeRawUnsafe(
    `INSERT INTO job_runs (job, day, cursor, done, updatedAt) VALUES ${STEPS.map(() => '(?, ?, NULL, 0, ?)').join(', ')}
     ON CONFLICT(job) DO UPDATE SET day = excluded.day, cursor = NULL, done = 0, updatedAt = excluded.updatedAt`,
    ...STEPS.flatMap((s) => [s.job, day, at]),
  );
}

/**
 * Carries on with today's steps, in order, while this run has room. A step that fails is logged and
 * set aside for today (so one broken job doesn't hold up the others), as the old daily job did.
 */
export async function continueDailyJobs() {
  const rows = await prisma.jobRun.findMany({ where: { done: false }, select: { job: true, cursor: true } });
  const out: Record<string, unknown> = {};
  let finished = 0;
  for (const step of STEPS) {
    const row = rows.find((r) => r.job === step.job);
    if (!row) continue;
    if (left() < 6) break;
    let result: { done: boolean; cursor?: string | null; info?: unknown };
    try {
      result = await step.run(row.cursor);
    } catch (e) {
      console.error(`daily job ${step.job} failed:`, e);
      result = { done: true, cursor: row.cursor, info: 'failed' };
    }
    out[step.job] = result.info ?? null;
    await prisma.jobRun.update({ where: { job: step.job }, data: { done: result.done, cursor: result.cursor ?? row.cursor, updatedAt: new Date() } });
    if (!result.done) break; // out of room: the next run carries on here
    finished++;
  }
  return { ran: out, queries: queriesUsed(), waiting: rows.length - finished };
}
