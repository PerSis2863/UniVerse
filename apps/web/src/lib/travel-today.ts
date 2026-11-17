import { localClock, zoneAt } from './travel-local';
import { addDays, hop, stopDates, type PlanItem, type PlanStop } from './travel-plan';

// M239: a trip's Today mode, pure so it answers at once and the tests hold it: which city and day of the trip
// it is in that city's own time, the day's places as a timetable (starting at 9:00, each place its time, the
// walk or ride between them), what's on now, what's next and when to leave for it.

export const DAY_START = 9 * 60;

export interface Slot { item: PlanItem; start: number; end: number; travel: number; walk: boolean }
export type Today =
  | { state: 'nodates' | 'empty' }
  | { state: 'before'; days: number; first: string }
  | { state: 'after' }
  | { state: 'during'; stop: number; day: number; date: string; zone: string; now: number; slots: Slot[]; current: number; next: number; leaveAt: number | null };

/** A city's zone: from its position (and country), else UTC. */
export const stopZone = (s: Pick<PlanStop, 'lat' | 'lon' | 'cc'>) => (s.lat !== null && s.lon !== null ? zoneAt(s.lat, s.lon, s.cc) : 'UTC');

/** A day's places as a timetable: from 9:00, the time each takes and getting from one to the next. */
export function timetable(items: PlanItem[], start = DAY_START): Slot[] {
  let at = start;
  return items.map((item, i) => {
    const h = i ? hop(items[i - 1], item) : null;
    const travel = i ? h?.minutes ?? 15 : 0;
    const s = at + travel;
    at = s + item.minutes;
    return { item, start: s, end: at, travel, walk: h?.walk ?? true };
  });
}

/** Where the trip is today (`now`), in the city's own time; `pick` shows another day of the trip instead. */
export function tripToday(startDate: string | null, stops: PlanStop[], items: PlanItem[], now: Date, pick?: { stop: number; day: number }): Today {
  if (!stops.length) return { state: 'empty' };
  if (!startDate) return { state: 'nodates' };
  const dates = stopDates(startDate, stops);
  let at: { stop: number; day: number; date: string; zone: string; now: number } | null = null;
  if (pick && stops[pick.stop] && pick.day >= 0 && pick.day < stops[pick.stop].days) {
    const zone = stopZone(stops[pick.stop]);
    at = { ...pick, date: addDays(dates[pick.stop].from!, pick.day), zone, now: -1 };
  } else {
    for (let i = 0; i < stops.length && !at; i++) {
      const zone = stopZone(stops[i]), c = localClock(zone, now);
      if (c.date >= dates[i].from! && c.date <= dates[i].to!) at = { stop: i, day: Math.round((Date.parse(c.date) - Date.parse(dates[i].from!)) / 86_400_000), date: c.date, zone, now: c.minutes };
    }
  }
  if (!at) {
    const c = localClock(stopZone(stops[0]), now);
    if (c.date < dates[0].from!) return { state: 'before', days: Math.round((Date.parse(dates[0].from!) - Date.parse(c.date)) / 86_400_000), first: dates[0].from! };
    return { state: 'after' };
  }
  const stopId = stops[at.stop].id;
  const slots = timetable(items.filter((x) => x.stopId === stopId && x.day === at.day).sort((a, b) => a.position - b.position));
  const current = at.now < 0 ? -1 : slots.findIndex((s) => s.start <= at.now && at.now < s.end);
  const next = at.now < 0 ? (slots.length ? 0 : -1) : slots.findIndex((s) => s.start > at.now);
  return { state: 'during', ...at, slots, current, next, leaveAt: next >= 0 ? slots[next].start - slots[next].travel : null };
}

/** "09:30" from minutes past midnight. */
export const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
