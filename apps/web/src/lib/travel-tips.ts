import { close, plain, templateParams } from './travel-guide';

// "Know before you go" and "What to try" (M198, the owner: what Airbnb lacks: tipping culture, scams, tap
// water, plugs, etiquette and dress codes, fun and historical facts, a neighbourhood's feel, the dishes to
// try): a few short sentences picked from a Wikivoyage article's own words, by topic, plus its climate
// table. Pure; src/server/travel.ts reads the city's article and its country's for what the city's lacks.
// The words are Wikivoyage's (CC BY-SA): the guide credits it and links back.

export const TIP_TOPICS = ['tipping', 'water', 'scams', 'manners', 'dress', 'visa', 'airport', 'transit', 'dishes', 'stories', 'night'] as const;
export type TipTopic = (typeof TIP_TOPICS)[number];
export type Tips = Partial<Record<TipTopic, string[]>>;
/** Twelve months, January first: the average high and low (°C) and the rain (mm). */
export interface Climate { high: number[]; low: number[]; rain: number[] }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Where each topic is looked for (the article's top headings, lower case), what a sentence must say,
 *  and how many to keep. Sections in order of preference; [] means anywhere. */
const RULES: Record<TipTopic, { in: string[]; says: RegExp; also?: RegExp; keep: number }> = {
  tipping: { in: ['buy', 'eat', 'respect', 'understand', 'drink', 'sleep'], says: /\b(tip|tips|tipping|tipped|gratuity|service charge)\b/i, keep: 3 },
  water: { in: ['stay healthy', 'stay safe', 'drink', 'eat'], says: /\b(tap water|drinking water|bottled water|water is (?:safe|not safe|potable|drinkable)|boil (?:the |your )?water)\b/i, keep: 2 },
  scams: { in: ['stay safe', 'get around', 'buy', 'get in'], says: /\b(scams?|scammers?|pickpocket\w*|touts?|rip-?offs?|overcharg\w*|con artists?|bag[- ]snatch\w*)\b/i, keep: 3 },
  manners: { in: ['respect', 'cope', 'understand'], says: /\b(rude|polite|impolite|respect\w*|etiquette|customs?|taboo|offen\w+|bow|greet\w*|queue|shoes)\b/i, keep: 4 },
  dress: { in: ['respect', 'see', 'stay safe', 'cope', 'understand'], says: /\b(dress code|dress (?:modestly|conservatively)|modest(?:ly)? dress\w*|cover (?:your |their )?(?:shoulders|knees|head|hair|legs|arms)|(?:remove|take off) (?:your |their )?shoes|shorts|sleeveless)\b/i, keep: 3 },
  visa: { in: ['get in'], says: /\b(visas?|visa-free|passports?|e-?visa|entry requirements?)\b/i, keep: 3 },
  airport: { in: ['get in'], says: /\bairports?\b/i, also: /\b(train|bus|taxi|metro|subway|express|shuttle|transfer|minutes|rail|coach|tram)\b/i, keep: 3 },
  transit: { in: ['get around'], says: /\b(\w+ card|day pass|travel pass|tourist pass|multi-day pass|contactless|ticket machines?|single ticket|rides?|fares?)\b/i, keep: 3 },
  dishes: { in: ['eat', 'drink', 'understand'], says: /\b(dish(?:es)?|speciali[st]y|specialties|specialities|cuisine|delicac\w+|street food|famous for|local food|must[- ]try|signature|staple)\b/i, keep: 4 },
  stories: { in: ['understand'], says: /\b(founded|built|oldest|largest|first|famous|known as|capital|century|centuries|ancient|empire|UNESCO|legend|dynasty|history|historic)\b/i, keep: 5 },
  night: { in: ['stay safe'], says: /\b(at night|after dark|late at night|night-?time|in the evening)\b/i, keep: 3 },
};

/** A sentence a person reads in one go: not a list fragment, not a whole page. */
const usable = (s: string) => s.length >= 40 && s.length <= 320 && /[.!?)”"]$/.test(s) && !/^[^A-Z0-9“"(]/.test(s);

/** Paragraphs to sentences ("Mt. Fuji" and "e.g." don't end one). */
export function sentences(text: string): string[] {
  return text
    .replace(/\b(Mt|St|Dr|Mr|Mrs|Ms|No|approx|e\.g|i\.e|etc|vs)\./g, '$1\u0000')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/)
    .map((s) => s.replace(/\u0000/g, '.').trim())
    .filter(Boolean);
}

