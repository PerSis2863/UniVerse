import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

// Where students from this campus have been accepted for internships (anonymised: no names).
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const rows = await prisma.internshipApplication.findMany({
    where: { status: 'ACCEPTED' },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      updatedAt: true,
      internship: { select: { title: true, location: true, type: true, duration: true, startDate: true, company: { select: { name: true, logoUrl: true, sector: true } } } },
    },
  });
  return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store' } });
}
