import { dailyCost, fromUsd, priceLevel, toUsd, currencyOf, type Style } from './travel-find';
import { esc, fold } from './ics-text';

// The trip planner's sums (M206, the owner's Airbnb list items 4, 5 and 7), pure so the page answers at
// once and the tests can hold them: each city's dates, the time a place takes, the walk between two,
// grouping a city's places into days by how close they are, the cities in a sensible order, getting
// between them, the whole trip's budget and its calendar file.

export interface PlanStop { id: string; guide: string; name: string; cc: string | null; lat: number | null; lon: number | null; days: number; position: number }
export interface PlanItem { id: string; stopId: string; day: number | null; position: number; name: string; kind: string; lat: number | null; lon: number | null; hours: string | null; price: string | null; minutes: number; note?: string | null }
export interface PlanTrip { name: string; startDate: string | null; travellers: number; style: Style; currency: string }

// ——— Dates ———

const DAY = 86_400_000;
export const isDay = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const tripDays = (stops: Pick<PlanStop, 'days'>[]) => stops.reduce((n, s) => n + s.days, 0);

/** Each city's first day and its last, in order (null without a start date), and its first day number. */
export function stopDates(startDate: string | null, stops: Pick<PlanStop, 'days'>[]) {
  let at = 0;
  return stops.map((s) => {
    const first = at;
    at += s.days;
    return { offset: first, from: startDate ? addDays(startDate, first) : null, to: startDate ? addDays(startDate, first + s.days - 1) : null };
  });
}

/** Nights to book in each city: you sleep where you are every night but the trip's last. */
export const nightsAt = (stops: Pick<PlanStop, 'days'>[]) => stops.map((s, i) => (i === stops.length - 1 ? Math.max(0, s.days - 1) : s.days));

// ——— Time ———

/** How long a place usually takes, by its kind and what it is (a museum 2 h, a viewpoint 30 min). */
export function minutesFor(kind: string, name = '', text = '') {
  const w = `${name} ${text}`.toLowerCase();
  if (kind === 'sleep') return 0;
  if (kind === 'go') return 240; // a day trip or excursion
  if (/\b(zoo|aquarium|theme park|amusement|safari|national park|hike|trek)\b/.test(w)) return 180;
  if (/\b(museum|gallery|palace|castle|fortress|cathedral|basilica|temple complex|exhibition)\b/.test(w)) return 120;
  if (/\b(viewpoint|lookout|view point|observation|tower|bridge|square|statue|fountain|gate|monument|memorial)\b/.test(w)) return 30;
  if (/\b(park|garden|beach|market|bazaar|souk)\b/.test(w)) return 60;
  return { see: 75, do: 120, eat: 75, drink: 60, buy: 45 }[kind] ?? 60;
}
export const TIME_CHOICES = [15, 30, 45, 60, 90, 120, 180, 240, 360] as const;
export function hm(minutes: number) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? (m ? `${h} h ${m}` : `${h} h`) : `${m} min`;
}

// ——— Distance ———

type Pos = { lat: number | null; lon: number | null };
const located = (p: Pos): p is { lat: number; lon: number } => p.lat !== null && p.lon !== null;
/** Great-circle kilometres between two places. */
export function km(a: Pos, b: Pos) {
  if (!located(a) || !located(b)) return null;
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}
/** Getting from one place to the next in a city: a walk up to 2 km, else the metro, a bus or a taxi. */
export function hop(a: Pos, b: Pos): { minutes: number; walk: boolean } | null {
  const d = km(a, b);
  if (d === null) return null;
  const street = d * 1.3; // streets aren't straight
  return street <= 2 ? { minutes: Math.max(1, Math.round((street / 4.5) * 60)), walk: true } : { minutes: Math.round(10 + (street / 20) * 60), walk: false };
}

/** Visit order inside a day: the nearest next place each time, starting from an end. */
function chain<T extends Pos>(list: T[]): T[] {
  const rest = list.filter(located), loose = list.filter((p) => !located(p));
  if (rest.length < 3) return [...rest, ...loose];
  // Start at the place farthest from the middle (an end of the walk), then the nearest each time.
  const c = { lat: rest.reduce((n, p) => n + p.lat!, 0) / rest.length, lon: rest.reduce((n, p) => n + p.lon!, 0) / rest.length };
  rest.sort((a, b) => km(b, c)! - km(a, c)!);
  const out = [rest.shift()!];
  while (rest.length) {
    const last = out[out.length - 1];
    let best = 0;
    for (let i = 1; i < rest.length; i++) if (km(last, rest[i])! < km(last, rest[best])!) best = i;
    out.push(rest.splice(best, 1)[0]);
  }
  return [...out, ...loose];
}

/** A city's places spread over its days by how close they are: a sweep round the middle cut into days
 *  of about equal time (at least five hours each), each day in walking order. Places without a position fill the lightest days.
 *  Returns each place's day and position. */
