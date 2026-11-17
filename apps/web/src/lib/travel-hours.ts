import { readHours, type Week } from './opening-hours';
import { addDays, stopDates, type PlanItem, type PlanStop } from './travel-plan';
import { timetable } from './travel-today';

// M251: the opening-hours check, pure and tested (travel-hours.test.ts): for each planned place, is it open when the
// day's timetable has you there? Reads OpenStreetMap's format (opening-hours.ts) and the guides' plain words
// ("10:00–18:30", "9AM-5PM, closed Mondays", "Tu-Su 10:00-18:00"). When the hours can't be read, it says nothing.

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const ABBR = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];

function minutes(h: string, m: string | undefined, ap: string | undefined) {
  let x = Number(h) % 24;
  if (ap?.toLowerCase() === 'pm' && x < 12) x += 12;
  if (ap?.toLowerCase() === 'am' && x === 12) x = 0;
  return x * 60 + Number(m ?? 0);
}

/** A week of hours from a guide's words or OSM's format, or null when it can't be read. */
export function weekOf(raw: string | null | undefined): Week | null {
  if (!raw) return null;
  const osm = readHours(raw);
  if (osm?.sure) return osm.week;
  const t = raw.toLowerCase().replace(/[–—]|\bto\b/g, '-').replace(/\s*-\s*/g, '-').replace(/(\d)\.(\d{2})/g, '$1:$2');
  const r = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?-(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(t);
  if (!r || (!r[2] && !r[3])) return null; // "1-2" is not a time
  const open = minutes(r[1], r[2], r[3] ?? (r[6] === 'pm' && Number(r[1]) < 12 && Number(r[1]) > Number(r[4]) ? 'am' : undefined));
  let close = minutes(r[4], r[5], r[6]);
  if (close <= open) close += 1440;
  const week: Week = Array.from({ length: 7 }, () => [[open, close]]);
  const span = /\b(mo|tu|we|th|fr|sa|su)[a-z]*-(mo|tu|we|th|fr|sa|su)[a-z]*\b/.exec(t);
  if (span && t.indexOf(span[0]) < t.indexOf(r[0])) {
    const a = ABBR.indexOf(span[1]), b = ABBR.indexOf(span[2]);
    const on = new Set<number>(); for (let i = a; ; i = (i + 1) % 7) { on.add(i); if (i === b) break; }
    week.forEach((_, i) => { if (!on.has(i)) week[i] = []; });
  }
  DAYS.forEach((d, i) => { if (new RegExp(`closed (on )?${d}s?|${d}s? closed|${d}s?: closed`).test(t)) week[i] = []; });
  return week;
}

export type Problem = 'closed' | 'opens later' | 'closes before you leave';
/** Whether a place is open from `start` to `end` (minutes) on `day` (Monday 0); null when the hours can't be read. */
export function hoursProblem(week: Week | null, day: number, start: number, end: number): Problem | null {
  if (!week) return null;
  const spans = week[day];
  if (!spans.length) return 'closed';
  if (spans.some(([a, b]) => a <= start && end <= b)) return null;
  if (spans.every(([, b]) => b <= start) || spans.every(([a]) => a >= end)) return spans.some(([a]) => a > start) && spans.every(([, b]) => b > start) ? 'opens later' : 'closed';
  return spans.some(([a]) => a > start) ? 'opens later' : 'closes before you leave';
}

export interface HoursIssue { item: PlanItem; date: string; start: number; problem: Problem; hours: string }
/** Every planned place on the trip that the timetable puts there while it's closed. */
export function tripHoursIssues(startDate: string | null, stops: PlanStop[], items: PlanItem[]): HoursIssue[] {
  if (!startDate) return [];
  const dates = stopDates(startDate, stops), out: HoursIssue[] = [];
  stops.forEach((s, i) => {
    for (let d = 0; d < s.days; d++) {
      const date = addDays(dates[i].from!, d), weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
      for (const slot of timetable(items.filter((x) => x.stopId === s.id && x.day === d).sort((a, b) => a.position - b.position))) {
        const problem = hoursProblem(weekOf(slot.item.hours), weekday, slot.start, slot.end);
        if (problem) out.push({ item: slot.item, date, start: slot.start, problem, hours: slot.item.hours! });
      }
    }
  });
  return out;
}
