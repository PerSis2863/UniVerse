import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { modeFor } from '@/lib/tutor-rules';
import { aiOn, askTutor, tutorAccess, tutorClosed } from '@/server/tutor';
import { recordStudy } from '@/server/streaks';

// POST { question, history?: [{ role: 'user' | 'tutor', text }], mode?: 'normal' | 'simple' | 'hints' }
// → { answer, grounded, citations }. Conversations aren't stored on the server. A hints-only course
// (the teacher's rule, Stage 5 · Q13) always answers in hints; a course whose tutor the teacher
// turned off answers students 423.
export async function POST(req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const a = await tutorAccess(user, (await params).courseId);
  if (!a) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  const closed = tutorClosed(a);
  if (closed) return NextResponse.json({ error: closed, code: 'tutor-off' }, { status: 423 });
  const b = await req.json().catch(() => ({}));
  const question = typeof b.question === 'string' ? b.question.trim() : '';
  if (!question) return NextResponse.json({ error: 'Type a question.' }, { status: 400 });
  const history = Array.isArray(b.history) ? b.history.filter((h: { role?: unknown; text?: unknown }) => (h?.role === 'user' || h?.role === 'tutor') && typeof h.text === 'string').slice(-6) : [];
  if (!(await aiOn())) return NextResponse.json({ error: 'The AI tutor isn’t available right now.' }, { status: 503 });
  const r = await askTutor(a, question.slice(0, 1500), history, user, modeFor(b.mode, a.rule));
  if (r.reason === 'no-sources') return NextResponse.json({ error: 'This course has no materials the tutor can read yet.', code: 'no-sources' }, { status: 409 });
  if (r.reason === 'limit') return NextResponse.json({ error: r.message, code: 'ai-limit' }, { status: 429 });
  if (r.reason === 'unavailable') return NextResponse.json({ error: 'The tutor is busy right now. Please try again in a moment.' }, { status: 503 });
  if (user.role === 'STUDENT') recordStudy(user.id, req);
  return NextResponse.json(r);
}
