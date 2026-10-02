import { NextResponse } from 'next/server';
import { emailOwnerDigest } from '@/server/owner-digest';
import { pruneAi } from '@/server/ai-budget';
import { emailSecurityReport } from '@/server/owner-health';

// The owner's morning summary email, run by its own cron trigger (cloudflare/worker.ts). Like the
// daily job, it isn't reachable from outside: only the scheduled handler knows the token. It also
// clears out AI usage counts and saved AI answers older than a month, and on Mondays sends the
// weekly security email.

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
  // Mondays: the weekly security email (the Health check), unless the owner turned it off.
  const security = new Date().getUTCDay() === 1 ? await emailSecurityReport().catch((e) => `failed: ${(e as Error).message}`) : 'not today';
  return NextResponse.json({ digest, security });
}
