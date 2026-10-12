import { NextResponse } from 'next/server';
import { verifyScholarshipByQr } from '@/server/impact-scholarships';

type Ctx = { params: Promise<{ token: string }> };

export const GET = async (_req: Request, { params }: Ctx) => {
  const { token } = await params;
  const result = await verifyScholarshipByQr(token);
  return NextResponse.json(result, { status: result.verified ? 200 : 404 });
};
