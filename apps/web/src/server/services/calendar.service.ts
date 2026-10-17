import { BadRequestException, NotFoundException } from '../http';
import type { Prisma } from '@prisma/client';
import { oneOf, str, type Body } from '../body';
import prisma from '@/lib/db';

// Calendar events (Stage 5 · Q12): personal events, focus blocks, meetings and office hours a person
// makes (dragged to a new time on the calendar, repeated weekly, or read from a calendar file), and
// events on a course (exams, scheduled class calls) that its students and teaching team see.

export const EVENT_TYPES = ['PERSONAL', 'FOCUS', 'MEETING', 'OFFICE_HOURS', 'DEADLINE', 'EXAM'] as const;
const COLOR = /^#[0-9a-f]{6}$/i;
const LONGEST = 31 * 86_400_000;
const dbDate = (d: Date) => d.toISOString().replace('Z', '+00:00');

function when(raw: unknown, label: string): Date {
  const t = typeof raw === 'string' || typeof raw === 'number' ? new Date(raw) : null;
  if (!t || Number.isNaN(t.getTime()) || t.getUTCFullYear() < 2000 || t.getUTCFullYear() > 2100) throw new BadRequestException(`Pick a ${label}.`);
  return t;
}

/** An event's fields from a request: a title, a start before its end (31 days at most), a known kind and a colour. */
function cleanEvent(b: Body, partial: boolean): Prisma.CalendarEventUncheckedUpdateInput {
  const out: Prisma.CalendarEventUncheckedUpdateInput = {};
  if (!partial || b.title !== undefined) {
    const title = (str(b.title) ?? '').trim().slice(0, 200);
    if (!title) throw new BadRequestException('Give the event a title.');
    out.title = title;
  }
  if (b.description !== undefined) out.description = (str(b.description) ?? '').trim().slice(0, 2000) || null;
  if (!partial || b.startAt !== undefined || b.endAt !== undefined) {
    const start = when(b.startAt, 'start time'), end = when(b.endAt, 'end time');
    if (end.getTime() <= start.getTime()) throw new BadRequestException('An event has to end after it starts.');
    if (end.getTime() - start.getTime() > LONGEST) throw new BadRequestException('An event can last 31 days at most.');
    out.startAt = start;
    out.endAt = end;
  }
  if (b.color !== undefined) out.color = typeof b.color === 'string' && COLOR.test(b.color) ? b.color : null;
  if (b.type !== undefined) out.type = oneOf(EVENT_TYPES, b.type) ? b.type : 'PERSONAL';
  else if (!partial) out.type = 'PERSONAL';
  if (b.courseId !== undefined) out.courseId = str(b.courseId) || null;
  return out;
}

export class CalendarService {
  /** My own events plus my classes' events (exams, scheduled class calls), the courses I teach too, from a month back. */
  getMyEvents(userId: string) {
    return prisma.calendarEvent.findMany({
      where: {
        endAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
        OR: [
          { userId },
          { course: { enrollments: { some: { studentId: userId } } } },
          { course: { teacherId: userId } },
          { course: { staff: { some: { userId } } } },
        ],
      },
      include: { course: { select: { id: true, name: true, code: true, color: true } } },
      orderBy: { startAt: 'asc' },
      take: 500,
    });
  }

  /** A new event; `weeks` (2–16) repeats it weekly, the copies kept together as one series. */
  async create(userId: string, data: Body) {
    const fields = cleanEvent(data, false) as Prisma.CalendarEventUncheckedCreateInput;
    const weeks = Math.min(16, Math.max(1, Math.floor(Number(data.weeks) || 1)));
    if (fields.type === 'EXAM' && !fields.courseId) fields.type = 'PERSONAL';
    if (weeks === 1) return prisma.calendarEvent.create({ data: { ...fields, userId } });
    const batch = `repeat:${crypto.randomUUID()}`;
    const start = new Date(fields.startAt as Date), end = new Date(fields.endAt as Date);
    let first = null;
    for (let i = 0; i < weeks; i++) {
      // The same clock time each week, as the browser sent it (a change of summer time moves it by the hour).
      const shift = i * 7 * 86_400_000;
      const e = await prisma.calendarEvent.create({ data: { ...fields, userId, batch, startAt: new Date(start.getTime() + shift), endAt: new Date(end.getTime() + shift) } });
      first ??= e;
    }
    return { ...first!, created: weeks };
  }

  async update(id: string, userId: string, data: Body) {
    const res = await prisma.calendarEvent.updateMany({ where: { id, userId }, data: cleanEvent(data, true) as Prisma.CalendarEventUncheckedUpdateManyInput });
    if (!res.count) throw new NotFoundException();
    return prisma.calendarEvent.findUnique({ where: { id } });
  }

  /** Removes an event; with `series`, every event made with it (a weekly repeat, a calendar file). */
  async remove(id: string, userId: string, series = false) {
    const e = await prisma.calendarEvent.findFirst({ where: { id, userId }, select: { batch: true } });
    if (!e) throw new NotFoundException();
    const res = series && e.batch
      ? await prisma.calendarEvent.deleteMany({ where: { userId, batch: e.batch } })
      : await prisma.calendarEvent.deleteMany({ where: { id, userId } });
    return { ok: true, removed: res.count };
  }

  /**
   * Events read from a calendar file in the browser (src/lib/ics-parse.ts): at most 300, kept as
   * one batch per file name, so importing the same file again replaces what came from it.
   */
  async importEvents(userId: string, data: Body) {
    const name = (str(data.name) ?? '').trim().slice(0, 80) || 'Calendar';
    const list = (Array.isArray(data.events) ? data.events : []).slice(0, 300).flatMap((raw) => {
      try {
        const f = cleanEvent((raw ?? {}) as Body, false);
        return [{ title: f.title as string, description: (f.description as string | null | undefined) ?? null, startAt: f.startAt as Date, endAt: f.endAt as Date }];
      } catch { return []; }
    });
    if (!list.length) throw new BadRequestException('There were no events in that file.');
    const batch = `ics:${name}`;
    const removed = await prisma.calendarEvent.deleteMany({ where: { userId, batch } });
    const now = dbDate(new Date());
    // D1 takes up to 100 values a query: 6 an event, 16 events a statement.
    for (let i = 0; i < list.length; i += 16) {
      const part = list.slice(i, i + 16);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "calendar_events" ("id", "userId", "title", "description", "startAt", "endAt", "type", "batch", "createdAt", "updatedAt") VALUES ${part.map(() => `(lower(hex(randomblob(12))), ?, ?, ?, ?, ?, 'PERSONAL', ?, '${now}', '${now}')`).join(', ')}`,
        ...part.flatMap((e) => [userId, e.title, e.description, dbDate(e.startAt), dbDate(e.endAt), batch]),
      );
    }
    return { imported: list.length, replaced: removed.count, name };
  }
}
