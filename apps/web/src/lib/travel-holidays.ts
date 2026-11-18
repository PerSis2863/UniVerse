// M246: what's on during a trip, pure and tested (travel-holidays.test.ts): the public holidays of each city's country
// on its own dates (Nager.Date's free list, read by the browser), with what may close, and the festivals and events
// the city's guide (Wikivoyage) mentions, those in the trip's months first.

export interface Holiday { date: string; localName: string; name: string; countryCode: string; global?: boolean; counties?: string[] | null; types?: string[] }
export const holidaysUrl = (year: number, cc: string) => `https://date.nager.at/api/v3/PublicHolidays/${year}/${cc.toUpperCase()}`;

/** The years a stretch of dates touches. */
export const yearsOf = (from: string, to: string) => { const a = Number(from.slice(0, 4)), b = Number(to.slice(0, 4)); return a === b ? [a] : [a, b]; };

/** The holidays between two dates (YYYY-MM-DD, both included), once each, in order. */
export function holidaysOn(list: Holiday[], from: string, to: string): Holiday[] {
  const seen = new Set<string>();
  return list.filter((h) => h.date >= from && h.date <= to && !seen.has(h.date + h.name) && seen.add(h.date + h.name)).sort((a, b) => a.date.localeCompare(b.date));
}

/** What a holiday may mean for a visitor. */
export function closes(h: Holiday): string {
  const t = h.types ?? ['Public'];
  const where = h.global === false && h.counties?.length ? ' in some regions' : '';
  if (t.includes('Public')) return `Banks, offices and many shops may close${where}; museums and transport often keep Sunday hours.`;
  if (t.includes('Bank')) return `Banks close${where}.`;
  if (t.includes('School')) return `Schools are off${where}: busier sights.`;
  return `A day off for some${where}.`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FESTIVE = /\b(festivals?|festas?|fiestas?|carnivals?|carnaval|feasts?|parades?|processions?|celebrat\w+|fireworks|fair|matsuri|holi|diwali|oktoberfest|new year)\b/i;

/** The trip's months (0–11) between two dates. */
export function monthsOf(from: string, to: string): number[] {
  const out: number[] = [];
  for (let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7)) - 1; y < Number(to.slice(0, 4)) || (y === Number(to.slice(0, 4)) && m <= Number(to.slice(5, 7)) - 1);) {
    out.push(m); m++; if (m === 12) { m = 0; y++; } if (out.length > 12) break;
  }
  return [...new Set(out)];
}

/** Sentences of a guide that speak of festivals and events: those naming one of the trip's months first, then the rest
 *  (marked), at most `max`. */
export function festivalLines(texts: string[], months: number[], max = 4): { text: string; inMonth: boolean }[] {
  const names = months.map((m) => MONTHS[m]);
  const sentences = texts.flatMap((t) => t.split(/(?<=[.!?])\s+(?=[A-Z0-9])/)).map((s) => s.trim()).filter((s) => s.length > 20 && s.length < 400 && FESTIVE.test(s));
  const seen = new Set<string>();
  const unique = sentences.filter((s) => !seen.has(s) && seen.add(s));
  const inMonth = unique.filter((s) => names.some((n) => s.includes(n)));
  const other = unique.filter((s) => !inMonth.includes(s) && !MONTHS.some((n) => s.includes(n)));
  return [...inMonth.map((text) => ({ text, inMonth: true })), ...other.map((text) => ({ text, inMonth: false }))].slice(0, max);
}
