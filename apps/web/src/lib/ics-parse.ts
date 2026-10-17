import { localTime } from './home-time';

// Reading a calendar file (.ics, from Google, Outlook or Apple Calendar) into personal events
// (Stage 5 · Q12): each event's title, times (UTC, a named time zone, or the viewer's own), where,
// and simple repeats (daily or weekly, by count or end date) unrolled into single events.

export interface IcsEvent { title: string; startAt: string; endAt: string; description?: string }

const MAX_REPEATS = 52;
const DAY_MS = 86_400_000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const unescape = (v: string) => v.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c)).trim();

interface Prop { params: Record<string, string>; value: string }

/** A local date and clock time in a time zone, so a repeat keeps its clock time when summer time starts. */
interface Local { day: string; hhmm: string; zone: string | undefined }

/** A DTSTART / DTEND / UNTIL value as a moment (ms), whether it's a whole day, and its local time when it has one. */
function moment(p: Prop | undefined, viewerZone: string | undefined): { at: number; allDay: boolean; local?: Local } | null {
  if (!p) return null;
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(p.value.trim());
  if (!m) return null;
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4]) {
    const at = localTime(day, '00:00', viewerZone);
    return at == null ? null : { at, allDay: true, local: { day, hhmm: '00:00', zone: viewerZone } };
  }
  if (m[7]) return { at: Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)), allDay: false };
  let zone = p.params.TZID?.replace(/^"|"$/g, '') || viewerZone;
  try { if (zone) new Intl.DateTimeFormat('en', { timeZone: zone }); } catch { zone = viewerZone; }
  const hhmm = `${m[4]}:${m[5]}`;
  const at = localTime(day, hhmm, zone);
  return at == null ? null : { at, allDay: false, local: { day, hhmm, zone } };
}

/** "P1DT2H30M", "PT45M", "P1W" in ms. */
function duration(v: string | undefined): number | null {
  const m = v && /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const ms = ((Number(m[2] ?? 0) * 7 + Number(m[3] ?? 0)) * 24 * 3600 + Number(m[4] ?? 0) * 3600 + Number(m[5] ?? 0) * 60 + Number(m[6] ?? 0)) * 1000;
  return m[1] === '-' ? null : ms;
}

/** The events in a calendar file, at most `limit`, from `from` (ms) onwards. */
export function parseIcs(text: string, opts: { timeZone?: string; from?: number; limit?: number } = {}): IcsEvent[] {
  const limit = Math.min(opts.limit ?? 300, 1000);
  const from = opts.from ?? -Infinity;
  // Long lines carry on on the next line after a space or a tab.
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out: IcsEvent[] = [];
  let cur: Record<string, Prop> | null = null;
  for (const line of lines) {
    if (out.length >= limit) break;
    if (/^BEGIN:VEVENT$/i.test(line.trim())) { cur = {}; continue; }
    if (/^END:VEVENT$/i.test(line.trim())) {
      if (cur) for (const e of unroll(cur, opts.timeZone, from)) { if (out.length < limit) out.push(e); }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const [name, ...rawParams] = line.slice(0, colon).split(';');
    const params: Record<string, string> = {};
    for (const x of rawParams) { const eq = x.indexOf('='); if (eq > 0) params[x.slice(0, eq).toUpperCase()] = x.slice(eq + 1); }
    const key = name.toUpperCase();
    if (!(key in cur)) cur[key] = { params, value: line.slice(colon + 1) };
  }
  return out;
}

function unroll(p: Record<string, Prop>, zone: string | undefined, from: number): IcsEvent[] {
  if (p.STATUS?.value.trim().toUpperCase() === 'CANCELLED') return [];
  const start = moment(p.DTSTART, zone);
  if (!start) return [];
  const end = moment(p.DTEND, zone);
  const length = end && end.at > start.at ? end.at - start.at : duration(p.DURATION?.value) ?? (start.allDay ? DAY_MS : 3_600_000);
  const title = unescape(p.SUMMARY?.value ?? '').slice(0, 200) || 'Busy';
  const place = unescape(p.LOCATION?.value ?? '');
  const notes = unescape(p.DESCRIPTION?.value ?? '');
  const description = [place, notes].filter(Boolean).join('\n').slice(0, 2000) || undefined;
  const make = (at: number): IcsEvent => ({ title, startAt: new Date(at).toISOString(), endAt: new Date(at + Math.min(length, 31 * DAY_MS)).toISOString(), ...(description ? { description } : {}) });

  const rule = Object.fromEntries((p.RRULE?.value ?? '').split(';').map((x) => x.split('=') as [string, string]).filter((x) => x.length === 2).map(([k, v]) => [k.toUpperCase(), v.toUpperCase()]));
  if (rule.FREQ !== 'DAILY' && rule.FREQ !== 'WEEKLY') return start.at + length >= from ? [make(start.at)] : [];
  const every = Math.max(1, Math.min(52, Number(rule.INTERVAL) || 1));
  const count = Math.min(MAX_REPEATS, Number(rule.COUNT) || MAX_REPEATS);
  const until = rule.UNTIL ? moment({ params: {}, value: rule.UNTIL }, zone)?.at ?? Infinity : Infinity;
  const local = start.local;
  // The i-th day after the start: its weekday, and its moment only when it's wanted (a local time
  // keeps its clock time when summer time starts or ends).
  const weekdayAt = (i: number) => (local ? new Date(Date.parse(`${local.day}T12:00:00Z`) + i * DAY_MS) : new Date(start.at + i * DAY_MS)).getUTCDay();
  const momentAt = (i: number) => (local ? localTime(new Date(Date.parse(`${local.day}T12:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10), local.hhmm, local.zone) : start.at + i * DAY_MS);
  const days = rule.FREQ === 'WEEKLY' && rule.BYDAY
    ? rule.BYDAY.split(',').map((d) => WEEKDAYS.indexOf(d.replace(/^[+-]?\d+/, ''))).filter((d) => d >= 0)
    : [weekdayAt(0)];
  const out: IcsEvent[] = [];
  let made = 0;
  for (let i = 0; made < count && i < 3700; i++) {
    const ok = rule.FREQ === 'DAILY' ? i % every === 0 : Math.floor(i / 7) % every === 0 && days.includes(weekdayAt(i));
    if (!ok) continue;
    const at = momentAt(i);
    if (at == null) continue;
    if (at > until) break;
    made++;
    if (at + length >= from) out.push(make(at));
  }
  return out;
}
