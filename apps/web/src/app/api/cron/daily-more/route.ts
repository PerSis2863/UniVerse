import { NextResponse } from 'next/server';
import { continueDailyJobs } from '@/server/daily-jobs';

// The rest of today's daily steps (src/server/daily-jobs.ts), from the 15-minute timer while some
// are left (cloudflare/due-check.ts `dailyPending`). Only callable from inside the Worker (the
// cron token, as for ../daily).
export async function POST(req: Request) {
  const token = req.headers.get('x-cron-token');
  if (!token || !globalThis.__universeCronToken || token !== globalThis.__universeCronToken) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(await continueDailyJobs());
}
