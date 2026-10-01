import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireFeature } from '@/lib/billing';

// Escapes a CSV cell, and neutralises leading = + - @ so spreadsheet apps don't run it as a formula.
function cell(value: unknown): string {
  let s = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

const ROLES = ['STUDENT', 'TEACHER', 'ADMIN', 'INDUSTRY_MENTOR'] as const;
const STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED'] as const;
type MemberFilter = { role?: (typeof ROLES)[number]; status?: (typeof STATUSES)[number]; q?: string };

/** Optional filters for the members export: ?role=TEACHER&status=ACTIVE&q=smith (name, email or phone). */
function memberFilter(params: URLSearchParams): MemberFilter {
  const role = params.get('role')?.toUpperCase();
  const status = params.get('status')?.toUpperCase();
  const q = params.get('q')?.trim().slice(0, 100);
  return {
    role: (ROLES as readonly string[]).includes(role ?? '') ? (role as MemberFilter['role']) : undefined,
    status: (STATUSES as readonly string[]).includes(status ?? '') ? (status as MemberFilter['status']) : undefined,
    q: q || undefined,
  };
}

function memberWhere(f: MemberFilter) {
  return {
    ...(f.role ? { role: f.role } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.q ? { OR: [{ name: { contains: f.q } }, { email: { contains: f.q.toLowerCase() } }, { phone: { contains: f.q } }] } : {}),
  };
}

const MEMBER_SELECT = {
  id: true, name: true, email: true, phone: true, role: true, status: true, accountType: true,
  impactLevel: true, impactXP: true, lastSeenAt: true, createdAt: true,
  studentProfile: { select: { department: true, year: true, gpa: true } },
  teacherProfile: { select: { department: true, designation: true } },
} as const;

const EXPORTS = {
  members: async (params: URLSearchParams) => {
    const users = await prisma.user.findMany({
      where: memberWhere(memberFilter(params)),
      orderBy: { createdAt: 'asc' },
      take: 20_000,
      select: MEMBER_SELECT,
    });
    return toCsv(
      ['Name', 'Email', 'Phone', 'Role', 'Status', 'Account type', 'Department', 'Year', 'GPA', 'Designation', 'Impact level', 'Impact XP', 'Last active', 'Joined'],
      users.map((u) => [
        u.name, u.email, u.phone ?? '', u.role, u.status, u.accountType ?? '',
        u.studentProfile?.department ?? u.teacherProfile?.department ?? '',
        u.studentProfile?.year ?? '', u.studentProfile && u.studentProfile.gpa > 0 ? u.studentProfile.gpa : '',
        u.teacherProfile?.designation ?? '',
        u.impactLevel, u.impactXP, u.lastSeenAt ?? 'Never', u.createdAt,
      ]),
    );
  },
  impact: async () => {
    const points = await prisma.impactPoint.findMany({
      orderBy: { awardedAt: 'desc' },
      take: 50_000,
      select: { points: true, reason: true, sourceType: true, awardedAt: true, user: { select: { name: true, email: true, phone: true, role: true, status: true } } },
    });
    return toCsv(
      ['Member', 'Email', 'Phone', 'Role', 'Status', 'Points', 'Reason', 'Source', 'Awarded'],
      points.map((p) => [p.user.name, p.user.email, p.user.phone ?? '', p.user.role, p.user.status, p.points, p.reason, p.sourceType, p.awardedAt]),
    );
  },
  applications: async () => {
    const apps = await prisma.nGOProjectApplication.findMany({
      orderBy: { appliedAt: 'desc' },
      select: {
        status: true, appliedAt: true,
        student: { select: { name: true, email: true, phone: true, role: true, status: true } },
        project: { select: { name: true, ngo: { select: { name: true } } } },
      },
      take: 20_000,
    });
    return toCsv(
      ['Student', 'Email', 'Phone', 'Role', 'Account status', 'Project', 'NGO', 'Application status', 'Applied'],
      apps.map((a) => [a.student.name, a.student.email, a.student.phone ?? '', a.student.role, a.student.status, a.project.name, a.project.ngo.name, a.status, a.appliedAt]),
    );
  },
};

export async function GET(req: Request) {
  const auth = await requireFeature(req, 'data_exports');
  if (auth instanceof NextResponse) return auth;

  const params = new URL(req.url).searchParams;
  const type = params.get('type') ?? '';
  if (!(type in EXPORTS)) return NextResponse.json({ error: 'Unknown export type.' }, { status: 400 });

  // ?type=members&format=json : a preview of who the members export will contain (first 50 + total).
  if (type === 'members' && params.get('format') === 'json') {
    const where = memberWhere(memberFilter(params));
    const [total, people] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, select: MEMBER_SELECT }),
    ]);
    return NextResponse.json({ total, people }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const csv = await EXPORTS[type as keyof typeof EXPORTS](params);
  const date = new Date().toISOString().slice(0, 10);
  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="universe-${type}-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
