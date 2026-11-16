import MONEY from './travel-money.json';
import { INTERESTS, type Idea, type Interest } from './travel-ideas';
import { VISA, type VisaRule } from './travel-visa';

// "Find a destination" (M205, the owner's item 1: "5 days in November, €400, street food, history,
// walkable: where should I go?"): every place ranked by that month's weather (its guide's climate
// chart), an estimated daily cost, the interests it's good for and how easy the visa is. Pure: the
// page ranks in the browser as you change the form, so it answers at once.
//
// The cost is an estimate, and says so: a day's spending at US prices for each style, times the
// country's price level (World Bank: household PPP ÷ the exchange rate, CC BY 4.0), dampened, since
// what visitors pay (rooms, tours) varies less between countries than what locals pay.

export const STYLES = {
  budget: { label: 'Budget', about: 'hostels and guesthouses, street food, buses', stay: 45, food: 30, local: 8, sights: 12 },
  mid: { label: 'Mid-range', about: 'a hotel room shared by two, restaurants, some tours', stay: 90, food: 60, local: 15, sights: 30 },
  comfort: { label: 'Comfort', about: 'good hotels, the best restaurants, taxis', stay: 200, food: 110, local: 30, sights: 50 },
} as const;
export type Style = keyof typeof STYLES;
export const STYLE_IDS = Object.keys(STYLES) as Style[];

const M = MONEY as unknown as { year: number; level: Record<string, number>; fx: Record<string, number>; currency: Record<string, string>; guessed: string[] };
export const MONEY_YEAR = M.year;
/** The currencies the app can convert (their dollar rate is known). */
export const CURRENCIES = Object.keys(M.fx).sort();
export const currencyOf = (cc: string) => M.currency[cc] ?? 'USD';

/** The country's price level against the US (1), and whether it's a guess (no World Bank figure). */
export function priceLevel(cc: string): { level: number; guessed: boolean } {
  const v = M.level[cc];
  return { level: v ?? 0.6, guessed: v === undefined || M.guessed.includes(cc) };
}

export interface DayCost { stay: number; food: number; local: number; sights: number; total: number }
/** A person's day there in US dollars, for a style. */
export function dailyCost(cc: string, style: Style): DayCost {
  const f = Math.min(1.6, Math.max(0.2, priceLevel(cc).level)) ** 0.8, s = STYLES[style];
  const stay = s.stay * f, food = s.food * f, local = s.local * f, sights = s.sights * f;
  return { stay, food, local, sights, total: stay + food + local + sights };
}

/** Dollars to another currency and back (the World Bank's yearly average rates: near enough to plan). */
export const fromUsd = (usd: number, currency: string) => usd * (M.fx[currency] ?? 1);
export const toUsd = (amount: number, currency: string) => amount / (M.fx[currency] ?? 1);
export function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); } catch { return `${Math.round(amount)} ${currency}`; }
}

export const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, i, 15)).toLocaleDateString('en', { month: 'long', timeZone: 'UTC' }));

export interface FindAsk { days: number; budget: number; currency: string; month: number; interests: Interest[]; passport?: string }
export type Fit = 'comfort' | 'mid' | 'budget' | 'tight' | 'over';
export interface Reason { good: boolean; text: string }
export interface Match { idea: Idea; score: number; fit: Fit | null; perDay: number | null; weather: { high: number; low: number; rain: number } | null; reasons: Reason[] }

const label = (id: Interest) => INTERESTS.find((x) => x.id === id)?.label ?? id;
function list(words: string[]) {
  const w = words.map((x, i) => (i ? x.toLowerCase() : x));
  return w.length < 2 ? w.join('') : `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`;
}
/** "90 days" or "3 months" in days (a month is 30). */
function stayDays(d?: string) {
  const m = /^(\d+) (day|week|month|year)/.exec(d ?? '');
  return m ? Number(m[1]) * { day: 1, week: 7, month: 30, year: 365 }[m[2] as 'day']! : null;
}

