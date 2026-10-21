import { NextResponse } from 'next/server';
import { continueDailyJobs, startDailyJobs } from '@/server/daily-jobs';

// Daily job, run by the Worker's cron trigger (cloudflare/worker.ts → wrangler.jsonc "triggers").
// It isn't reachable from outside: the scheduled handler calls it in-process with a random
// token that only exists inside this Worker instance. It starts today's list of steps
// (src/server/daily-jobs.ts: reminders, retention, early warning, digests, nudges, error
// diagnosis…) and does what fits in this run; the 15-minute timer carries on (../daily-more).

declare global {
  var __universeCronToken: string | undefined;
}

export async function POST(req: Request) {
  const token = req.headers.get('x-cron-token');
  if (!token || !globalThis.__universeCronToken || token !== globalThis.__universeCronToken) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await startDailyJobs();
  return NextResponse.json(await continueDailyJobs());
}
