import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { listSources, prepareSources, tutorAccess } from '@/server/tutor';

type Ctx = { params: Promise<{ courseId: string }> };

// GET: the course's sources. POST { action: 'prepare' } reads new materials (anyone with access,
// so the first student to ask can get it ready); POST { title, text } adds a teacher note.
// DELETE ?id= removes a note or a read material (teacher / admin).
export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const a = await tutorAccess(user, (await params).courseId);
  if (!a) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  return NextResponse.json({ course: { id: a.courseId, code: a.courseCode, name: a.courseName }, canManage: a.role !== 'STUDENT', sources: await listSources(a.courseId) });
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const a = await tutorAccess(user, (await params).courseId);
  if (!a) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (b.action === 'prepare') {
    if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: 'The AI tutor isn’t set up yet.' }, { status: 503 });
    return NextResponse.json(await prepareSources(a.courseId));
  }
  if (a.role === 'STUDENT') return NextResponse.json({ error: 'Only the teacher can add notes.' }, { status: 403 });
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 120) : '';
  const text = typeof b.text === 'string' ? b.text.trim().slice(0, 60_000) : '';
  if (!title || text.length < 40) return NextResponse.json({ error: 'Give the note a title and at least a few sentences of text.' }, { status: 400 });
  const s = await prisma.courseSource.create({ data: { courseId: a.courseId, title, text, chars: text.length, kind: 'note', status: 'READY' } });
  return NextResponse.json({ id: s.id });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const a = await tutorAccess(user, (await params).courseId);
  if (!a || a.role === 'STUDENT') return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  const id = new URL(req.url).searchParams.get('id') ?? '';
  await prisma.courseSource.deleteMany({ where: { id, courseId: a.courseId } });
  return NextResponse.json({ ok: true });
}