export function planDays(items: PlanItem[], days: number): { id: string; day: number; position: number }[] {
  const n = Math.max(1, days), want = items.filter((i) => i.kind !== 'sleep');
  const at = want.filter(located), loose = want.filter((i) => !located(i));
  const groups: PlanItem[][] = Array.from({ length: n }, () => []);
  if (at.length) {
    const c = { lat: at.reduce((s, p) => s + p.lat!, 0) / at.length, lon: at.reduce((s, p) => s + p.lon!, 0) / at.length };
    const sweep = [...at].sort((a, b) => Math.atan2(a.lat! - c.lat, a.lon! - c.lon) - Math.atan2(b.lat! - c.lat, b.lon! - c.lon));
    // Start the sweep after its widest gap, so one day isn't split across it.
    let cut = 0, gap = -1;
    for (let i = 0; i < sweep.length; i++) {
      const a = Math.atan2(sweep[i].lat! - c.lat, sweep[i].lon! - c.lon), b = Math.atan2(sweep[(i + 1) % sweep.length].lat! - c.lat, sweep[(i + 1) % sweep.length].lon! - c.lon);
      const g = (b - a + 2 * Math.PI) % (2 * Math.PI);
      if (g > gap) { gap = g; cut = (i + 1) % sweep.length; }
    }
    const ring = [...sweep.slice(cut), ...sweep.slice(0, cut)];
    // About five hours of plans a day before the next: a few places fill a day or two, not one each.
    const total = ring.reduce((s, p) => s + p.minutes, 0), per = Math.max(total / n, 300);
    let d = 0, used = 0;
    for (const p of ring) {
      if (d < n - 1 && used > 0 && used + p.minutes / 2 > per * (d + 1)) d++;
      groups[d].push(p);
      used += p.minutes;
    }
  }
  for (const p of loose) groups.reduce((a, b) => (b.reduce((s, x) => s + x.minutes, 0) < a.reduce((s, x) => s + x.minutes, 0) ? b : a)).push(p);
  return groups.flatMap((g, day) => chain(g).map((p, position) => ({ id: p.id, day, position })));
}

/** The cities in a sensible order: the first stays first, then the shortest route through the rest
 *  (nearest next, then improved by reversing stretches while that shortens it). */
export function bestOrder<T extends Pos & { id: string }>(stops: T[]): T[] {
  if (stops.length < 3 || stops.some((s) => !located(s))) return stops;
  const route = [stops[0]], rest = stops.slice(1);
  while (rest.length) {
    const last = route[route.length - 1];
    let best = 0;
    for (let i = 1; i < rest.length; i++) if (km(last, rest[i])! < km(last, rest[best])!) best = i;
    route.push(rest.splice(best, 1)[0]);
  }
  const length = (r: T[]) => r.slice(1).reduce((s, p, i) => s + km(r[i], p)!, 0);
  for (let better = true; better;) {
    better = false;
    for (let i = 1; i < route.length - 1; i++) for (let j = i + 1; j < route.length; j++) {
      const next = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
      if (length(next) < length(route) - 0.5) { route.splice(0, route.length, ...next); better = true; }
    }
  }
  return route;
}

/** Between two cities: how far, the likely way and roughly how long. */
export function leg(a: Pos, b: Pos): { km: number; flight: boolean; hours: number } | null {
  const d = km(a, b);
  if (d === null) return null;
  const flight = d > 700;
  return { km: Math.round(d), flight, hours: flight ? Math.round((2.5 + d / 750) * 2) / 2 : Math.max(0.5, Math.round(((d * 1.25) / 75) * 2) / 2) };
}

// ——— Prices in a guide's words ———

const SYMBOLS: [RegExp, string | ((local: string) => string)][] = [
  [/US\$|USD/i, 'USD'], [/€|EUR\b|euros?/i, 'EUR'], [/£|GBP/i, 'GBP'], [/¥|円|yen\b|JPY/i, (l) => (l === 'CNY' ? 'CNY' : 'JPY')], [/元|RMB|CNY|yuan/i, 'CNY'],
  [/₹|INR/i, 'INR'], [/฿|THB|baht/i, 'THB'], [/₫|VND|dong\b/i, 'VND'], [/₩|KRW|won\b/i, 'KRW'], [/₺|TRY|lira/i, 'TRY'], [/R\$|BRL/i, 'BRL'],
  [/zł|PLN/i, 'PLN'], [/Kč|CZK/i, 'CZK'], [/\bFt\b|HUF/i, 'HUF'], [/RM\b|MYR/i, 'MYR'], [/\bRp\.?\b|IDR/i, 'IDR'], [/AED|Dhs?\b/i, 'AED'],
  [/MAD|dirhams?/i, 'MAD'], [/\bRs\.?|rupees?/i, (l) => (['INR', 'LKR', 'NPR', 'PKR'].includes(l) ? l : 'INR')], [/\bkr\.?\b|kroner?|kronor/i, (l) => (['DKK', 'SEK', 'NOK', 'ISK'].includes(l) ? l : 'DKK')],
  [/\$/, (l) => (/D$|MXN|ARS|COP|CLP|UYU/.test(l) ? l : 'USD')],
];

