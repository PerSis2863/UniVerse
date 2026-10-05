import { NextResponse } from 'next/server';
import { remindDueCalls, sendDueReminders } from '@/server/scheduled-calls';
import { remindSupportFollowUps } from '@/server/support-plans';

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
  const calls = await remindDueCalls();
  const reminders = await sendDueReminders().catch((e) => (console.error('chat reminders failed:', e), 0));
  // Early help: 7-day follow-ups of study plans (upgrade 3)
  const followUps = await remindSupportFollowUps().catch((e) => (console.error('support plan follow-ups failed:', e), 0));
  return NextResponse.json({ ...calls, reminders, followUps });
}
