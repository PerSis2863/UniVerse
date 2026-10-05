import { createHash } from 'node:crypto';
import prisma from '@/lib/db';
import { BadRequestException, NotFoundException } from './http';
import { studentProgress } from './student-progress';

// Upgrade 6, smart study planner. A plain scheduler (no AI, so it's free and predictable):
//   free time = the student's study hours, minus their classes (timetable) and calendar events;
//   tasks     = due work in the next week (split into sessions before it's due), flashcard review
//               on days cards are due, and review for weaker courses;
//   placement = greedy, each session on the allowed day with the most room, under a daily cap.
// It re-plans lazily when the page opens and something changed (new or moved deadlines, missed
// sessions, new settings): no background jobs. Sessions the student ticked or moved stay put.

const DAY = 86_400_000;
export interface Prefs { capMin: number; start: string; end: string; ical: boolean; sig?: string; plannedFor?: string; deadlines?: string[] }
const DEFAULTS: Prefs = { capMin: 120, start: '09:00', end: '21:00', ical: false };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** 0 = Monday … 6 = Sunday, like TimetableSlot.dayOfWeek. */
const weekday = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;

/** A moment as the student's local day and minutes. */
function local(d: Date, tz: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, min: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function parsePrefs(raw: string | null | undefined): Prefs {
  try {
    const v = raw ? JSON.parse(raw) : {};
    return {
      capMin: Number.isFinite(v.capMin) ? Math.max(30, Math.min(360, Math.round(v.capMin))) : DEFAULTS.capMin,
      start: TIME.test(v.start) ? v.start : DEFAULTS.start,
      end: TIME.test(v.end) && toMin(v.end) > toMin(TIME.test(v.start) ? v.start : DEFAULTS.start) + 60 ? v.end : DEFAULTS.end,
      ical: v.ical === true, sig: typeof v.sig === 'string' ? v.sig : undefined, plannedFor: typeof v.plannedFor === 'string' ? v.plannedFor : undefined,
      deadlines: Array.isArray(v.deadlines) ? v.deadlines.filter((x: unknown) => typeof x === 'string') : [],
    };
  } catch { return { ...DEFAULTS }; }
}

// ─── The scheduler (pure) ────────────────────────────────────────────────────────────────────

export interface Task { key: string; kind: string; title: string; courseCode: string | null; minutes: number; chunk: number; lastDay: string | null; lastMin?: number; /** sessions already kept for it */ firstPart?: number }
export interface Placed { key: string; kind: string; title: string; courseCode: string | null; date: string; start: string; end: string }

/**
 * Places tasks into free time. `busy` holds [start, end) minutes per day (classes, events, kept
 * sessions); `used` the minutes already planned per day (kept sessions count toward the cap).
 */
export function schedule(days: string[], prefs: Prefs, busy: Map<string, [number, number][]>, used: Map<string, number>, tasks: Task[], today: string, nowMin: number): Placed[] {
  const out: Placed[] = [];
  const gap = 10;
  const free = (day: string, len: number): number | null => {
    const from = Math.max(toMin(prefs.start), day === today ? Math.ceil((nowMin + 15) / 15) * 15 : 0);
    const blocks = [...(busy.get(day) ?? [])].sort((a, b) => a[0] - b[0]);
    let t = from;
    for (const [s, e] of blocks) {
      if (s - t >= len + gap) return t;
      t = Math.max(t, e + gap);
    }
    return toMin(prefs.end) - t >= len ? t : null;
  };
  const ordered = [...tasks].sort((a, b) => (a.lastDay ?? '9999').localeCompare(b.lastDay ?? '9999') || b.minutes - a.minutes);
  for (const task of ordered) {
    let left = task.minutes;
    let part = task.firstPart ?? 0;
    while (left > 0) {
      const len = Math.min(task.chunk, left);
      // Allowed days: up to the day before it's due (the due day itself, before it's due, only if nothing else fits).
      const allowed = days.filter((d) => !task.lastDay || d < task.lastDay || (d === task.lastDay && task.lastMin !== undefined));
      const ranked = allowed
        .map((d) => ({ d, room: prefs.capMin - (used.get(d) ?? 0) }))
        .filter((x) => x.room >= len)
        .sort((a, b) => b.room - a.room || a.d.localeCompare(b.d));
      let placed = false;
      for (const { d } of ranked) {
        const at = free(d, len);
        if (at === null || (task.lastDay === d && task.lastMin !== undefined && at + len > task.lastMin - 30)) continue;
        out.push({ key: `${task.key}#${part}`, kind: task.kind, title: task.title, courseCode: task.courseCode, date: d, start: fromMin(at), end: fromMin(at + len) });
        busy.set(d, [...(busy.get(d) ?? []), [at, at + len]]);
        used.set(d, (used.get(d) ?? 0) + len);
        placed = true;
        break;
      }
      if (!placed) break; // no room left before it's due: what's placed is shown, the rest isn't forced in
      left -= len;
      part += 1;
    }
  }
  return out;
}

// ─── Inputs, re-planning and reading ─────────────────────────────────────────────────────────

const MINUTES = { quiz: { total: 60, chunk: 30 }, deadline: { total: 120, chunk: 60 }, exam: { total: 180, chunk: 60 } } as const;

async function inputs(userId: string, today: string, tz: string) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - DAY), to = new Date(Date.parse(`${days[6]}T23:59:59Z`) + DAY);
  const [progress, slots, events, cardsDue] = await Promise.all([
    studentProgress(userId, 8),
    prisma.timetableSlot.findMany({ where: { course: { enrollments: { some: { studentId: userId } } } }, select: { id: true, dayOfWeek: true, startTime: true, endTime: true } }),
    prisma.calendarEvent.findMany({
      where: { startAt: { gte: from, lte: to }, OR: [{ userId }, { course: { enrollments: { some: { studentId: userId } } } }] },
      select: { id: true, startAt: true, endAt: true }, take: 200,
    }),
    prisma.studyCard.count({ where: { userId, due: { lte: to } } }),
  ]);
  const busy = new Map<string, [number, number][]>();
  for (const d of days) {
    const wd = weekday(d);
    busy.set(d, slots.filter((s) => s.dayOfWeek === wd && TIME.test(s.startTime) && TIME.test(s.endTime)).map((s) => [toMin(s.startTime), toMin(s.endTime)]));
  }
  for (const e of events) {
    const a = local(e.startAt, tz), b = local(e.endAt > e.startAt ? e.endAt : new Date(e.startAt.getTime() + 30 * 60_000), tz);
    if (busy.has(a.day)) busy.get(a.day)!.push([a.min, a.day === b.day ? b.min : 24 * 60]);
  }
  const tasks: Task[] = [];
  for (const d of progress.deadlines) {
    const due = local(new Date(d.due), tz);
    if (due.day < today || due.day > days[6]) continue;
    const m = MINUTES[d.kind];
    tasks.push({ key: d.id, kind: d.kind === 'quiz' ? 'QUIZ' : d.kind === 'exam' ? 'EXAM' : 'DEADLINE', title: d.title, courseCode: d.course?.code ?? null, minutes: m.total, chunk: m.chunk, lastDay: due.day, lastMin: due.min });
  }
  const weak = progress.courses.filter((c) => c.grade !== null && c.grade < 70).sort((a, b) => (a.grade ?? 0) - (b.grade ?? 0)).slice(0, 2);
  const review = weak.length ? weak : progress.courses.filter((c) => c.grade !== null).sort((a, b) => (a.grade ?? 0) - (b.grade ?? 0)).slice(0, 1);
  for (const c of review) tasks.push({ key: `r-${c.id}`, kind: 'REVIEW', title: `Review ${c.name}`, courseCode: c.code, minutes: weak.length ? 60 : 30, chunk: 30, lastDay: null });
  if (cardsDue) tasks.push({ key: 'cards', kind: 'FLASHCARDS', title: `Flashcards (${cardsDue} due)`, courseCode: null, minutes: 60, chunk: 15, lastDay: null });
  const sig = createHash('sha256').update(JSON.stringify([today, progress.deadlines.map((d) => `${d.id}@${d.due}`), slots.map((s) => `${s.id}${s.dayOfWeek}${s.startTime}${s.endTime}`), events.map((e) => `${e.id}${+e.startAt}${+e.endAt}`), review.map((c) => c.id), Math.min(cardsDue, 1)])).digest('base64url').slice(0, 22);
  return { days, busy, tasks, sig, deadlineIds: progress.deadlines.map((d) => d.id) };
}

