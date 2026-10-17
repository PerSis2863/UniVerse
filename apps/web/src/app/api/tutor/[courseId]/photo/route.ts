import { NextResponse } from 'next/server';
import { route } from '@/server/assignments';
import { modeFor } from '@/lib/tutor-rules';
import { tutorAccess } from '@/server/tutor';
import { homeworkMore, homeworkPhoto } from '@/server/tutor-plus';
import { recordStudy } from '@/server/streaks';

// A photo of a homework problem (Stage 5 · Q13). POST { image: { mimeType, data }, mode? } → the
// problem read from it and the first hint. POST { ref, hints: n } → more hints; { ref, answer: true }
// → the worked answer (not in a hints-only course, nor in Hints only mode).
export const POST = (req: Request, { params }: { params: Promise<{ courseId: string }> }) => route(req, async (user) => {
  const a = await tutorAccess(user, (await params).courseId);
  if (!a) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  const b = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const mode = modeFor(b.mode, a.rule);
  const out = b.ref ? await homeworkMore(a, user, b, mode) : await homeworkPhoto(a, user, b, mode);
  if (user.role === 'STUDENT') recordStudy(user.id, req);
  return out;
});
