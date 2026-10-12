import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { audit } from '@/server/audit';
import { importPackIntoCourse } from '@/server/marketplace';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only teachers and administrators can import curriculum packs' }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const targetCourseId = typeof body.targetCourseId === 'string' ? body.targetCourseId : '';

  if (!targetCourseId) {
    return NextResponse.json({ error: 'targetCourseId is required' }, { status: 400 });
  }

  try {
    const res = await importPackIntoCourse({
      packId: id,
      targetCourseId,
      userId: user.id,
      userRole: user.role,
      paymentOrderId: typeof body.paymentOrderId === 'string' ? body.paymentOrderId : undefined,
    });

    audit(
      user,
      {
        action: 'marketplace.pack_imported',
        summary: `Imported marketplace pack ${id} (${res.modulesImported} modules, ${res.itemsImported} items) into course ${targetCourseId}`,
        targetType: 'course',
        targetId: targetCourseId,
      },
      req,
    );

    return NextResponse.json(res, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to import pack';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
