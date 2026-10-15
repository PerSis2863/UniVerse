import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { courseAccess } from '@/lib/course-access';
import { ModuleError, pageView } from '@/server/course-modules';

// One module page (Stage 5 · B2, src/server/course-modules.ts): rich pages are loaded when opened.

type Ctx = { params: Promise<{ id: string; itemId: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return bad('Please sign in.', 401);
  const { id, itemId } = await params;
  const access = await courseAccess(id, user);
  if (!access) return bad('Course not found.', 404);
  try {
    return NextResponse.json(await pageView(id, user, access, itemId), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e instanceof ModuleError) return bad(e.message, e.status);
    throw e;
  }
}
