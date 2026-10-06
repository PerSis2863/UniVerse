import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { notifyMany } from '@/server/email';
import { deleteFile } from '@/lib/storage';
import { diagnoseErrors, emailErrorDigest } from '@/server/errors';
import { emailDue, parseEmailSchedule } from '@/lib/feature-switches';
import { assessCourses } from '@/server/early-warning';
import { sendWeeklyDigests } from '@/server/guardians';
import { purgeLostFound } from '@/server/campus-life';
import { pruneCallRecordings } from '@/server/call-recordings';

// Daily job, run by the Worker's cron trigger (cloudflare/worker.ts → wrangler.jsonc "triggers").
// It isn't reachable from outside: the scheduled handler calls it in-process with a random
// token that only exists inside this Worker instance.

declare global {
  var __universeCronToken: string | undefined;
}

export async function POST(req: Request) {
  const token = req.headers.get('x-cron-token');
  if (!token || !globalThis.__universeCronToken || token !== globalThis.__universeCronToken) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const reminders = await quizReminders();
  const guardianDigests = await sendWeeklyDigests().catch((e) => (console.error('guardian digests failed:', e), 0));
  const deleted = await enforceRetention();
  // Early warning: students who may be struggling, for their teachers to review.
  const earlyWarning = await assessCourses().catch((e) => (console.error('early warning failed:', e), null));
  // Error monitoring: AI diagnoses the day's new problems, then the owner gets a digest.
  const diagnosed = await diagnoseErrors({ limit: 8 }).catch((e) => (console.error('diagnoseErrors failed:', e), 0));
  // The problems email follows the owner's schedule (daily / weekly / monthly / off), covering the time since the last one.
  const ctl = await prisma.serverControl.findUnique({ where: { id: 'main' }, select: { switches: true } }).catch(() => null);
  const errorsEmail = emailDue(parseEmailSchedule(ctl?.switches).errors);
  const reported = errorsEmail.due ? await emailErrorDigest(new Date(Date.now() - errorsEmail.days * DAY)).catch((e) => (console.error('emailErrorDigest failed:', e), 0)) : 0;
  return NextResponse.json({ reminders, guardianDigests, deleted, earlyWarning, errors: { diagnosed, reported } });
}

const DAY = 24 * 60 * 60_000;

/**
 * Deletes records older than the retention periods promised in the Privacy Policy (section 8,
 * public/legal/UniVerse-Privacy-Policy.pdf): technical / sign-in logs after 90 days, audit and
 * security logs after 2 years, and the proof documents of staff applications 12 months after the
 * decision. Change both together.
 */
async function enforceRetention() {
  const now = Date.now();
  const [signIns, audit, ownerChanges] = await Promise.all([
    prisma.loginEvent.deleteMany({ where: { createdAt: { lt: new Date(now - 90 * DAY) } } }),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: new Date(now - 730 * DAY) } } }),
    prisma.ownerChange.deleteMany({ where: { createdAt: { lt: new Date(now - 730 * DAY) } } }),
  ]);
  // Pages opened and buttons clicked (technical / usage logs), and error groups nobody has seen
  // for 90 days.
  await prisma.uiEvent.deleteMany({ where: { createdAt: { lt: new Date(now - 90 * DAY) } } });
  // Status updates are visible for 24 hours; remove them (and their photos) after that.
  const oldStatuses = await prisma.chatStatus.findMany({ where: { expiresAt: { lt: new Date(now) } }, select: { id: true, mediaUrl: true }, take: 300 });
  for (const st of oldStatuses) if (st.mediaUrl) await deleteFile(st.mediaUrl).catch(() => {});
  if (oldStatuses.length) await prisma.chatStatus.deleteMany({ where: { id: { in: oldStatuses.map((st) => st.id) } } });
  // Lost & found posts (upgrade 7): hidden after 30 days, deleted with their photo 60 days later.
  await purgeLostFound(now).catch(() => 0);
  // Class notes transcripts (upgrade 1) after 90 days; the study pack itself stays with the course.
  await prisma.classSession.updateMany({ where: { createdAt: { lt: new Date(now - 90 * DAY) }, transcript: { not: null } }, data: { transcript: null } });
  // Meeting notes transcripts (Stage 4 · 2.8) after 90 days too; the notes themselves stay.
  await prisma.callNote.updateMany({ where: { createdAt: { lt: new Date(now - 90 * DAY) }, transcript: { not: null } }, data: { transcript: null } });
  // Call recordings (Stage 4 · 2.9) after 90 days: the file goes, and its chat message says so.
  await pruneCallRecordings().catch((e) => console.error('call recordings cleanup failed:', e));
  // Voice tutor conversations (kept as text for the owner console) after 90 days.
  await prisma.voiceSession.deleteMany({ where: { createdAt: { lt: new Date(now - 90 * DAY) } } });
  // Disappearing chat messages that have expired (chats hide them already; this removes them).
  await prisma.message.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  await prisma.errorReport.deleteMany({ where: { lastSeen: { lt: new Date(now - 90 * DAY) } } });

  const decided = await prisma.roleApplication.findMany({
    where: {
      status: { in: ['APPROVED', 'REJECTED', 'WITHDRAWN'] },
      proofUrl: { not: null },
      updatedAt: { lt: new Date(now - 365 * DAY) },
    },
    select: { id: true, proofUrl: true },
    take: 200,
  });
  let proofs = 0;
  for (const a of decided) {
    try {
      await deleteFile(a.proofUrl!);
      await prisma.roleApplication.update({ where: { id: a.id }, data: { proofUrl: null, proofName: null } });
      proofs++;
    } catch (e) {
      console.error('Could not delete application document', a.id, e);
    }
  }
  return { signIns: signIns.count, audit: audit.count, ownerChanges: ownerChanges.count, applicationDocuments: proofs };
}

/** Reminds students about published quizzes due in the next 24 hours that they haven't taken. */
async function quizReminders() {
  const now = new Date();
  const quizzes = await prisma.quiz.findMany({
    where: { status: 'PUBLISHED', dueDate: { gt: now, lte: new Date(now.getTime() + 24 * 60 * 60_000) } },
    select: {
      id: true,
      title: true,
      dueDate: true,
      course: { select: { code: true, name: true, enrollments: { select: { studentId: true } } } },
      submissions: { select: { studentId: true } },
    },
  });
  let sent = 0;
  for (const quiz of quizzes) {
    const link = `/student/quizzes?quiz=${quiz.id}`;
    const done = new Set(quiz.submissions.map((s) => s.studentId));
    const already = new Set(
      (await prisma.notification.findMany({ where: { type: 'reminder', link }, select: { userId: true } })).map((n) => n.userId),
    );
    const students = quiz.course.enrollments.map((e) => e.studentId).filter((id) => !done.has(id) && !already.has(id));
    const due = quiz.dueDate!.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    // Everyone at once (a few queries, not two per student: D1 allows 50 per run on Workers Free).
    sent += await notifyMany(students, {
      type: 'reminder',
      title: `Quiz due soon: ${quiz.title}`,
      body: `${quiz.course.code ?? quiz.course.name} · due ${due} UTC. You haven't taken it yet.`,
      link,
    });
  }
  return sent;
}
