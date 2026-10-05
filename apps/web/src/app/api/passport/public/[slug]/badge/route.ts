import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { openSkillsBadgeFor } from '@/server/passport';

// GET: the signed skills badge of a PUBLIC passport, so a visitor (an employer) can verify it on
// the page or download it. Nothing is returned for private passports or without evidence.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(slug)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const p = await prisma.skillPassport.findUnique({ where: { slug }, select: { userId: true, isPublic: true, showEvidence: true } });
  if (!p?.isPublic || !p.showEvidence) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  let badge: Awaited<ReturnType<typeof openSkillsBadgeFor>>;
  try { badge = await openSkillsBadgeFor(p.userId); }
  catch { return NextResponse.json({ error: 'Signing isn’t set up yet.' }, { status: 503 }); }
  if (!badge) return NextResponse.json({ error: 'No evidence yet.' }, { status: 404 });
  return NextResponse.json({ jwt: badge.jwt, fileName: badge.fileName }, { headers: { 'Cache-Control': 'no-store' } });
}
