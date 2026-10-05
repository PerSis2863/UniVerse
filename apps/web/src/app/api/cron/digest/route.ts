import { NextResponse } from 'next/server';
import { emailOwnerDigest } from '@/server/owner-digest';
import { pruneAi } from '@/server/ai-budget';
import { emailSecurityReport } from '@/server/owner-health';

// The owner's morning summary email, run by its own cron trigger (cloudflare/worker.ts). Like the
// daily job, it isn't reachable from outside: only the scheduled handler knows the token. It also
// clears out AI usage counts and saved AI answers older than a month, and sends the
// security email when it's due.

declare global {
  var __universeCronToken: string | undefined;
}

export async function POST(req: Request) {
  const token = req.headers.get('x-cron-token');
  if (!token || !globalThis.__universeCronToken || token !== globalThis.__universeCronToken) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const digest = await emailOwnerDigest();
  await pruneAi();
  // Weekly (Mondays) or monthly (the 1st), as set in the console; it decides itself.
  const security = await emailSecurityReport().catch((e) => `failed: ${(e as Error).message}`);
  return NextResponse.json({ digest, security });
}
