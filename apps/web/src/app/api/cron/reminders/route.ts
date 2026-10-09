import { NextResponse } from 'next/server';
import { remindDueCalls, sendDueReminders } from '@/server/scheduled-calls';
import { remindSupportFollowUps } from '@/server/support-plans';
import { sendDueScheduled } from '@/server/scheduled-messages';
import { sendMorningBriefs } from '@/server/daily-brief';
import { remindParentMeetings } from '@/server/parent-meetings';

// Reminders for scheduled calls, parent meetings, scheduled chat messages and morning briefs, run by the 15-minute cron
// (cloudflare/worker.ts) only when something is actually due, so most runs never start the app. Not reachable from outside: only the
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
  // Chat messages scheduled to send now (Stage 4 · 1.4)
  const scheduled = await sendDueScheduled().catch((e) => (console.error('scheduled messages failed:', e), null));
  // Morning briefs due now (Stage 4 · 4.9)
  const briefs = await sendMorningBriefs().catch((e) => (console.error('morning briefs failed:', e), null));
  // Parent–teacher meetings starting soon (Stage 5 · B16.3)
  const meetings = await remindParentMeetings().catch((e) => (console.error('parent meeting reminders failed:', e), null));
  return NextResponse.json({ ...calls, reminders, followUps, scheduled, briefs, meetings });
}
