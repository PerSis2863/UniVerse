import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { notify } from '@/server/email';

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
  return NextResponse.json({ reminders });
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
    for (let i = 0; i < students.length; i += 10) {
      await Promise.all(
        students.slice(i, i + 10).map((studentId) =>
          notify(studentId, {
            type: 'reminder',
            title: `Quiz due soon: ${quiz.title}`,
            body: `${quiz.course.code ?? quiz.course.name} · due ${due} UTC. You haven't taken it yet.`,
            link,
          }),
        ),
      );
    }
    sent += students.length;
  }
  return sent;
}
