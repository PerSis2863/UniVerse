// The timetable and exam timetable generators (Stage 5 · Q12), worked out in the admin's browser:
// courses (their teacher, how many students, how many classes a week), rooms (how many seats) and
// which courses share students go in; a proposed week (or exam fortnight) comes out, with what
// couldn't be placed and why. Nothing here touches the database.

export interface PlanCourse { id: string; code: string; teacherId: string | null; students: number; sessions: number; length: number; type?: string }
export interface PlanRoom { id: string; name: string; capacity: number }
/** Two courses that share students, and how many. */
export type Overlap = [string, string, number];
/** Days 0 = Monday … 6 = Sunday; times in minutes after midnight. */
export interface WeekSettings { days: number[]; start: number; end: number; breakStart?: number | null; breakEnd?: number | null; step: number }
export interface PlannedSlot { courseId: string; day: number; start: number; end: number; roomId: string | null; type?: string }
export type UnplacedReason = 'teacher' | 'students' | 'time';
export interface Unplaced { courseId: string; missing: number; reason: UnplacedReason }
export interface WeekPlan { slots: PlannedSlot[]; unplaced: Unplaced[]; roomless: number; score: number }

type Span = { day: number | string; start: number; end: number };
const clash = (a: Span, b: Span) => a.day === b.day && a.start < b.end && b.start < a.end;

