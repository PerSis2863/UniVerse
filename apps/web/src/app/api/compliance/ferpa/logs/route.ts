import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { cleanRecordType, getEducationalRecordAccessLogs, logEducationalRecordAccess } from '@/server/compliance';

// FERPA: Educational record access logs (34 CFR Part 99).
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const studentId = url.searchParams.get('studentId') || user.id;

  try {
    const logs = await getEducationalRecordAccessLogs(studentId, user);
    return NextResponse.json(logs, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status || 403;
    const message = err instanceof Error ? err.message : 'Forbidden';
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  if (!studentId) return NextResponse.json({ error: 'studentId is required' }, { status: 400 });

  try {
    const recordType = cleanRecordType(body.recordType);
    const reason = typeof body.reason === 'string' ? body.reason : null;
    const ipAddress = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for');
    const userAgent = req.headers.get('user-agent');

    const log = await logEducationalRecordAccess({
      studentId,
      actorId: user.id,
      recordType,
      reason,
      ipAddress,
      userAgent,
    });

    return NextResponse.json(log);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
