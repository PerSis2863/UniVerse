import { NextResponse } from 'next/server';
import { route } from '@/server/assignments';
import { tutorAccess } from '@/server/tutor';
import { readRule, saveRule } from '@/server/tutor-plus';

// The teacher's rule for a course's tutor (Stage 5 · Q13). GET: hints only, off (and until when);
// the teaching team also sees their instruction. PUT { hintsOnly, note, off, offUntil }: the teaching team.
export const GET = (req: Request, { params }: { params: Promise<{ courseId: string }> }) => route(req, async (user) => {
  const a = await tutorAccess(user, (await params).courseId);
  return a ? readRule(a) : NextResponse.json({ error: 'Course not found.' }, { status: 404 });
});
export const PUT = (req: Request, { params }: { params: Promise<{ courseId: string }> }) => route(req, async (user) => {
  const a = await tutorAccess(user, (await params).courseId);
  return a ? saveRule(a, ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>) : NextResponse.json({ error: 'Course not found.' }, { status: 404 });
});
