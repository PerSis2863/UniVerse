import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

// POST { courseId, durationSec, lines: [{ who, text }] }: a voice tutor session just ended. Saved
// as text for the owner console (src/server/modules/owner.ts voice-sessions); kept 90 days.

const MAX_LINES = 60;
const MAX_CHARS = 20_000;

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const durationSec = Math.max(0, Math.min(3600, Math.round(Number(b.durationSec) || 0)));
  let chars = 0;
  const lines = (Array.isArray(b.lines) ? b.lines : [])
    .slice(-MAX_LINES)
    .map((l: { who?: unknown; text?: unknown }) => ({ who: l?.who === 'tutor' ? 'tutor' : 'you', text: String(l?.text ?? '').trim().slice(0, 2000) }))
    .filter((l: { text: string }) => l.text && (chars += l.text.length) <= MAX_CHARS);
  const courseId = typeof b.courseId === 'string' && b.courseId ? b.courseId : null;
  await prisma.voiceSession.create({ data: { userId: user.id, courseId, durationSec, turns: lines.length, transcript: JSON.stringify(lines) } });
  return NextResponse.json({ ok: true }, { status: 201 });
}
