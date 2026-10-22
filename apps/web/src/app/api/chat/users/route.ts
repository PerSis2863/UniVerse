import { NextResponse } from 'next/server';
import { presenceOf } from '@/lib/presence';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { isOnline, SYSTEM_EMAIL } from '@/lib/chat';
import { schoolsOf, usersIn } from '@/server/school-scope';

// GET ?q=: find people to message (name or email), excluding yourself and the system account.
// In a campus network (src/server/campus-network.ts) people at other campuses only show up if they
// turned on "Let partner campuses find me". Admins find all of their school and can always be found, and an
// exchange student counts as part of their host campus.
// Schools (src/server/school-scope.ts): admins find only their own school's people; anyone else finds
// their own school's people, and people of another school only on their campus or host campus, or
// who turned on "Let partner campuses find me".
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80);
  const me = user.role === 'ADMIN' ? null : await prisma.user.findUnique({ where: { id: user.id }, select: { campusId: true, studentProfile: { select: { exchangeCampusId: true } } } });
  const reach = me?.campusId ? [me.campusId, ...(me.studentProfile?.exchangeCampusId ? [me.studentProfile.exchangeCampusId] : [])] : null;
  const mine = usersIn(await schoolsOf(user));
  const school = user.role === 'ADMIN' || !reach ? mine : { OR: [mine, { campusId: { in: reach } }, { networkVisible: true }, { studentProfile: { exchangeCampusId: { in: reach } } }] };

  const people = await prisma.user.findMany({
    where: {
      id: { not: user.id },
      email: { not: SYSTEM_EMAIL },
      status: { not: 'SUSPENDED' },
      role: { not: 'GUARDIAN' }, // parent accounts only use the parent app (Stage 5 · B16.1)
      ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}),
      AND: [school, ...(reach ? [{ OR: [{ campusId: null }, { campusId: { in: reach } }, { networkVisible: true }, { role: 'ADMIN' as const }, { studentProfile: { exchangeCampusId: { in: reach } } }] }] : [])],
    },
    orderBy: [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
    take: 25,
    select: { id: true, name: true, avatar: true, role: true, lastSeenAt: true, presence: true, statusText: true, statusEmoji: true, statusUntil: true },
  });
  return NextResponse.json(
    people.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, role: p.role, online: isOnline(p.lastSeenAt, p.presence), status: presenceOf(p) })),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
