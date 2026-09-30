import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { askTutor, tutorAccess } from '@/server/tutor';

// POST { question, history?: [{ role: 'user' | 'tutor', text }] } → { answer, grounded, citations }
// Conversations aren't stored on the server.
export async function POST(req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const a = await tutorAccess(user, (await params).courseId);
  if (!a) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const question = typeof b.question === 'string' ? b.question.trim() : '';
  if (!question) return NextResponse.json({ error: 'Type a question.' }, { status: 400 });
  const history = Array.isArray(b.history) ? b.history.filter((h: { role?: unknown; text?: unknown }) => (h?.role === 'user' || h?.role === 'tutor') && typeof h.text === 'string').slice(-6) : [];
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: 'The AI tutor isn’t set up yet.' }, { status: 503 });
  const r = await askTutor(a, question.slice(0, 1500), history);
  if (r.reason === 'no-sources') return NextResponse.json({ error: 'This course has no materials the tutor can read yet.', code: 'no-sources' }, { status: 409 });
  if (r.reason === 'unavailable') return NextResponse.json({ error: 'The tutor is busy right now. Please try again in a moment.' }, { status: 503 });
  return NextResponse.json(r);
}
