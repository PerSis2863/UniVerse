import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { spendAi } from '@/server/ai-budget';
import { logAiUse } from '@/server/ai-receipts';
import { aiOn, practiceQuestions, tutorAccess, tutorClosed } from '@/server/tutor';
import { practiceFromClasses } from '@/server/tutor-plus';
import { HttpException } from '@/server/http';
import { recordStudy } from '@/server/streaks';

// POST { topic?, count?, from?: 'materials' | 'classes' } → { questions: [{ question, options, answer, explanation, sourceTitle, moment? }] }
// From the classes (Stage 5 · Q13): what the teacher said, each question linked to its moment in the class.
export async function POST(req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const a = await tutorAccess(user, (await params).courseId);
  if (!a) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  const closed = tutorClosed(a);
  if (closed) return NextResponse.json({ error: closed, code: 'tutor-off' }, { status: 423 });
  if (!(await aiOn())) return NextResponse.json({ error: 'The AI tutor isn’t available right now.' }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const count = Math.min(10, Math.max(3, Number(b.count) || 5));
  if (b.from === 'classes') {
    try {
      const out = await practiceFromClasses(a, user, typeof b.topic === 'string' ? b.topic : '', count);
      if (user.role === 'STUDENT') recordStudy(user.id, req);
      return NextResponse.json(out);
    } catch (e) {
      if (e instanceof HttpException) return NextResponse.json({ error: e.message, code: e.getStatus() === 409 ? 'no-classes' : undefined }, { status: e.getStatus() });
      throw e;
    }
  }
  const spend = await spendAi(user);
  if (!spend.ok) return NextResponse.json({ error: spend.message, code: 'ai-limit' }, { status: 429 });
  await logAiUse(user.id, { kind: 'study', detail: `Practice questions${typeof b.topic === 'string' && b.topic.trim() ? `: ${b.topic}` : ''}`, courseId: a.courseId }); // the student's own record (Stage 5 · D12)
  const r = await practiceQuestions(a, typeof b.topic === 'string' ? b.topic : '', count);
  if (r.reason === 'no-sources') return NextResponse.json({ error: 'This course has no materials the tutor can read yet.', code: 'no-sources' }, { status: 409 });
  if (!r.questions) return NextResponse.json({ error: 'Couldn’t make questions right now. Please try again.' }, { status: 503 });
  if (user.role === 'STUDENT') recordStudy(user.id, req);
  return NextResponse.json({ questions: r.questions });
}
