import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { courseAccess } from '@/lib/course-access';
import { ModuleError, changeModules, modulesView } from '@/server/course-modules';
import type { Body } from '@/server/body';

// Course modules (Stage 5 · B2, src/server/course-modules.ts).
// GET: the modules shaped for the viewer. POST { action, ... }: teachers build them, students mark
// items done.

type Ctx = { params: Promise<{ id: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function load(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return { error: bad('Please sign in.', 401) } as const;
  const { id } = await params;
  const access = await courseAccess(id, user);
  if (!access) return { error: bad('Course not found.', 404) } as const;
  return { user, id, access } as const;
}

export async function GET(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if ('error' in r) return r.error;
  return NextResponse.json(await modulesView(r.id, r.user, r.access), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if ('error' in r) return r.error;
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== 'object') return bad('Nothing to change.');
  try {
    return NextResponse.json(await changeModules(r.id, r.user, r.access, body));
  } catch (e) {
    if (e instanceof ModuleError) return bad(e.message, e.status);
    throw e;
  }
}
