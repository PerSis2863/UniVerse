import { NextResponse } from 'next/server';
import { HttpException } from '@/server/http';
import { actOnToken, contactByToken } from '@/server/guardians';

type Ctx = { params: Promise<{ token: string }> };

// The link in a guardian's emails (no account needed): GET shows their settings, POST
// { action?: 'confirm' | 'stop', weeklyDigest?, absenceAlerts? } changes them. A button press,
// not the link itself, confirms or stops, so email scanners that open links change nothing.
async function run(work: () => Promise<unknown>) {
  try {
    return NextResponse.json(await work(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof HttpException) return NextResponse.json({ error: e.message }, { status: e.getStatus() });
    throw e;
  }
}

export const GET = async (_req: Request, { params }: Ctx) => run(async () => contactByToken((await params).token));
export const POST = async (req: Request, { params }: Ctx) => run(async () => actOnToken((await params).token, await req.json().catch(() => ({}))));