/** Each top heading's prose (listings and sub-headings taken out), keyed by the heading in lower case. */
function prose(wiki: string): Map<string, string> {
  const out = new Map<string, string>();
  const heads = [...wiki.matchAll(/^==\s*([^=\n][^\n]*?)\s*==\s*$/gm)];
  heads.forEach((h, i) => {
    const key = plain(h[1]).toLowerCase();
    let body = wiki.slice(h.index! + h[0].length, heads[i + 1]?.index ?? wiki.length);
    // Listing templates out (their words are a place's, not the city's); sub-headings out.
    for (const kind of ['see', 'do', 'buy', 'eat', 'drink', 'sleep', 'go', 'listing', 'marker', 'climate', 'climate chart']) {
      for (let k = body.search(new RegExp(`\\{\\{\\s*${kind}\\s*[|}]`, 'i')); k >= 0; k = body.search(new RegExp(`\\{\\{\\s*${kind}\\s*[|}]`, 'i'))) body = body.slice(0, k) + body.slice(close(body, k, '{{', '}}'));
    }
    const text = plain(body.replace(/^===+.*===+\s*$/gm, '')).split('\n').map((p) => p.replace(/^[*#:;]+\s*/, '').trim()).filter((p) => p.length > 30).join('\n');
    out.set(key, `${out.get(key) ?? ''}\n${text}`.trim());
  });
  return out;
}

/** The article's climate table ({{climate|units=Metric|jan high=…}}), in °C and mm. */
export function readClimate(wiki: string): Climate | undefined {
  // {{climate chart|Lisbon|low|high|rain|…twelve times…|units=imperial}}: the common one.
  const chart = wiki.search(/\{\{\s*climate chart\s*\|/i);
  if (chart >= 0) {
    const t = templateParams(wiki.slice(chart + 2, close(wiki, chart, '{{', '}}') - 2));
    const imp = /imperial/i.test(t.named.units ?? ''), v = t.pos.slice(1, 37).map((x) => Number(x.trim()));
    if (v.length === 36 && v.every(Number.isFinite)) {
      const c = (x: number) => Math.round(imp ? ((x - 32) * 5) / 9 : x);
      return { low: MONTHS.map((_, i) => c(v[i * 3])), high: MONTHS.map((_, i) => c(v[i * 3 + 1])), rain: MONTHS.map((_, i) => Math.round(imp ? v[i * 3 + 2] * 25.4 : v[i * 3 + 2])) };
    }
  }
  const at = wiki.search(/\{\{\s*climate\s*\|/i);
  if (at < 0) return undefined;
  const t = templateParams(wiki.slice(at + 2, close(wiki, at, '{{', '}}') - 2));
  const imperial = /imperial/i.test(t.named.units ?? '');
  const n = (k: string) => { const v = Number((t.named[k] ?? '').replace(/[^\d.-]/g, '')); return (t.named[k] ?? '').trim() && Number.isFinite(v) ? v : NaN; };
  const c = (f: number) => (imperial ? Math.round(((f - 32) * 5) / 9) : Math.round(f));
  const high = MONTHS.map((m) => c(n(`${m} high`))), low = MONTHS.map((m) => c(n(`${m} low`)));
  const rain = MONTHS.map((m) => { const v = n(`${m} precip`); return imperial ? Math.round(v * 25.4) : Math.round(v); });
  return high.every(Number.isFinite) && low.every(Number.isFinite) ? { high, low, rain: rain.map((r) => (Number.isFinite(r) ? r : 0)) } : undefined;
}

/** The short sentences an article has on each topic, and its climate. */
export function readTips(wiki: string): { tips: Tips; climate?: Climate } {
  const text = prose(wiki), tips: Tips = {};
  for (const topic of TIP_TOPICS) {
    const rule = RULES[topic], found: string[] = [];
    for (const part of rule.in) {
      for (const s of sentences(text.get(part) ?? '')) {
        if (found.length >= rule.keep) break;
        if (usable(s) && rule.says.test(s) && (!rule.also || rule.also.test(s)) && !found.includes(s)) found.push(s);
      }
    }
    if (found.length) tips[topic] = found;
  }
  return { tips, climate: readClimate(wiki) };
}

/** The city's tips, with its country's for the topics the city's article doesn't cover. */
export function mergeTips(city: Tips, country: Tips | undefined): { tips: Tips; fromCountry: TipTopic[] } {
  const tips: Tips = { ...city }, fromCountry: TipTopic[] = [];
  for (const topic of TIP_TOPICS) {
    // Stories, dishes and the night are the place's own; the rest is often the same across a country.
    if (tips[topic]?.length || !country?.[topic]?.length || topic === 'stories' || topic === 'night') continue;
    tips[topic] = country[topic];
    fromCountry.push(topic);
  }
  return { tips, fromCountry };
}

/** The months that are pleasant to walk around in (highs 17–29 °C, under 100 mm of rain), by number 0–11. */
export function goodMonths(c: Climate): number[] {
  return c.high.map((h, i) => (h >= 17 && h <= 29 && c.rain[i] < 100 ? i : -1)).filter((i) => i >= 0);
}

/** What a dish, a stall or a menu says about who can eat there. */
export const DIETS = [
  { id: 'vegetarian', label: 'Vegetarian', says: /\b(vegetarian|veggie|meat-?free)\b/i },
  { id: 'vegan', label: 'Vegan', says: /\b(vegan|plant-based)\b/i },
  { id: 'halal', label: 'Halal', says: /\bhalal\b/i },
  { id: 'kosher', label: 'Kosher', says: /\bkosher\b/i },
  { id: 'gluten', label: 'Gluten-free', says: /\b(gluten-?free|coeliac|celiac)\b/i },
  { id: 'street', label: 'Street food', says: /\b(street food|stalls?|hawkers?|night market|food court|food hall|food truck|market)\b/i },
] as const;
export type DietId = (typeof DIETS)[number]['id'];

/** A listing's price band from the heading it's under (Wikivoyage's Budget / Mid-range / Splurge). */
export function priceBand(group?: string): 'budget' | 'mid' | 'splurge' | null {
  const g = (group ?? '').toLowerCase();
  if (/budget|cheap|inexpensive|street|hostel/.test(g)) return 'budget';
  if (/mid|moderate/.test(g)) return 'mid';
  if (/splurge|expensive|upscale|luxury|fine/.test(g)) return 'splurge';
  return null;
}

/** A district's feel in a few words, from how its guide describes it. */
const VIBES: [string, RegExp][] = [
  ['Historic', /\b(historic|old town|old city|ancient|medieval|temples?|castle|heritage)\b/i],
  ['Nightlife', /\b(nightlife|bars?|clubs?|pubs?|night ?life|party)\b/i],
  ['Shopping', /\b(shopping|shops|boutiques?|malls?|department stores?|markets?)\b/i],
  ['Quiet', /\b(quiet|residential|calm|peaceful|leafy|relaxed|sleepy)\b/i],
  ['Students', /\b(students?|universit(?:y|ies)|campus|college)\b/i],
  ['Business', /\b(business|financial|offices?|skyscrapers?|commercial)\b/i],
  ['Arts', /\b(arts?|galler(?:y|ies)|museums?|theatres?|theaters?|bohemian|creative)\b/i],
  ['Food', /\b(food|restaurants?|cafés?|cafes?|eateries|dining)\b/i],
  ['Waterfront', /\b(beach(?:es)?|waterfront|harbou?r|river ?side|seaside|lake ?side|port)\b/i],
  ['Green', /\b(parks?|gardens?|green|hills?|forest|nature)\b/i],
  ['Transit hub', /\b(station|terminal|airport|transport hub|well connected)\b/i],
];
export function vibes(text?: string): string[] {
  return text ? VIBES.filter(([, re]) => re.test(text)).map(([v]) => v).slice(0, 4) : [];
}
