import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { verifyApiKey } from '@/server/public-api';

export async function GET(req: Request) {
  try {
    const auth = await verifyApiKey(req.headers.get('authorization'), 'courses.read');
    const courses = await prisma.course.findMany({
      take: 100,
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        credits: true,
        department: true,
        status: true,
        teacher: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({
      organization: auth.organization,
      courses,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status || 401;
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await verifyApiKey(req.headers.get('authorization'), 'courses.write');
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const code = String(body.code || '').trim().toUpperCase();
    const name = String(body.name || '').trim();
    const credits = Number(body.credits) || 3;
    const description = typeof body.description === 'string' ? body.description : null;

    if (!code || !name) {
      return NextResponse.json({ error: 'code and name are required' }, { status: 400 });
    }

    const defaultTeacher = await prisma.user.findFirst({
      where: { role: 'TEACHER', ...(auth.organization?.id ? { organizationId: auth.organization.id } : {}) },
      select: { id: true },
    });

    const teacherId = typeof body.teacherId === 'string' ? body.teacherId : defaultTeacher?.id;
    if (!teacherId) {
      return NextResponse.json({ error: 'No faculty member found to assign as course teacher.' }, { status: 400 });
    }

    const course = await prisma.course.create({
      data: {
        code,
        name,
        description,
        credits,
        status: 'PUBLISHED',
        teacherId,
      },
    });

    return NextResponse.json(course, { status: 201 });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status || 401;
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status });
  }
}
