// Wellbeing radar (Stage 5 · D13): plain rules, no AI on personal data. Turns a few signals from the
// student's own week into private, gentle nudges, and decides when a counsellor may be told (only if
// the student agreed). Shared by the server, the page and the tests.

export const MOODS = [
  { v: 1, label: 'Very hard', emoji: '😣' },
  { v: 2, label: 'Hard', emoji: '😕' },
  { v: 3, label: 'Okay', emoji: '😐' },
  { v: 4, label: 'Good', emoji: '🙂' },
  { v: 5, label: 'Great', emoji: '😄' },
] as const;

export const TAGS = { sleep: 'Sleep', stress: 'Stress', workload: 'Workload', lonely: 'Lonely', health: 'Health', money: 'Money', family: 'Family', friends: 'Friends' } as const;
export type Tag = keyof typeof TAGS;
export const cleanTags = (raw: unknown): Tag[] => [...new Set((Array.isArray(raw) ? raw : []).filter((t): t is Tag => typeof t === 'string' && Object.hasOwn(TAGS, t)))];

/** A time zone the browser sent, if it's a real one. */
export function validTimeZone(tz: unknown): string | null {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return null; }
}

/** The day (YYYY-MM-DD) and hour (0–23) of a moment in a time zone. */
export function localParts(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
}

/** How many different nights had activity between midnight and 5 a.m. (the student's own time). */
export function lateNights(times: Date[], tz: string): number {
  const nights = new Set<string>();
  for (const t of times) { const p = localParts(t, tz); if (p.hour < 5) nights.add(p.day); }
  return nights.size;
}

export interface Signals {
  /** Nights in the last 7 with work or AI help after midnight. */
  lateNights: number;
  /** In-person classes in the last 14 days where they said they were lost (D7). */
  lost: number;
  /** Assignments and quizzes due in the last 14 days and never handed in. */
  missed: number;
  /** Due in the next 3 days and not handed in yet. */
  dueSoon: number;
  /** Check-ins in the last 7 days: how many, how many hard (mood ≤ 2), and their average. */
  checkins: number;
  hardDays: number;
  average: number | null;
  /** Very hard days (mood 1) in the last 3 days. */
  veryHardRecent: number;
}

export interface Nudge { id: string; title: string; body: string; href?: string; action?: string; care?: boolean }

const n = (x: number, one: string, many = `${one}s`) => `${x} ${x === 1 ? one : many}`;

/** Private nudges for the student, kindest first. */
export function nudgesFor(s: Signals): Nudge[] {
  const out: Nudge[] = [];
  if (s.hardDays >= 3 || s.veryHardRecent >= 1) out.push({ id: 'mood', care: true, title: 'A few hard days', body: 'It sounds like a hard stretch. It’s okay to slow down, and talking to someone can really help. You can ask the school counsellor to reach out to you.', action: 'Talk to someone' });
  if (s.lateNights >= 3) out.push({ id: 'late', title: 'Late nights', body: `You were working after midnight on ${n(s.lateNights, 'night')} this week. Sleep helps memory more than one more hour. Want to plan tomorrow lighter?`, href: '/student/planner', action: 'Plan tomorrow' });
  if (s.dueSoon >= 4) out.push({ id: 'heavy', title: 'A heavy few days ahead', body: `${n(s.dueSoon, 'thing')} ${s.dueSoon === 1 ? 'is' : 'are'} due in the next 3 days. Small steps, one at a time, make it lighter.`, href: '/student/planner', action: 'Open my planner' });
  if (s.missed >= 2) out.push({ id: 'missed', title: 'A couple of deadlines slipped', body: `${n(s.missed, 'thing')} passed ${s.missed === 1 ? 'its' : 'their'} due date without being handed in lately. It happens: a short message to your teacher can go a long way.`, href: '/student/assignments', action: 'See my work' });
  if (s.lost >= 3) out.push({ id: 'lost', title: 'Some classes felt confusing', body: `You told your teachers you were lost in ${n(s.lost, 'class', 'classes')} lately. The course tutor and second chances are there for exactly that.`, href: '/student/tutor', action: 'Ask the tutor' });
  if (!out.length && s.checkins >= 3 && (s.average ?? 0) >= 4) out.push({ id: 'good', title: 'A good week', body: 'Your check-ins have been good this week. Keep doing what works for you.' });
  return out;
}

/** Whether a counsellor may be told (the student must also have agreed): many hard days, or very hard ones lately. */
export const counsellorWorthy = (s: Signals) => s.hardDays >= 4 || s.veryHardRecent >= 2;

/** Check-ins of the last days, as signals. `days`: the last 7 and last 3 local days. */
export function moodSignals(checkins: { day: string; mood: number }[], last7: string[], last3: string[]) {
  const week = checkins.filter((c) => last7.includes(c.day));
  return {
    checkins: week.length,
    hardDays: week.filter((c) => c.mood <= 2).length,
    average: week.length ? Math.round((week.reduce((t, c) => t + c.mood, 0) / week.length) * 10) / 10 : null,
    veryHardRecent: checkins.filter((c) => last3.includes(c.day) && c.mood === 1).length,
  };
}

/** The last `count` local days up to today, newest first. */
export function lastDays(today: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${today}T12:00:00Z`);
  for (let i = 0; i < count; i++) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1); }
  return out;
}
