import { NextResponse } from 'next/server';
import { remindDueCalls } from '@/server/scheduled-calls';

// Reminders for scheduled calls, run by the 15-minute cron (cloudflare/worker.ts) only when a
// call is actually due, so most runs never start the app. Not reachable from outside: only the
// scheduled handler knows the token.

declare global {
  var __universeCronToken: string | undefined;
}

export async function POST(req: Request) {
  const token = req.headers.get('x-cron-token');
  if (!token || !globalThis.__universeCronToken || token !== globalThis.__universeCronToken) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(await remindDueCalls());
}
