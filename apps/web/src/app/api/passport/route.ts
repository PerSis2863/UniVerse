import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { getOrCreatePassport, passportContent, passportUrl, resetPassportLink } from '@/server/passport';

// The signed-in student's skills passport: settings and a preview of what the public page shows.
// PATCH { isPublic?, headline?, showSkills?, showCredentials?, showCourses?, showImpact?, showEvidence?,
//         strengths?, hideEvidence?: { id, hidden }, resetLink? }

async function view(userId: string) {
  const p = await getOrCreatePassport(userId);
  const preview = await passportContent(userId, { showSkills: true, showCredentials: true, showCourses: true, showImpact: true, showEvidence: true }, true);
  return {
    isPublic: p.isPublic, headline: p.headline, url: passportUrl(p.slug), views: p.views,
    showSkills: p.showSkills, showCredentials: p.showCredentials, showCourses: p.showCourses, showImpact: p.showImpact, showEvidence: p.showEvidence,
    strengths: p.strengths, strengthsAt: p.strengthsAt,
    preview,
  };
}

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'STUDENT') return NextResponse.json({ error: 'The skills passport is for students.' }, { status: 403 });
  return NextResponse.json(await view(user.id), { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'STUDENT') return NextResponse.json({ error: 'The skills passport is for students.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  await getOrCreatePassport(user.id);
  const data: Record<string, boolean | string | null> = {};
  for (const k of ['isPublic', 'showSkills', 'showCredentials', 'showCourses', 'showImpact', 'showEvidence'] as const) if (typeof b[k] === 'boolean') data[k] = b[k];
  if (b.headline === null || typeof b.headline === 'string') data.headline = typeof b.headline === 'string' ? b.headline.trim().slice(0, 140) || null : null;
  // The strengths paragraph, as the student edited it
  const strengths = b.strengths === null || typeof b.strengths === 'string' ? (typeof b.strengths === 'string' ? b.strengths.replace(/\s+/g, ' ').trim().slice(0, 700) || null : null) : undefined;
  if (Object.keys(data).length || strengths !== undefined) {
    await prisma.skillPassport.update({ where: { userId: user.id }, data: { ...data, ...(strengths !== undefined ? { strengths } : {}) } });
  }
  // Hide (or show again) one piece of evidence on the public page
  if (b.hideEvidence && typeof b.hideEvidence.id === 'string') {
    await prisma.skillEvidence.updateMany({ where: { id: b.hideEvidence.id, userId: user.id }, data: { hidden: b.hideEvidence.hidden === true } });
  }
  if (b.resetLink === true) await resetPassportLink(user.id);
  return NextResponse.json(await view(user.id));
}
