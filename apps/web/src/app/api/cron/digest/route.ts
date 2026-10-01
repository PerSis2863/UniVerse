import { NextResponse } from 'next/server';
import { emailOwnerDigest } from '@/server/owner-digest';

// The owner's morning summary email, run by its own cron trigger (cloudflare/worker.ts). Like the
// daily job, it isn't reachable from outside: only the scheduled handler knows the token.

declare global {
  var __universeCronToken: string | undefined;
}

export async function POST(req: Request) {
  const token = req.headers.get('x-cron-token');
  if (!token || !globalThis.__universeCronToken || token !== globalThis.__universeCronToken) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ digest: await emailOwnerDigest() });
}
