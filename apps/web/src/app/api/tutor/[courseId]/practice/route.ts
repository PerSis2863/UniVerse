import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { spendAi } from '@/server/ai-budget';
import { practiceQuestions, tutorAccess } from '@/server/tutor';

// POST { topic?, count? } → { questions: [{ question, options, answer, explanation, sourceTitle }] }
export async function POST(req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const a = await tutorAccess(user, (await params).courseId);
  if (!a) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: 'The AI tutor isn’t set up yet.' }, { status: 503 });
  const spend = await spendAi(user);
  if (!spend.ok) return NextResponse.json({ error: spend.message, code: 'ai-limit' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const r = await practiceQuestions(a, typeof b.topic === 'string' ? b.topic : '', Math.min(10, Math.max(3, Number(b.count) || 5)));
  if (r.reason === 'no-sources') return NextResponse.json({ error: 'This course has no materials the tutor can read yet.', code: 'no-sources' }, { status: 409 });
  if (!r.questions) return NextResponse.json({ error: 'Couldn’t make questions right now. Please try again.' }, { status: 503 });
  return NextResponse.json({ questions: r.questions });
}