/** Course → the courses it shares students with (and how many). */
export function overlapMap(overlaps: Overlap[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  const add = (a: string, b: string, n: number) => {
    const m = out.get(a) ?? new Map<string, number>();
    m.set(b, (m.get(b) ?? 0) + n);
    out.set(a, m);
  };
  for (const [a, b, n] of overlaps) if (a !== b && n > 0) { add(a, b, n); add(b, a, n); }
  return out;
}

/** A small seeded random number generator (mulberry32), so "Try again" gives a different week. */
function random(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** The start times a class of this length can take in a day: on the step, inside the day, not over the break. */
export function startTimes(s: WeekSettings, length: number): number[] {
  const out: number[] = [];
  const step = Math.max(5, s.step);
  for (let t = s.start; t + length <= s.end; t += step) {
    if (s.breakStart != null && s.breakEnd != null && s.breakEnd > s.breakStart && t < s.breakEnd && s.breakStart < t + length) continue;
    out.push(t);
  }
  return out;
}

/** The smallest free room that seats everyone, if there is one. */
function roomFor(rooms: PlanRoom[], students: number, busy: (roomId: string) => boolean): PlanRoom | null {
  let best: PlanRoom | null = null;
  for (const r of rooms) if (r.capacity >= students && !busy(r.id) && (!best || r.capacity < best.capacity)) best = r;
  return best;
}

/** A class that stays as it is while others are planned, with its teacher. */
export type FixedSlot = PlannedSlot & { teacherId?: string | null };

function planOnce(courses: PlanCourse[], rooms: PlanRoom[], shared: Map<string, Map<string, number>>, s: WeekSettings, fixed: FixedSlot[], seed: number): WeekPlan {
  const rnd = random(seed);
  const byId = new Map(courses.map((c) => [c.id, c]));
  const slots: PlannedSlot[] = [];
  // What's on each day so far (the classes that stay, then each one placed).
  const byDay: PlannedSlot[][] = [[], [], [], [], [], [], []];
  for (const f of fixed) byDay[f.day]?.push(f);
  const fixedTeacher = new Map(fixed.map((f) => [f.courseId, f.teacherId ?? null]));
  const teacherOf = (courseId: string) => (byId.has(courseId) ? byId.get(courseId)!.teacherId : fixedTeacher.get(courseId) ?? null);
  const teacherLoad = new Map<string, number>();
  for (const c of courses) if (c.teacherId) teacherLoad.set(c.teacherId, (teacherLoad.get(c.teacherId) ?? 0) + c.sessions);
  const biggest = Math.max(0, ...rooms.map((r) => r.capacity));
  // Hardest first: shares students with many courses, a busy teacher, many students for the rooms.
  const order = courses
    .filter((c) => c.sessions > 0 && c.length > 0)
    .map((c) => ({ c, w: (shared.get(c.id)?.size ?? 0) * 3 + (c.teacherId ? teacherLoad.get(c.teacherId) ?? 0 : 0) + c.sessions + (biggest ? c.students / biggest : 0) * 4 + rnd() }))
    .sort((a, b) => b.w - a.w)
    .map((x) => x.c);
  const unplaced: Unplaced[] = [];
  let roomless = 0, score = 0;
  const days = [...new Set(s.days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);

  for (const c of order) {
    const times = startTimes(s, c.length);
    if (!times.length || !days.length) { unplaced.push({ courseId: c.id, missing: c.sessions, reason: 'time' }); continue; }
    const others = shared.get(c.id);
    let missing = 0;
    let lastReason: UnplacedReason = 'time';
    for (let k = 0; k < c.sessions; k++) {
      let best: { slot: PlannedSlot; score: number } | null = null;
      let teacherBlocked = 0, studentsBlocked = 0;
      const mine = slots.filter((x) => x.courseId === c.id);
      for (const day of days) {
        const sameDay = mine.filter((x) => x.day === day).length;
        // Two of a course's classes on one day only when there are more classes than days.
        if (sameDay > 0 && c.sessions <= days.length) continue;
        const today = byDay[day];
        for (const start of times) {
          const span = { day, start, end: start + c.length };
          const here = today.filter((x) => clash(x, span));
          if (c.teacherId && here.some((x) => teacherOf(x.courseId) === c.teacherId)) { teacherBlocked++; continue; }
          if (others && here.some((x) => others.has(x.courseId))) { studentsBlocked++; continue; }
          const room = rooms.length ? roomFor(rooms, c.students, (id) => here.some((x) => x.roomId === id)) : null;
          let sc = sameDay * 100 + rnd() * 0.5 + (start - s.start) / 600;
          if (rooms.length && !room) sc += 1000;
          // Spread a course over the week, a teacher's and a group's classes over the days.
          for (const x of mine) if (Math.abs(x.day - day) === 1) sc += 4;
          if (c.teacherId) sc += today.filter((x) => teacherOf(x.courseId) === c.teacherId).length * 2;
          if (others) sc += today.filter((x) => others.has(x.courseId)).length;
          if (!best || sc < best.score) best = { slot: { courseId: c.id, day, start, end: start + c.length, roomId: room?.id ?? null, type: c.type }, score: sc };
        }
      }
      if (!best) { missing++; lastReason = studentsBlocked >= teacherBlocked && studentsBlocked > 0 ? 'students' : teacherBlocked > 0 ? 'teacher' : 'time'; continue; }
      if (rooms.length && !best.slot.roomId) roomless++;
      score += best.score;
      slots.push(best.slot);
      byDay[best.slot.day].push(best.slot);
    }
    if (missing) unplaced.push({ courseId: c.id, missing, reason: lastReason });
  }
  return { slots, unplaced, roomless, score };
}

/**
 * A proposed week: every course's classes where its teacher, its students (any course sharing them)
 * and a room big enough are free, a course's classes on different days. `fixed` are classes that
 * stay (courses not being planned): they still take their teacher, students and room.
 */
export function planWeek(courses: PlanCourse[], rooms: PlanRoom[], overlaps: Overlap[], settings: WeekSettings, opts: { seed?: number; fixed?: FixedSlot[]; tries?: number } = {}): WeekPlan {
  const shared = overlapMap(overlaps);
  const seed = opts.seed ?? 1;
  let best: WeekPlan | null = null;
  const missing = (p: WeekPlan) => p.unplaced.reduce((n, u) => n + u.missing, 0);
  for (let i = 0; i < Math.max(1, opts.tries ?? 12); i++) {
    const p = planOnce(courses, rooms, shared, settings, opts.fixed ?? [], seed * 7919 + i);
    if (!best || missing(p) < missing(best) || (missing(p) === missing(best) && (p.roomless < best.roomless || (p.roomless === best.roomless && p.score < best.score)))) best = p;
    if (!missing(best) && !best.roomless && i >= 3) break;
  }
  return best!;
}

export type ConflictKind = 'teacher' | 'room' | 'students' | 'capacity' | 'noroom';
export interface Conflict { kind: ConflictKind; a: number; b?: number; students?: number }

/** What's wrong with a week: one teacher or room in two places, students with two classes at once, rooms too small. */
export function findConflicts(
  slots: { courseId: string; day: number; start: number; end: number; roomId: string | null }[],
  courses: Map<string, { teacherId: string | null; students: number }>,
  rooms: Map<string, { capacity: number }>,
  overlaps: Overlap[],
): Conflict[] {
  const shared = overlapMap(overlaps);
  const out: Conflict[] = [];
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i], ca = courses.get(a.courseId);
    const room = a.roomId ? rooms.get(a.roomId) : undefined;
    if (room && ca && ca.students > room.capacity) out.push({ kind: 'capacity', a: i, students: ca.students });
    if (!a.roomId && rooms.size) out.push({ kind: 'noroom', a: i });
    for (let j = i + 1; j < slots.length; j++) {
      const b = slots[j];
      if (!clash(a, b)) continue;
      const cb = courses.get(b.courseId);
      if (ca?.teacherId && cb?.teacherId === ca.teacherId) out.push({ kind: 'teacher', a: i, b: j });
      if (a.roomId && a.roomId === b.roomId) out.push({ kind: 'room', a: i, b: j });
      const n = a.courseId === b.courseId ? 0 : shared.get(a.courseId)?.get(b.courseId) ?? 0;
      if (n > 0) out.push({ kind: 'students', a: i, b: j, students: n });
    }
  }
  return out;
}

// ── Exams ─────────────────────────────────────────────────────────────────────

export interface ExamCourse { id: string; code: string; students: number; length: number }
/** One exam sitting: a day ("YYYY-MM-DD") and its times. */
export interface ExamSession { day: string; start: number; end: number }
export interface PlacedExam { courseId: string; session: number; rooms: { roomId: string; seats: number }[] }
export type ExamReason = 'clash' | 'rooms' | 'length';
export interface ExamPlan { placed: PlacedExam[]; unplaced: { courseId: string; reason: ExamReason }[]; sameDay: number; score: number }

/** Seats for an exam from the rooms still free in a sitting: one room if one is big enough, else the biggest together. */
export function seatExam(students: number, free: PlanRoom[]): { roomId: string; seats: number }[] | null {
  if (students <= 0) return [];
  const one = free.filter((r) => r.capacity >= students).sort((a, b) => a.capacity - b.capacity)[0];
  if (one) return [{ roomId: one.id, seats: students }];
  const out: { roomId: string; seats: number }[] = [];
  let left = students;
  for (const r of [...free].sort((a, b) => b.capacity - a.capacity)) {
    if (left <= 0) break;
    if (r.capacity <= 0) continue;
    const seats = Math.min(r.capacity, left);
    out.push({ roomId: r.id, seats });
    left -= seats;
  }
  return left > 0 ? null : out;
}

function examsOnce(exams: ExamCourse[], rooms: PlanRoom[], shared: Map<string, Map<string, number>>, sessions: ExamSession[], onePerDay: boolean, seed: number): ExamPlan {
  const rnd = random(seed);
  const placed: PlacedExam[] = [];
  const unplaced: ExamPlan['unplaced'] = [];
  const at = new Map<string, number>(); // course → session
  const usedRooms = sessions.map(() => new Set<string>());
  const dayIndex = [...new Set(sessions.map((x) => x.day))].sort();
  const dayNo = (i: number) => dayIndex.indexOf(sessions[i].day);
  let sameDay = 0, score = 0;
  // Most entangled first (DSatur-like): many shared students, then the biggest.
  const order = exams
    .map((e) => ({ e, w: [...(shared.get(e.id)?.values() ?? [])].reduce((n, v) => n + v, 0) + e.students / 1000 + rnd() * 0.01 }))
    .sort((a, b) => b.w - a.w)
    .map((x) => x.e);
  for (const e of order) {
    const others = shared.get(e.id);
    let best: { i: number; rooms: PlacedExam['rooms']; score: number; same: number } | null = null;
    let why: ExamReason = 'length';
    for (const strict of onePerDay ? [true, false] : [false]) {
      for (let i = 0; i < sessions.length; i++) {
        const s = sessions[i];
        if (e.length > s.end - s.start) continue;
        let same = 0, near = 0, blocked = false;
        for (const [other, n] of others ?? []) {
          const j = at.get(other);
          if (j == null) continue;
          if (j === i) { blocked = true; break; }
          if (sessions[j].day === s.day) same += n;
          else if (Math.abs(dayNo(j) - dayNo(i)) === 1) near += n;
        }
        if (blocked) { why = 'clash'; continue; }
        if (strict && same > 0) { why = 'clash'; continue; }
        const seats = rooms.length ? seatExam(e.students, rooms.filter((r) => !usedRooms[i].has(r.id))) : [];
        if (!seats) { if (why !== 'clash') why = 'rooms'; continue; }
        const sc = same * 10 + near * 2 + i * 0.05 + rnd() * 0.01;
        if (!best || sc < best.score) best = { i, rooms: seats, score: sc, same };
      }
      if (best) break;
    }
    if (!best) { unplaced.push({ courseId: e.id, reason: why }); continue; }
    at.set(e.id, best.i);
    for (const r of best.rooms) usedRooms[best.i].add(r.roomId);
    placed.push({ courseId: e.id, session: best.i, rooms: best.rooms });
    sameDay += best.same;
    score += best.score;
  }
  return { placed, unplaced, sameDay, score };
}

/**
 * An exam timetable: no student with two exams in one sitting, every exam seated in rooms big
 * enough (a big exam over several rooms), and with `onePerDay` no student with two exams on one
 * day when that can be helped. `sameDay` counts students who still have two in a day.
 */
export function planExams(exams: ExamCourse[], rooms: PlanRoom[], overlaps: Overlap[], sessions: ExamSession[], opts: { onePerDay?: boolean; seed?: number; tries?: number } = {}): ExamPlan {
  const shared = overlapMap(overlaps);
  let best: ExamPlan | null = null;
  for (let i = 0; i < Math.max(1, opts.tries ?? 12); i++) {
    const p = examsOnce(exams, rooms, shared, sessions, opts.onePerDay ?? true, (opts.seed ?? 1) * 104729 + i);
    if (!best || p.unplaced.length < best.unplaced.length || (p.unplaced.length === best.unplaced.length && (p.sameDay < best.sameDay || (p.sameDay === best.sameDay && p.score < best.score)))) best = p;
  }
  return best!;
}

/** Exam sittings for the days from `from` to `to` ("YYYY-MM-DD"), weekends left out unless asked. */
export function examSessions(from: string, to: string, times: { start: number; end: number }[], weekends = false): ExamSession[] {
  const out: ExamSession[] = [];
  const a = Date.parse(`${from}T12:00:00Z`), b = Date.parse(`${to}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return out;
  for (let t = a, n = 0; t <= b && n < 62; t += 86_400_000, n++) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    if (!weekends && (wd === 0 || wd === 6)) continue;
    for (const x of times) if (x.end > x.start) out.push({ day: d.toISOString().slice(0, 10), start: x.start, end: x.end });
  }
  return out;
}

export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const toMinutes = (t: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
