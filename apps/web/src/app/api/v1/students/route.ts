import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { verifyApiKey } from '@/server/public-api';

export async function GET(req: Request) {
  try {
    const auth = await verifyApiKey(req.headers.get('authorization'), 'students.read');
    const where: Record<string, unknown> = { role: 'STUDENT' };
    if (auth.organization?.id) where.organizationId = auth.organization.id;

    const students = await prisma.user.findMany({
      where,
      take: 100,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      organization: auth.organization,
      students,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status || 401;
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status });
  }
}
