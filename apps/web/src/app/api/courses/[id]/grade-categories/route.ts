import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { courseAccess } from '@/lib/course-access';
import { planLimits } from '@/lib/plan-limits';
import { oneOf, str, text, type Body } from '@/server/body';
import { publish } from '@/server/realtime';

// Gradebook categories (Stage 5 · B3.4; maths in src/lib/gradebook.ts).
// GET: the course's categories and which category each assessment is in (teacher and students).
// POST { action }: the teacher adds, edits or removes a category, or puts an assessment in one.

type Ctx = { params: Promise<{ id: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const ACTIONS = ['create', 'update', 'delete', 'assign'] as const;
const MAX_CATEGORIES = 12;

async function view(courseId: string) {
  const [categories, assessments] = await Promise.all([
    prisma.gradeCategory.findMany({ where: { courseId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, weight: true, dropLowest: true } }),
    prisma.gradeAssessment.findMany({ where: { courseId }, select: { name: true, categoryId: true } }),
  ]);
  return { categories, assessments };
}

export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return bad('Please sign in.', 401);
  const { id } = await params;
  if (!(await courseAccess(id, user))) return bad('Course not found.', 404);
  return NextResponse.json(await view(id), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return bad('Please sign in.', 401);
  const { id } = await params;
  const access = await courseAccess(id, user);
  if (!access) return bad('Course not found.', 404);
  if (!access.canManage) return bad('Only the course teacher can change the gradebook.', 403);
  const b = ((await req.json().catch(() => null)) ?? {}) as Body;
  if (!oneOf(ACTIONS, b.action)) return bad('Unknown action.');

  const fields = (cur?: { name: string; weight: number; dropLowest: number }) => {
    const name = b.name === undefined && cur ? cur.name : text(b.name).trim().slice(0, 60);
    const weight = b.weight === undefined && cur ? cur.weight : Number(b.weight);
    const drop = b.dropLowest === undefined && cur ? cur.dropLowest : Number(b.dropLowest ?? 0);
    if (!name) return 'Give the category a name.';
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) return 'The weight is a percentage from 0 to 100.';
    if (!Number.isInteger(drop) || drop < 0 || drop > 10) return 'Drop between 0 and 10 lowest grades.';
    return { name, weight: Math.round(weight * 10) / 10, dropLowest: drop };
  };
  const category = async () => {
    const c = await prisma.gradeCategory.findFirst({ where: { id: text(b.categoryId), courseId: id } });
    return c;
  };

  switch (b.action) {
    case 'create': {
      const f = fields();
      if (typeof f === 'string') return bad(f);
      const n = await prisma.gradeCategory.count({ where: { courseId: id } });
      if (n >= MAX_CATEGORIES) return bad(`A course can have up to ${MAX_CATEGORIES} categories.`);
      await prisma.gradeCategory.create({ data: { ...f, courseId: id, position: n } });
      break;
    }
    case 'update': {
      const c = await category();
      if (!c) return bad('Category not found.', 404);
      const f = fields(c);
      if (typeof f === 'string') return bad(f);
      await prisma.gradeCategory.update({ where: { id: c.id }, data: f });
      break;
    }
    case 'delete': {
      const c = await category();
      if (!c) return bad('Category not found.', 404);
      await prisma.gradeCategory.delete({ where: { id: c.id } });
      break;
    }
    case 'assign': {
      const name = text(b.name).trim().slice(0, 200);
      if (!name) return bad('Which assessment?');
      const categoryId = str(b.categoryId);
      if (!categoryId) {
        await prisma.gradeAssessment.deleteMany({ where: { courseId: id, name } });
        break;
      }
      const c = await category();
      if (!c) return bad('Category not found.', 404);
      await prisma.gradeAssessment.upsert({ where: { courseId_name: { courseId: id, name } }, update: { categoryId: c.id }, create: { courseId: id, name, categoryId: c.id } });
      break;
    }
  }
  // The class's grade pages recalculate.
  const enrolled = await prisma.enrollment.findMany({ where: { courseId: id }, select: { studentId: true }, take: planLimits().livePushes });
  publish([user.id, ...enrolled.map((e) => e.studentId)], { type: 'refresh', keys: [`/api/courses/${id}/grade-categories`] });
  return NextResponse.json(await view(id));
}
