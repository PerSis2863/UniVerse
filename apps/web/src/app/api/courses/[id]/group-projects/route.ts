import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import type { Body } from '@/server/body';
import { HttpException } from '@/server/http';
import { courseProjects, refreshCourseProject } from '@/server/group-autopilot';

// Course board → Group projects, for the course's teacher (Stage 5 · D6): the group projects linked
// to this course with their latest weekly report. POST { planId }: bring one report up to date.

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  try {
    return NextResponse.json({ projects: await courseProjects((await params).id, user) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof HttpException) return NextResponse.json({ error: e.message }, { status: e.getStatus() });
    throw e;
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const b = ((await req.json().catch(() => null)) ?? {}) as Body;
  try {
    return NextResponse.json({ report: await refreshCourseProject((await params).id, user, b.planId) });
  } catch (e) {
    if (e instanceof HttpException) return NextResponse.json({ error: e.message }, { status: e.getStatus() });
    throw e;
  }
}