/** GET: this week's plan, re-planned first if anything changed. */
export async function weekPlan(userId: string, today: string, tz: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { studyPrefs: true } });
  if (!user) throw new NotFoundException('Not found.');
  const prefs = parsePrefs(user.studyPrefs);
  const inp = await inputs(userId, today, tz);
  let note: string | null = null;

  const existing = await prisma.planBlock.findMany({ where: { userId, date: { gte: addDays(today, -14) } }, orderBy: [{ date: 'asc' }, { start: 'asc' }] });
  const stale = prefs.sig !== inp.sig || prefs.plannedFor !== today;
  if (stale) {
    const missed = existing.filter((b) => !b.done && b.date < today && b.date >= (prefs.plannedFor ?? today)).length;
    const fresh = inp.deadlineIds.filter((id) => !(prefs.deadlines ?? []).includes(id)).length;
    const keep = existing.filter((b) => b.date >= today && (b.done || b.pinned));
    const busy = new Map([...inp.busy].map(([d, v]) => [d, [...v]]));
    const used = new Map<string, number>();
    for (const b of keep) {
      busy.get(b.date)?.push([toMin(b.start), toMin(b.end)]);
      used.set(b.date, (used.get(b.date) ?? 0) + toMin(b.end) - toMin(b.start));
    }
    const tasks = inp.tasks.map((t) => {
      // Sessions of a task already kept (done or moved) count toward it.
      const mine = keep.filter((b) => b.refId?.startsWith(`${t.key}#`));
      const doneMin = mine.reduce((n, b) => n + toMin(b.end) - toMin(b.start), 0);
      return { ...t, minutes: Math.max(0, t.minutes - doneMin), firstPart: mine.length ? Math.max(...mine.map((b) => Number(b.refId!.split('#')[1]) || 0)) + 1 : 0 };
    }).filter((t) => t.minutes > 0);
    const nowLocal = (() => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value])); return Number(p.hour) * 60 + Number(p.minute); })();
    const placed = schedule(inp.days, prefs, busy, used, tasks, today, nowLocal);
    const before = new Map(existing.filter((b) => b.date >= addDays(today, -7)).map((b) => [b.refId, b]));
    let moved = 0;
    const rows = placed.map((p) => {
      const old = before.get(p.key);
      const changed = old && !old.done && (old.date !== p.date || old.start !== p.start);
      if (changed) moved += 1;
      return { userId, date: p.date, start: p.start, end: p.end, kind: p.kind, refId: p.key, title: p.title.slice(0, 200), courseCode: p.courseCode, movedFrom: changed ? `${old!.date} ${old!.start}` : null };
    });
    await prisma.planBlock.deleteMany({ where: { userId, OR: [{ date: { gte: today }, done: false, pinned: false }, { date: { lt: addDays(today, -14) } }] } });
    if (rows.length) await prisma.planBlock.createMany({ data: rows });
    await prisma.user.update({ where: { id: userId }, data: { studyPrefs: JSON.stringify({ ...prefs, sig: inp.sig, plannedFor: today, deadlines: inp.deadlineIds }) } });
    const why = [fresh ? `${fresh === 1 ? 'something new is' : `${fresh} new things are`} due` : '', missed ? `you missed ${missed} session${missed === 1 ? '' : 's'}` : ''].filter(Boolean);
    if (moved && prefs.plannedFor) note = `${moved} session${moved === 1 ? '' : 's'} moved${why.length ? ` because ${why.join(' and ')}` : ' to fit your week'}.`;
  }
  const blocks = await prisma.planBlock.findMany({ where: { userId, date: { gte: today, lte: inp.days[6] } }, orderBy: [{ date: 'asc' }, { start: 'asc' }] });
  return {
    prefs: { capMin: prefs.capMin, start: prefs.start, end: prefs.end, ical: prefs.ical },
    note,
    days: inp.days.map((d) => ({ date: d, busy: (inp.busy.get(d) ?? []).map(([s, e]) => ({ start: fromMin(s), end: fromMin(Math.min(e, 1439)) })), blocks: blocks.filter((b) => b.date === d) })),
  };
}

