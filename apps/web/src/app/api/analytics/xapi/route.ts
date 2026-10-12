import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { listXApiStatements, recordXApiStatement } from '@/server/analytics-warehouse';

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const verb = searchParams.get('verb') || undefined;
  const objectType = searchParams.get('objectType') || undefined;
  const contextCourseId = searchParams.get('courseId') || undefined;
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50;
  const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : 0;

  try {
    const data = await listXApiStatements({
      organizationId: user.organizationId || undefined,
      actorId: user.role === 'ADMIN' ? undefined : user.id,
      verb,
      objectType,
      contextCourseId,
      limit,
      offset,
    });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query xAPI statements';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const stmt = await recordXApiStatement({
      organizationId: user.organizationId || null,
      actorId: user.id,
      actorType: user.role || 'USER',
      verb: String(body.verb || ''),
      objectType: String(body.objectType || ''),
      objectId: String(body.objectId || ''),
      objectName: typeof body.objectName === 'string' ? body.objectName : null,
      resultScore: typeof body.resultScore === 'number' ? body.resultScore : null,
      resultSuccess: typeof body.resultSuccess === 'boolean' ? body.resultSuccess : null,
      resultCompletion: typeof body.resultCompletion === 'boolean' ? body.resultCompletion : null,
      durationSeconds: typeof body.durationSeconds === 'number' ? body.durationSeconds : null,
      contextCourseId: typeof body.contextCourseId === 'string' ? body.contextCourseId : null,
      contextSessionId: typeof body.contextSessionId === 'string' ? body.contextSessionId : null,
      rawPayload: typeof body.rawPayload === 'object' && body.rawPayload ? (body.rawPayload as Record<string, unknown>) : null,
    });

    return NextResponse.json(stmt, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to record xAPI statement';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
