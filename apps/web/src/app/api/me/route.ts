import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

// The signed-in user's account-setup details, and updating phone / department.

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      name: true, email: true, phone: true, role: true, status: true,
      studentProfile: { select: { department: true } },
      teacherProfile: { select: { department: true } },
    },
  });
  if (!me) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  return NextResponse.json(
    {
      name: me.name,
      email: me.email,
      phone: me.phone,
      role: me.role,
      status: me.status,
      department: me.studentProfile?.department ?? me.teacherProfile?.department ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PATCH(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  if (typeof body.phone === 'string') {
    const phone = body.phone.trim();
    if (!/^\+?[0-9 ()-]{7,20}$/.test(phone)) return NextResponse.json({ error: 'Enter a valid phone number, e.g. +91 98765 43210.' }, { status: 400 });
    await prisma.user.update({ where: { id: user.id }, data: { phone } });
  }

  if (typeof body.department === 'string') {
    const department = body.department.trim().slice(0, 80);
    if (!department) return NextResponse.json({ error: 'Enter your department.' }, { status: 400 });
    if (user.role === 'STUDENT') {
      await prisma.studentProfile.upsert({ where: { userId: user.id }, update: { department }, create: { userId: user.id, department } });
    } else if (user.role === 'TEACHER') {
      await prisma.teacherProfile.upsert({ where: { userId: user.id }, update: { department }, create: { userId: user.id, department } });
    }
  }
  return NextResponse.json({ ok: true });
}
