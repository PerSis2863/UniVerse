import { NextResponse } from 'next/server';
import { route } from '@/server/assignments';
import { tutorAccess } from '@/server/tutor';
import { commonQuestions } from '@/server/tutor-plus';

// GET: what the course's students asked its tutor in the last 90 days, grouped by topic, with no
// names and only groups several students asked (Stage 5 · Q13). The teaching team only.
export const GET = (req: Request, { params }: { params: Promise<{ courseId: string }> }) => route(req, async (user) => {
  const a = await tutorAccess(user, (await params).courseId);
  return a ? commonQuestions(a) : NextResponse.json({ error: 'Course not found.' }, { status: 404 });
});