/** The first price in a guide's words ("€8–20", "¥1,500", "Rp 50.000", "free") in its currency; the
 *  place's own currency when none is written. Null when there's no number. */
export function readPrice(text: string | null | undefined, local: string): { amount: number; currency: string } | null {
  if (!text) return null;
  if (/^\s*(free|no charge|gratis)\b/i.test(text)) return { amount: 0, currency: local };
  const m = /(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d{1,2})?)/.exec(text);
  if (!m) return null;
  const raw = m[1], amount = /[.,\s]\d{3}$/.test(raw) && !/^\d+[.,]\d{1,2}$/.test(raw) ? Number(raw.replace(/[.,\s]/g, '')) : Number(raw.replace(',', '.'));
  if (!Number.isFinite(amount)) return null;
  const sym = SYMBOLS.find(([re]) => re.test(text));
  const currency = sym ? (typeof sym[1] === 'string' ? sym[1] : sym[1](local)) : local;
  return { amount, currency };
}

// ——— The whole trip's budget ———

export interface Budget {
  currency: string; stay: number; food: number; local: number; between: number; tickets: number; total: number; perPerson: number;
  /** Places to see and do with no price in their guide (left out of tickets). */
  unpriced: number; guessed: boolean;
}

/** Stay + food + getting around + between cities + tickets, for everyone: estimates from the country's
 *  price level and the trip's style, a sleep place's own price where it has one, the listed prices of
 *  the places to see and do. */
export function tripBudget(trip: PlanTrip, stops: PlanStop[], items: PlanItem[]): Budget {
  const cur = trip.currency, people = Math.max(1, trip.travellers), nights = nightsAt(stops);
  let stay = 0, food = 0, local = 0, between = 0, tickets = 0, unpriced = 0, guessed = false;
  stops.forEach((s, i) => {
    const cc = s.cc ?? 'US', day = dailyCost(cc, trip.style), localCur = currencyOf(cc);
    guessed ||= !s.cc || priceLevel(cc).guessed;
    const bed = items.find((it) => it.stopId === s.id && it.kind === 'sleep' && readPrice(it.price, localCur));
    const own = bed && readPrice(bed.price, localCur);
    // A place's own price is for the room: shared by two travellers in the mid-range and comfort styles.
    stay += own ? toUsd(own.amount, own.currency) * nights[i] / (trip.style === 'budget' ? 1 : Math.min(2, people)) * people : day.stay * nights[i] * people;
    food += day.food * s.days * people;
    local += day.local * s.days * people;
    for (const it of items) {
      if (it.stopId !== s.id || (it.kind !== 'see' && it.kind !== 'do' && it.kind !== 'go')) continue;
      const p = readPrice(it.price, localCur);
      if (p) tickets += toUsd(p.amount, p.currency) * people; else unpriced++;
    }
    const next = stops[i + 1], l = next && leg(s, next);
    if (l) {
      const f = Math.min(1.6, Math.max(0.2, (priceLevel(cc).level + priceLevel(next.cc ?? cc).level) / 2)) ** 0.8;
      between += (l.flight ? (50 + l.km * 0.07) * Math.max(0.6, f) : (6 + l.km * 0.08) * f) * people;
    }
  });
  const usd = { stay, food, local, between, tickets };
  const c = Object.fromEntries(Object.entries(usd).map(([k, v]) => [k, Math.round(fromUsd(v, cur))])) as Record<keyof typeof usd, number>;
  const total = c.stay + c.food + c.local + c.between + c.tickets;
  return { currency: cur, ...c, total, perPerson: Math.round(total / people), unpriced, guessed };
}

// ——— The calendar file ———

/** The trip as an iCalendar file: each city as all-day days, with that day's plan in its notes. */
export function tripIcs(trip: PlanTrip & { id: string }, stops: PlanStop[], items: PlanItem[], now = new Date()): string | null {
  if (!trip.startDate) return null;
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''), date = (d: string) => d.replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UniVerse//Travel//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(trip.name)}`];
  const dates = stopDates(trip.startDate, stops);
  stops.forEach((s, i) => {
    for (let d = 0; d < s.days; d++) {
      const day = addDays(trip.startDate!, dates[i].offset + d);
      const plan = items.filter((it) => it.stopId === s.id && it.day === d).sort((a, b) => a.position - b.position);
      lines.push('BEGIN:VEVENT', `UID:${s.id}-${d}@travel.universe`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${date(day)}`, `DTEND;VALUE=DATE:${date(addDays(day, 1))}`,
        `SUMMARY:${esc(`${s.name}: day ${d + 1} · ${trip.name}`)}`, ...(plan.length ? [`DESCRIPTION:${esc(plan.map((p, n) => `${n + 1}. ${p.name}${p.hours ? ` (open ${p.hours})` : ''}`).join('\n'))}`] : []),
        ...(s.lat !== null && s.lon !== null ? [`GEO:${s.lat.toFixed(4)};${s.lon.toFixed(4)}`] : []), `LOCATION:${esc(s.name)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
    }
  });
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
