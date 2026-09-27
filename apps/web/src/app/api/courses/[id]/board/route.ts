import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { courseAccess } from '@/lib/course-access';
import { isAppFileUrl } from '@/lib/storage';

type Ctx = { params: Promise<{ id: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isHttpUrl = (v: string) => { try { return ['http:', 'https:'].includes(new URL(v).protocol); } catch { return false; } };

function fileTypeOf(name: string, url: string): 'PDF' | 'DOCX' | 'VIDEO' | 'IMAGE' | 'OTHER' {
  const s = `${name} ${url}`.toLowerCase();
  if (/\.pdf\b/.test(s)) return 'PDF';
  if (/\.(docx?|pptx?|xlsx?|txt|csv)\b/.test(s)) return 'DOCX';
  if (/\.(mp4|mov|webm)\b|youtube\.com|youtu\.be|vimeo\.com/.test(s)) return 'VIDEO';
  if (/\.(png|jpe?g|gif|webp)\b/.test(s)) return 'IMAGE';
  return 'OTHER';
}

// GET: everything on a course's Blackboard, shaped for the viewer (teacher sees the gradebook and quizzes; students see their own results).
export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return bad('Please sign in.', 401);
  const { id } = await params;
  const access = await courseAccess(id, user);
  if (!access) return bad('Course not found.', 404);
  const { course, canManage } = access;

  const [announcements, materials, readings, events] = await Promise.all([
    prisma.announcement.findMany({ where: { courseId: id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, title: true, body: true, createdAt: true, author: { select: { name: true } } } }),
    prisma.material.findMany({ where: { courseId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, type: true, fileUrl: true, size: true, createdAt: true } }),
    prisma.knowledgeHubResource.findMany({ where: { courseId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, description: true, url: true, category: true, createdAt: true } }),
    prisma.calendarEvent.findMany({ where: { courseId: id, endAt: { gte: new Date(Date.now() - 86_400_000) } }, orderBy: { startAt: 'asc' }, take: 50, select: { id: true, title: true, description: true, startAt: true, endAt: true, type: true } }),
  ]);

  if (canManage) {
    const [quizzes, grades, enrollments] = await Promise.all([
      prisma.quiz.findMany({ where: { courseId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, status: true, dueDate: true, _count: { select: { questions: true, submissions: true } } } }),
      prisma.grade.findMany({ where: { courseId: id }, select: { studentId: true, score: true, maxScore: true } }),
      prisma.enrollment.findMany({ where: { courseId: id }, select: { student: { select: { id: true, name: true, email: true } } }, orderBy: { enrolledAt: 'asc' } }),
    ]);
    const byStudent = new Map<string, { sum: number; n: number }>();
    for (const g of grades) {
      const cur = byStudent.get(g.studentId) ?? { sum: 0, n: 0 };
      cur.sum += g.maxScore > 0 ? (g.score / g.maxScore) * 100 : 0;
      cur.n += 1;
      byStudent.set(g.studentId, cur);
    }
    const roster = enrollments.map(({ student }) => {
      const s = byStudent.get(student.id);
      return { ...student, graded: s?.n ?? 0, average: s ? Math.round(s.sum / s.n) : null };
    });
    return NextResponse.json({ course, canManage, announcements, materials, readings, events, quizzes, roster }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const [grades, quizResults] = await Promise.all([
    prisma.grade.findMany({ where: { courseId: id, studentId: user.id }, orderBy: { gradedAt: 'desc' }, select: { id: true, assignmentName: true, score: true, maxScore: true, status: true, feedback: true, gradedAt: true } }),
    prisma.quizSubmission.findMany({ where: { studentId: user.id, quiz: { courseId: id } }, orderBy: { submittedAt: 'desc' }, select: { id: true, score: true, maxScore: true, submittedAt: true, quiz: { select: { id: true, title: true, status: true } } } }),
  ]);
  return NextResponse.json({ course, canManage, announcements, materials, readings, events, grades, quizResults }, { headers: { 'Cache-Control': 'no-store' } });
}

// POST { kind: 'announcement' | 'material' | 'reading' | 'event', ... } — teacher/admin only.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return bad('Please sign in.', 401);
  const { id } = await params;
  const access = await courseAccess(id, user);
  if (!access) return bad('Course not found.', 404);
  if (!access.canManage) return bad('Only the course teacher can post here.', 403);

  const b = await req.json().catch(() => ({}));
  const title = str(b.title, 200);
  if (!title) return bad('Please add a title.');

  switch (b.kind) {
    case 'announcement': {
      const body = str(b.body, 5000);
      if (!body) return bad('Please write the announcement.');
      const item = await prisma.announcement.create({ data: { title, body, courseId: id, authorId: user.id, target: 'COURSE' } });
      // Let enrolled students know.
      const students = await prisma.enrollment.findMany({ where: { courseId: id }, select: { studentId: true } });
      if (students.length) {
        await prisma.notification.createMany({
          data: students.map((s) => ({ userId: s.studentId, title: `${access.course.code}: ${title}`, body: body.slice(0, 200), type: 'announcement', link: '/student/blackboard' })),
        });
      }
      return NextResponse.json(item, { status: 201 });
    }
    case 'material': {
      const fileUrl = str(b.url, 1000);
      if (!isAppFileUrl(fileUrl) && !isHttpUrl(fileUrl)) return bad('Attach a file or paste a valid link.');
      const item = await prisma.material.create({
        data: { title, fileUrl, courseId: id, uploadedById: user.id, type: fileTypeOf(str(b.fileName, 200), fileUrl), size: str(b.size, 20) || null },
      });
      return NextResponse.json(item, { status: 201 });
    }
    case 'reading': {
      const url = str(b.url, 1000);
      if (url && !isHttpUrl(url)) return bad('Links must start with http:// or https://');
      const item = await prisma.knowledgeHubResource.create({
        data: { title, url: url || null, description: str(b.description, 1000) || null, category: str(b.category, 60) || null, courseId: id, authorId: user.id },
      });
      return NextResponse.json(item, { status: 201 });
    }
    case 'event': {
      const startAt = new Date(b.startAt);
      if (Number.isNaN(startAt.getTime())) return bad('Pick a date and time.');
      const minutes = Math.min(Math.max(Number(b.durationMinutes) || 60, 5), 24 * 60);
      const type = ['EXAM', 'DEADLINE', 'MEETING'].includes(b.type) ? b.type : 'MEETING';
      const item = await prisma.calendarEvent.create({
        data: { title, description: str(b.description, 1000) || null, startAt, endAt: new Date(startAt.getTime() + minutes * 60_000), type, courseId: id, userId: user.id },
      });
      return NextResponse.json(item, { status: 201 });
    }
    default:
      return bad('Unknown item type.');
  }
}

// DELETE ?kind=...&itemId=... — teacher/admin only; the item must belong to this course.
export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return bad('Please sign in.', 401);
  const { id } = await params;
  const access = await courseAccess(id, user);
  if (!access) return bad('Course not found.', 404);
  if (!access.canManage) return bad('Only the course teacher can remove items.', 403);

  const sp = new URL(req.url).searchParams;
  const itemId = sp.get('itemId') ?? '';
  const where = { id: itemId, courseId: id };
  const result =
    sp.get('kind') === 'announcement' ? await prisma.announcement.deleteMany({ where })
    : sp.get('kind') === 'material' ? await prisma.material.deleteMany({ where })
    : sp.get('kind') === 'reading' ? await prisma.knowledgeHubResource.deleteMany({ where })
    : sp.get('kind') === 'event' ? await prisma.calendarEvent.deleteMany({ where })
    : null;
  if (!result) return bad('Unknown item type.');
  if (result.count === 0) return bad('Item not found.', 404);
  return NextResponse.json({ ok: true });
}