/** One place against what's asked: its score and why. */
export function matchPlace(idea: Idea, ask: FindAsk, visas: Record<string, VisaRule> | null): Match {
  const reasons: Reason[] = [];
  let score = 0;
  const wants = (id: Interest) => ask.interests.includes(id);
  const has = (id: Interest) => idea.tags.includes(id);
  const month = MONTHS[ask.month];

  // That month's weather.
  const c = idea.climate, weather = c ? { high: c.high[ask.month], low: c.low[ask.month], rain: c.rain[ask.month] } : null;
  if (weather) {
    const { high: h, rain: r } = weather;
    if (wants('snow') && has('snow') && h <= 6) { score += 2.5; reasons.push({ good: true, text: `Snow season: around ${h} °C in ${month}` }); }
    else if (wants('beach') && has('beach') && h >= 24 && h <= 33 && r < 150) { score += 2.5 - Math.abs(h - 29) * 0.05 - r * 0.003; reasons.push({ good: true, text: `Beach weather: around ${h} °C in ${month}` }); }
    // Ties break towards about 23 °C and drier.
    else if (h >= 17 && h <= 29 && r < 100) { score += 2.5 - Math.abs(h - 23) * 0.05 - r * 0.004; reasons.push({ good: true, text: `Around ${h} °C and mostly dry in ${month}` }); }
    else if (h >= 22 && r >= 200) { score -= 1.5; reasons.push({ good: false, text: `Rainy season: about ${r} mm in ${month}` }); }
    else if (h > 33) { score -= 1.5; reasons.push({ good: false, text: `Very hot: around ${h} °C in ${month}` }); }
    else if (h < 10) { score -= 1.5; reasons.push({ good: false, text: `Cold: around ${h} °C in ${month}` }); }
    else { score += 0.5; reasons.push({ good: true, text: `Around ${h} °C in ${month}${r >= 100 ? `, some rain (${r} mm)` : ''}` }); }
    if (wants('beach') && has('beach') && (h < 23 || r >= 200)) { score -= 1; reasons.push({ good: false, text: 'Not beach weather then' }); }
  }

  // The money: the budget per day against what a day costs there.
  let fit: Fit | null = null, perDay: number | null = null;
  if (ask.budget > 0 && ask.days > 0) {
    const day = toUsd(ask.budget, ask.currency) / ask.days;
    const cost = (s: Style) => dailyCost(idea.cc, s).total;
    fit = day >= cost('comfort') ? 'comfort' : day >= cost('mid') ? 'mid' : day >= cost('budget') ? 'budget' : day >= cost('budget') * 0.8 ? 'tight' : 'over';
    const style: Style = fit === 'comfort' || fit === 'mid' ? fit : 'budget';
    perDay = fromUsd(cost(style), ask.currency);
    const about = `about ${money(perDay, ask.currency)} a day`;
    if (fit === 'comfort') { score += 2; reasons.push({ good: true, text: `Fits a comfortable trip: ${about}` }); }
    else if (fit === 'mid') { score += 2; reasons.push({ good: true, text: `Fits a mid-range trip: ${about}` }); }
    else if (fit === 'budget') { score += 1.5; reasons.push({ good: true, text: `Fits a budget trip: ${about}` }); }
    else if (fit === 'tight') { score -= 0.5; reasons.push({ good: false, text: `Tight even on a budget: ${about}` }); }
    else { score -= 3; reasons.push({ good: false, text: `Over budget: ${about} even on a budget` }); }
  }

  // What they're after.
  if (ask.interests.length) {
    const hit = ask.interests.filter(has);
    if (hit.length) { score += 1.6 * hit.length; reasons.push({ good: true, text: list(hit.map(label)) }); }
    else { score -= 1; reasons.push({ good: false, text: `Not known for ${list(ask.interests.slice(0, 3).map(label)).toLowerCase()}` }); }
  }

  // The visa for their passport (Puerto Rico follows the United States' rules).
  if (ask.passport) {
    const dest = idea.cc === 'PR' ? 'US' : idea.cc;
    if (dest === ask.passport) { score += 2; reasons.push({ good: true, text: 'Your own country' }); }
    else {
      const rule = visas?.[dest];
      if (rule) {
        score += VISA[rule.s].score;
        reasons.push({ good: VISA[rule.s].score > 0, text: `${VISA[rule.s].words}${rule.d && VISA[rule.s].score > 0 ? ` (up to ${rule.d})` : ''}` });
        const max = stayDays(rule.d);
        if (max && ask.days > max && VISA[rule.s].score > 0) { score -= 1; reasons.push({ good: false, text: `Your stay is longer than the ${rule.d} allowed` }); }
      }
    }
  }
  return { idea, score: Math.round(score * 10) / 10, fit, perDay, weather, reasons };
}

/** Every place ranked, best first; at most two from one country among the first twelve, so the list
 *  isn't three Italian cities in a row. */
export function rankPlaces(ideas: Idea[], ask: FindAsk, visas: Record<string, VisaRule> | null): Match[] {
  const all = ideas.map((i) => matchPlace(i, ask, visas)).filter((m) => !m.reasons.some((r) => r.text === VISA.refused.words)).sort((a, b) => b.score - a.score);
  const top: Match[] = [], rest: Match[] = [], per = new Map<string, number>();
  for (const m of all) {
    const n = per.get(m.idea.cc) ?? 0;
    if (top.length < 12 && n < 2) { top.push(m); per.set(m.idea.cc, n + 1); } else rest.push(m);
  }
  return [...top, ...rest];
}
