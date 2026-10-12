import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { verifyApiKey } from '@/server/public-api';

export async function GET(req: Request) {
  try {
    const auth = await verifyApiKey(req.headers.get('authorization'), 'grades.read');
    const url = new URL(req.url);
    const courseId = url.searchParams.get('courseId');

    const grades = await prisma.grade.findMany({
      where: courseId ? { courseId } : {},
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        studentId: true,
        courseId: true,
        score: true,
        feedback: true,
        createdAt: true,
        student: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({
      organization: auth.organization,
      grades,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status || 401;
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status });
  }
}
