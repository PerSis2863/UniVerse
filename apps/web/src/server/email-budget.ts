import prisma from '@/lib/db';

// Keeps email inside the Resend plan's allowance (the free plan: 100 a day, 3,000 a month).
// Every email is counted here. Routine email (notification copies, reminders, digests) stops
// once it would eat into a reserve kept for essential email: sign-in codes and account
// confirmations, which must never fail because a busy chat used the allowance up. In-app
// notifications aren't affected; only their email copy is skipped.
//
// EMAIL_DAILY_LIMIT / EMAIL_MONTHLY_LIMIT override the limits (e.g. on a paid Resend plan).

export type EmailKind = 'essential' | 'routine';

const num = (v: string | undefined, d: number) => (v && Number(v) > 0 ? Math.floor(Number(v)) : d);
export function emailLimits() {
  const daily = num(process.env.EMAIL_DAILY_LIMIT, 100);
  const monthly = num(process.env.EMAIL_MONTHLY_LIMIT, 3000);
  // Kept back for essential email: a fifth of the day (at least 10), a tenth of the month (at least 100).
  return { daily, monthly, dailyReserve: Math.max(10, Math.floor(daily / 5)), monthlyReserve: Math.max(100, Math.floor(monthly / 10)) };
}

const today = () => new Date().toISOString().slice(0, 10);

export async function emailUsage() {
  const day = today();
  const rows = await prisma.$queryRawUnsafe<{ sentToday: number | bigint | null; skippedToday: number | bigint | null; sentMonth: number | bigint | null }[]>(
    `SELECT (SELECT sent FROM email_usage WHERE day = ?) AS sentToday, (SELECT skipped FROM email_usage WHERE day = ?) AS skippedToday,
            (SELECT SUM(sent) FROM email_usage WHERE day LIKE ?) AS sentMonth`,
    day, day, `${day.slice(0, 7)}-%`,
  );
  const r = rows[0];
  return { sentToday: Number(r?.sentToday ?? 0), skippedToday: Number(r?.skippedToday ?? 0), sentMonth: Number(r?.sentMonth ?? 0), ...emailLimits() };
}

/**
 * Claims up to `wanted` emails of this kind and returns how many may be sent now (0 to wanted).
 * Counted before sending, so two requests at once can't both take the last few.
 */
export async function claimEmails(wanted: number, kind: EmailKind): Promise<number> {
  if (wanted <= 0) return 0;
  try {
    const u = await emailUsage();
    const dayCap = kind === 'essential' ? u.daily : u.daily - u.dailyReserve;
    const monthCap = kind === 'essential' ? u.monthly : u.monthly - u.monthlyReserve;
    const allowed = Math.max(0, Math.min(wanted, dayCap - u.sentToday, monthCap - u.sentMonth));
    await prisma.$executeRawUnsafe(
      'INSERT INTO email_usage (day, sent, skipped) VALUES (?, ?, ?) ON CONFLICT(day) DO UPDATE SET sent = sent + excluded.sent, skipped = skipped + excluded.skipped',
      today(), allowed, wanted - allowed,
    );
    if (allowed < wanted) console.warn(`email budget: sending ${allowed} of ${wanted} ${kind} email(s) (today ${u.sentToday}/${u.daily}, month ${u.sentMonth}/${u.monthly})`);
    return allowed;
  } catch (e) {
    // Counting failed (e.g. the table isn't there yet): essential email still goes, routine waits.
    console.error('email budget check failed:', e);
    return kind === 'essential' ? wanted : 0;
  }
}
