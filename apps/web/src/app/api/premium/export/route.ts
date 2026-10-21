import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { EXPORTS, MEMBER_SELECT, isExportType, memberFilter, memberWhere } from '@/server/report-exports';
import { requireFeature } from '@/lib/billing';

export async function GET(req: Request) {
  const auth = await requireFeature(req, 'data_exports');
  if (auth instanceof NextResponse) return auth;

  const params = new URL(req.url).searchParams;
  const type = params.get('type') ?? '';
  if (!isExportType(type)) return NextResponse.json({ error: 'Unknown export type.' }, { status: 400 });

  // ?type=members&format=json : a preview of who the members export will contain (first 50 + total).
  if (type === 'members' && params.get('format') === 'json') {
    const where = memberWhere(memberFilter(params));
    const [total, people] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, select: MEMBER_SELECT }),
    ]);
    return NextResponse.json({ total, people }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const csv = await EXPORTS[type](params);
  const date = new Date().toISOString().slice(0, 10);
  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="universe-${type}-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
