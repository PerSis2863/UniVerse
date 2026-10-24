// Stage 5 · D15, the classroom twin (live campus map): the rules, with no database, so they can be
// tested and the page can work out what's free as the clock moves on without asking the server again.
// Times of day are minutes after midnight on the device's clock; weekdays run 0 = Monday … 6 = Sunday.

/** The map's size in map units; buildings are drawn as rectangles inside it. */
export const MAP_W = 1000, MAP_H = 640;
const MIN_SIDE = 60;
export const BUILDING_COLORS = ['#253745', '#0ea5e9', '#10b981', '#f59e0b', '#6b5560', '#53515e', '#14b8a6', '#ef4444'];
export const MAX_BUILDINGS = 40;
export const MAX_FLOORS = 30;

export interface Box { x: number; y: number; w: number; h: number }

const whole = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback);
const within = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A building kept on the map: whole map units, at least MIN_SIDE across, inside MAP_W × MAP_H. */
export function clampBox(b: Partial<Box>): Box {
  const w = within(whole(b.w, 180), MIN_SIDE, MAP_W), h = within(whole(b.h, 120), MIN_SIDE, MAP_H);
  return { x: within(whole(b.x, 0), 0, MAP_W - w), y: within(whole(b.y, 0), 0, MAP_H - h), w, h };
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Where a new building goes: the first spot on a 20-unit grid that touches no other building (else the middle). */
export function freeSpot(taken: Box[], w = 180, h = 120): Box {
  const gap = 20;
  for (let y = gap; y + h <= MAP_H - gap; y += gap) {
    for (let x = gap; x + w <= MAP_W - gap; x += gap) {
      const box = { x, y, w, h };
      if (!taken.some((t) => overlaps({ x: t.x - gap / 2, y: t.y - gap / 2, w: t.w + gap, h: t.h + gap }, box))) return box;
    }
  }
  return clampBox({ x: (MAP_W - w) / 2, y: (MAP_H - h) / 2, w, h });
}

/** A short label for a building on the map: its code, else its initials ("Science Block" → "SB"). */
export function shortName(name: string, code?: string | null) {
  if (code?.trim()) return code.trim().slice(0, 6);
  const words = name.trim().split(/\s+/).filter((x) => /[A-Za-z0-9]/.test(x));
  return (words.length > 1 ? words.slice(0, 3).map((x) => x[0]).join('') : (words[0] ?? '?').slice(0, 4)).toUpperCase();
}

// ── Times ──

/** "10:00 AM", "2:30 pm" or "14:00" → minutes after midnight (null if unreadable). */
export function clockMinutes(s: string): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?\s*$/i.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) { const pm = /^p/i.test(m[3]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** A booking's length: "1", "1.5", "2h", "2 hours" (hours) or "90m", "45 min" (minutes); an hour if unreadable. */
export function bookingMinutes(duration: string): number {
  const m = /^\s*(\d+(?:\.\d+)?)\s*([a-z]*)/i.exec(duration ?? '');
  const n = m ? Number(m[1]) : NaN;
  const minutes = !Number.isFinite(n) || n <= 0 ? 60 : /^m/i.test(m?.[2] ?? '') ? n : n * 60;
  return Math.round(within(minutes, 15, 12 * 60));
}

/** A date's weekday, Monday = 0 (dates as YYYY-MM-DD). */
export const weekdayOf = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;

// ── A room now ──

export type BusyKind = 'class' | 'booking';
/** Something taking a room today, from and to in minutes. */
export interface Busy { from: number; to: number; kind: BusyKind; label: string; mine?: boolean }
export type RoomState = 'free' | 'class' | 'booked';
export interface RoomNow {
  state: RoomState;
  /** What's on: the class's name, "Booked" or "Your booking". */
  label: string | null;
  /** Busy until (the end of everything back to back from now). */
  until: number | null;
  /** Free now and next busy at. */
  next: number | null;
  mine: boolean;
}

/** A room right now: what's on (a class before a booking), until when, or when it's next busy. */
export function roomNow(busy: Busy[], now: number): RoomNow {
  const list = busy.filter((b) => b.to > b.from).sort((a, b) => a.from - b.from);
  const on = list.filter((b) => b.from <= now && now < b.to);
  if (!on.length) {
    const next = list.find((b) => b.from > now);
    return { state: 'free', label: null, until: null, next: next ? next.from : null, mine: false };
  }
  // Busy until the end of the stretch that starts now (things back to back or overlapping join up).
  let until = Math.max(...on.map((b) => b.to));
  for (const b of list) if (b.from <= until && b.to > until) until = b.to;
  const top = on.find((b) => b.kind === 'class') ?? on[0];
  return { state: top.kind === 'class' ? 'class' : 'booked', label: top.label, until: Math.min(until, 24 * 60), next: null, mine: !!top.mine };
}

/** Minutes a room stays free from now (Infinity: the rest of the day). 0 when busy. */
export const freeFor = (r: RoomNow, now: number) => (r.state !== 'free' ? 0 : r.next == null ? Infinity : r.next - now);

/** How busy a building is, for its colour: 0 nothing on, 1 under half its rooms, 2 most, 3 every room. */
export function loadLevel(inUse: number, total: number): 0 | 1 | 2 | 3 {
  if (!total || inUse <= 0) return 0;
  if (inUse >= total) return 3;
  return inUse / total < 0.5 ? 1 : 2;
}

/** A room for studying alone or in a group (by its type or name). */
export const isStudyRoom = (type: string, name: string) => /study|library|group|quiet|pod|meeting|seminar|reading/i.test(`${type} ${name}`);

// ── Your next class ──

export interface Slot { dayOfWeek: number; start: number; end: number }

/**
 * The class on now or next: today's from now on, else the first one on the following days (up to a
 * week ahead). dayOffset 0 is today; `now` says it has already started.
 */
export function nextClass<T extends Slot>(slots: T[], dow: number, now: number): { slot: T; dayOffset: number; now: boolean } | null {
  for (let offset = 0; offset < 7; offset++) {
    const day = (dow + offset) % 7;
    const today = slots.filter((s) => s.dayOfWeek === day && s.end > s.start && (offset > 0 || s.end > now)).sort((a, b) => a.start - b.start);
    if (today.length) return { slot: today[0], dayOffset: offset, now: offset === 0 && today[0].start <= now };
  }
  return null;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** "Today", "Tomorrow" or the weekday's name, `offset` days after weekday `dow`. */
export const dayWord = (offset: number, dow: number) => (offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : DAYS[(dow + offset) % 7]);
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Usage over the past weeks (admins) ──

/** The hours the usage map shows: 7:00 to 21:00. */
export const HEAT_FROM = 7, HEAT_TO = 21;
/** Open hours each room's share is counted against: Monday to Friday, 8:00 to 18:00. */
export const OPEN_HOURS_A_WEEK = 50;

/** A room in use on one day: `day` tells days apart (a date, or week and weekday for the timetable). */
export interface Stretch { roomId: string; day: string; dow: number; from: number; to: number }

/** Each room's stretches on each day joined where they overlap, so nothing counts twice. */
function joined(stretches: Stretch[]): Stretch[] {
  const by = new Map<string, Stretch[]>();
  for (const s of stretches) {
    if (!(s.to > s.from) || s.dow < 0 || s.dow > 6) continue;
    const k = `${s.roomId}|${s.day}`;
    by.set(k, [...(by.get(k) ?? []), s]);
  }
  const out: Stretch[] = [];
  for (const list of by.values()) {
    list.sort((a, b) => a.from - b.from);
    let cur = { ...list[0] };
    for (const s of list.slice(1)) {
      if (s.from <= cur.to) cur.to = Math.max(cur.to, s.to);
      else { out.push(cur); cur = { ...s }; }
    }
    out.push(cur);
  }
  return out;
}

/** How much of each hour (HEAT_FROM to HEAT_TO), Monday to Sunday, the rooms were in use: 0 to 1 of all rooms over `weeks` weeks. */
export function usageGrid(stretches: Stretch[], rooms: number, weeks: number): number[][] {
  const hours = HEAT_TO - HEAT_FROM;
  const grid = Array.from({ length: 7 }, () => Array<number>(hours).fill(0));
  if (rooms <= 0 || weeks <= 0) return grid;
  for (const s of joined(stretches)) {
    for (let h = HEAT_FROM; h < HEAT_TO; h++) {
      const used = Math.min(s.to, (h + 1) * 60) - Math.max(s.from, h * 60);
      if (used > 0) grid[s.dow][h - HEAT_FROM] += used;
    }
  }
  return grid.map((row) => row.map((m) => Math.round(Math.min(1, m / (rooms * weeks * 60)) * 100) / 100));
}

/** Each room's hours in use over `weeks` weeks and its share of the open hours, busiest first. */
export function roomUse(stretches: Stretch[], rooms: { id: string; name: string }[], weeks: number) {
  const minutes = new Map<string, number>();
  for (const s of joined(stretches)) minutes.set(s.roomId, (minutes.get(s.roomId) ?? 0) + (s.to - s.from));
  const open = OPEN_HOURS_A_WEEK * 60 * Math.max(1, weeks);
  return rooms
    .map((r) => { const m = minutes.get(r.id) ?? 0; return { id: r.id, name: r.name, hours: Math.round((m / 60) * 10) / 10, share: Math.round(Math.min(1, m / open) * 100) / 100 }; })
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
}
