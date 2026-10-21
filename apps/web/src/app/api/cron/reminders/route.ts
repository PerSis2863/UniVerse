import { NextResponse } from 'next/server';
import { queriesUsed } from '@/lib/db';
import { remindDueCalls, sendDueReminders } from '@/server/scheduled-calls';
import { remindSupportFollowUps } from '@/server/support-plans';
import { sendDueScheduled } from '@/server/scheduled-messages';
import { sendMorningBriefs } from '@/server/daily-brief';
import { remindParentMeetings } from '@/server/parent-meetings';
import { remindDueTasks } from '@/server/tasks';
import { sendWeeklySummaries } from '@/server/parent-copilot';
import { sendDueAnnouncements } from '@/server/course-announcements';
import { sendDigests } from '@/server/notify-settings';
import { sendCardReminders } from '@/server/tutor-plus';
import { remindApplications } from '@/server/careers';

// Reminders for scheduled calls, parent meetings, scheduled chat messages, morning briefs, parents' weekly summaries and daily notification summaries, run by the 15-minute cron
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
  // Most urgent first. They share this run's 50 queries (Workers Free): when it's nearly used up,
  // the rest wait for the next run 15 minutes later (they're still due, so the check starts it).
  const jobs: [string, () => Promise<unknown>][] = [
    ['calls', () => remindDueCalls()],
    // Parent–teacher meetings starting soon (Stage 5 · B16.3)
    ['meetings', () => remindParentMeetings()],
    // Chat messages scheduled to send now (Stage 4 · 1.4), course announcements scheduled for now (Stage 5 · B2)
    ['scheduled', () => sendDueScheduled()],
    ['announcements', () => sendDueAnnouncements()],
    ['reminders', () => sendDueReminders()],
    // Task board automations: cards due within a day (Stage 5 · B9.10); application next steps (Q15)
    ['dueTasks', () => remindDueTasks()],
    ['applications', () => remindApplications()],
    // Early help: 7-day follow-ups of study plans (upgrade 3)
    ['followUps', () => remindSupportFollowUps()],
    // Morning briefs (Stage 4 · 4.9), parents' weekly summaries (D16), daily notification summaries (Q9), evening flashcards (Q13)
    ['briefs', () => sendMorningBriefs()],
    ['parentWeeks', () => sendWeeklySummaries()],
    ['digests', () => sendDigests()],
    ['cards', () => sendCardReminders()],
  ];
  const out: Record<string, unknown> = {};
  const waiting: string[] = [];
  for (const [name, run] of jobs) {
    if (queriesUsed() > 38) { waiting.push(name); continue; }
    out[name] = await run().catch((e) => (console.error(`${name} reminders failed:`, e), null));
  }
  const calls = (out.calls ?? {}) as Record<string, unknown>;
  delete out.calls;
  return NextResponse.json({ ...calls, ...out, waiting, queries: queriesUsed() });
}
