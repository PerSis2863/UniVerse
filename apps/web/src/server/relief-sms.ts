import prisma from '@/lib/db';
import { emergencyText } from '@/lib/relief';
import { APP_URL } from './email';
import { featureOff } from './moderation';

// M153: Relief emergency texts (the owner, 10 Nov 2026). When an organisation declares an emergency, the
// helpers nearby who added a phone number to their alert get one text (SMS) each, through the owner's
// Twilio account (paid per message). Off until the owner turns on "Relief emergency texts" (console →
// Server) and sets TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM. Capped so a bad day can't run
// up the bill: 100 texts an emergency, 300 a day.

export const PER_EMERGENCY = 100;
export const PER_DAY = 300;
const env = (k: string) => (process.env[k] ?? '').trim();

/** The Twilio account, when emergency texts are switched on and set up; otherwise null. */
export async function smsReady() {
  const sid = env('TWILIO_ACCOUNT_SID'), token = env('TWILIO_AUTH_TOKEN'), from = env('TWILIO_FROM');
  if (!sid || !token || !from || (await featureOff('relief-sms-alerts'))) return null;
  return { sid, token, from };
}

/** GET /relief/sms: whether helpers can ask for emergency texts (so the setting only shows then). */
export const reliefSmsOn = async () => ({ on: !!(await smsReady()) });

async function send(tw: { sid: string; token: string; from: string }, to: string, body: string) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(tw.sid)}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${tw.sid}:${tw.token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(tw.from.startsWith('MG') ? { MessagingServiceSid: tw.from, To: to, Body: body } : { From: tw.from, To: to, Body: body }),
  }).catch((e) => (console.error('relief text failed:', e), null));
  if (res && !res.ok) console.error('relief text failed:', res.status, (await res.text().catch(() => '')).slice(0, 200));
  return !!res?.ok;
}

/**
 * Texts the helpers among `userIds` who gave a number, within the caps; people already texted for this
 * emergency are skipped, and each is recorded before the text goes (one per person per emergency). About
 * ten queries, whatever the number of people.
 */
export async function textEmergency(i: { id: string; title: string }, userIds: string[]) {
  const tw = await smsReady();
  if (!tw || !userIds.length) return 0;
  const watches = (await prisma.reliefWatch.findMany({ where: { userId: { in: userIds.slice(0, 200) }, smsTo: { not: null } }, select: { userId: true, smsTo: true } }));
  if (!watches.length) return 0;
  const [today, already] = await Promise.all([
    prisma.reliefSmsSent.count({ where: { createdAt: { gt: new Date(Date.now() - 86_400_000) } } }),
    prisma.reliefSmsSent.findMany({ where: { incidentId: i.id }, select: { userId: true } }),
  ]);
  const done = new Set(already.map((a) => a.userId));
  const room = Math.max(0, Math.min(PER_EMERGENCY - done.size, PER_DAY - today));
  const to = watches.filter((w) => !done.has(w.userId)).slice(0, room);
  if (!to.length) return 0;
  const now = new Date().toISOString();
  // 3 values a row, 30 rows a statement (D1 takes 100 values a query).
  for (let k = 0; k < to.length; k += 30) {
    const part = to.slice(k, k + 30);
    await prisma.$executeRawUnsafe(`INSERT OR IGNORE INTO relief_sms_sent (incidentId, userId, ok, createdAt) VALUES ${part.map(() => '(?, ?, 0, ?)').join(', ')}`, ...part.flatMap((w) => [i.id, w.userId, now]));
  }
  const body = emergencyText(i.title, `${APP_URL()}/relief`);
  const ok: string[] = [];
  for (let k = 0; k < to.length; k += 10) {
    const part = to.slice(k, k + 10);
    const res = await Promise.all(part.map((w) => send(tw, w.smsTo!, body)));
    part.forEach((w, j) => { if (res[j]) ok.push(w.userId); });
  }
  for (let k = 0; k < ok.length; k += 90) {
    const part = ok.slice(k, k + 90);
    await prisma.$executeRawUnsafe(`UPDATE relief_sms_sent SET ok = 1 WHERE incidentId = ? AND userId IN (${part.map(() => '?').join(',')})`, i.id, ...part);
  }
  return ok.length;
}
