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

const EXPORTS = {
  members: async () => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: { name: true, email: true, role: true, status: true, impactLevel: true, impactXP: true, createdAt: true },
    });
    return toCsv(
      ['Name', 'Email', 'Role', 'Status', 'Impact level', 'Impact XP', 'Joined'],
      users.map((u) => [u.name, u.email, u.role, u.status, u.impactLevel, u.impactXP, u.createdAt]),
    );
  },
  impact: async () => {
    const points = await prisma.impactPoint.findMany({
      orderBy: { awardedAt: 'desc' },
      select: { points: true, reason: true, sourceType: true, awardedAt: true, user: { select: { name: true, email: true } } },
    });
    return toCsv(
      ['Member', 'Email', 'Points', 'Reason', 'Source', 'Awarded'],
      points.map((p) => [p.user.name, p.user.email, p.points, p.reason, p.sourceType, p.awardedAt]),
    );
  },
  applications: async () => {
    const apps = await prisma.nGOProjectApplication.findMany({
      orderBy: { appliedAt: 'desc' },
      select: {
        status: true, appliedAt: true,
        student: { select: { name: true, email: true } },
        project: { select: { name: true, ngo: { select: { name: true } } } },
      },
    });
    return toCsv(
      ['Student', 'Email', 'Project', 'NGO', 'Status', 'Applied'],
      apps.map((a) => [a.student.name, a.student.email, a.project.name, a.project.ngo.name, a.status, a.appliedAt]),
    );
  },
};

export async function GET(req: Request) {
  const auth = await requireFeature(req, 'data_exports');
  if (auth instanceof NextResponse) return auth;

  const type = new URL(req.url).searchParams.get('type') ?? '';
  if (!(type in EXPORTS)) return NextResponse.json({ error: 'Unknown export type.' }, { status: 400 });

  const csv = await EXPORTS[type as keyof typeof EXPORTS]();
  const date = new Date().toISOString().slice(0, 10);
  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="universe-${type}-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