/** PATCH settings: daily cap, study hours, calendar feed. Re-plans on the next read. */
export async function savePrefs(userId: string, body: Record<string, unknown>) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { studyPrefs: true } });
  const cur = parsePrefs(user?.studyPrefs);
  const next = parsePrefs(JSON.stringify({ ...cur, ...pick(body), sig: undefined }));
  await prisma.user.update({ where: { id: userId }, data: { studyPrefs: JSON.stringify({ ...next, plannedFor: cur.plannedFor, deadlines: cur.deadlines }) } });
  return { capMin: next.capMin, start: next.start, end: next.end, ical: next.ical };
}
const pick = (b: Record<string, unknown>) => Object.fromEntries(Object.entries(b).filter(([k]) => ['capMin', 'start', 'end', 'ical'].includes(k)));

/** PATCH one session: tick it { done }, or move it { date, start } (it then stays where it was put). */
export async function updateBlock(userId: string, id: string, body: Record<string, unknown>) {
  const b = await prisma.planBlock.findFirst({ where: { id, userId } });
  if (!b) throw new NotFoundException('Session not found.');
  if (typeof body.done === 'boolean') return prisma.planBlock.update({ where: { id }, data: { done: body.done } });
  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : b.date;
  const start = typeof body.start === 'string' && TIME.test(body.start) ? body.start : b.start;
  const len = toMin(b.end) - toMin(b.start);
  if (toMin(start) + len > 23 * 60 + 59) throw new BadRequestException('That would run past midnight.');
  if (Math.abs(Date.parse(date) - Date.parse(b.date)) > 14 * DAY) throw new BadRequestException('Move it within the next two weeks.');
  return prisma.planBlock.update({ where: { id }, data: { date, start, end: fromMin(toMin(start) + len), pinned: true, movedFrom: null } });
}

/** For the calendar feed (opt-in): upcoming sessions as local-time events. */
export async function feedBlocks(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { studyPrefs: true } });
  if (!parsePrefs(user?.studyPrefs).ical) return [];
  const today = new Date().toISOString().slice(0, 10);
  return prisma.planBlock.findMany({ where: { userId, date: { gte: addDays(today, -1), lte: addDays(today, 8) } }, select: { id: true, date: true, start: true, end: true, title: true, courseCode: true, done: true }, take: 80 });
}
