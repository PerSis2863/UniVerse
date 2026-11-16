// UniVerse Travel's tables read ahead (M205), run by hand when they need refreshing, from apps/web:
//   npx tsx scripts/gen-travel-data.mts --places   each place's position, climate and banner (Wikivoyage; NASA POWER's
//                                                 averages, public domain, where a guide has no climate chart)
//   npx tsx scripts/gen-travel-data.mts --money    price levels and exchange rates (World Bank, CC BY 4.0)
//   npx tsx scripts/gen-travel-data.mts --visa     which Wikipedia article lists each passport's visa rules
//   npx tsx scripts/gen-travel-data.mts --zones    each time zone's country and main place (the IANA list, public
//                                                 domain, from the machine's /usr/share/zoneinfo/zone.tab; M209)
// Gently: one request at a time, named, with a pause (Wikimedia asks for both).
import { readFileSync, writeFileSync } from 'node:fs';
import { readGuide } from '../src/lib/travel-guide';
import { readClimate } from '../src/lib/travel-tips';

const UA = 'UniVerseTravel/1.0 (https://github.com/PerSis2863/UniVerse; travel guides)';
const LIB = new URL('../src/lib/', import.meta.url);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(url: string) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } });
    if (r.status === 404) return null;
    if (r.ok) return r.text();
    await pause(2000 * (i + 1));
  }
  throw new Error(`${url} failed`);
}
const save = (name: string, data: unknown) => writeFileSync(new URL(name, LIB), `${JSON.stringify(data)}\n`);

/** A Wikivoyage article's text, following redirects. */
async function article(title: string): Promise<{ title: string; wiki: string } | null> {
  for (let hop = 0; hop < 3; hop++) {
    const wiki = await get(`https://en.wikivoyage.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}?action=raw`);
    await pause(250);
    if (wiki === null) return null;
    const moved = /^#REDIRECT\s*\[\[([^\]|#]+)/i.exec(wiki);
    if (!moved) return { title, wiki };
    title = moved[1].trim();
  }
  return null;
}

/** NASA POWER's climatology at a point (2001–2025): each month's typical high, low and rain. */
async function nasa(lat: number, lon: number) {
  const t = await get(`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,T2M_RANGE,PRECTOTCORR&community=AG&longitude=${lon.toFixed(2)}&latitude=${lat.toFixed(2)}&format=JSON`);
  await pause(400);
  const p = t ? (JSON.parse(t) as { properties: { parameter: Record<string, Record<string, number>> } }).properties.parameter : null;
  if (!p) return undefined;
  const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // The day's mean ± half its average range (T2M_MAX is the month's hottest hour, not a typical day's).
  return { high: M.map((m) => Math.round(p.T2M[m] + p.T2M_RANGE[m] / 2)), low: M.map((m) => Math.round(p.T2M[m] - p.T2M_RANGE[m] / 2)), rain: M.map((m, i) => Math.round(p.PRECTOTCORR[m] * DAYS[i])) };
}

/** Where a whole region's weather is taken (its guide's position can be a rain shadow or open sea). */
const CLIMATE_AT: Record<string, [number, number]> = {
  Kerala: [9.93, 76.26], 'Sri Lanka': [6.93, 79.85], Hokkaido: [43.06, 141.35], 'Great Barrier Reef': [-16.92, 145.77],
  Tasmania: [-42.88, 147.33], Fiji: [-17.76, 177.44], 'Swiss Alps': [46.69, 7.86], Lofoten: [68.23, 14.56], Maldives: [4.18, 73.51],
};

async function places() {
  const src = readFileSync(new URL('travel-ideas.ts', LIB), 'utf8');
  const titles = [...src.matchAll(/^\s*\['([^']+)', '[A-Z]{2}'/gm)].map((m) => m[1]);
  const out: Record<string, unknown> = {};
  for (const title of titles) {
    const a = await article(title);
    if (!a) { console.log(`no guide: ${title}`); continue; }
    const g = readGuide(a.title, a.wiki);
    let climate = readClimate(a.wiki), from: string | undefined;
    // No climate chart in the guide: NASA POWER's monthly averages at its position (public domain).
    const at = CLIMATE_AT[title] ?? (g.lat !== undefined && g.lon !== undefined ? [g.lat, g.lon] : null);
    if (!climate && at) { climate = await nasa(at[0], at[1]); from = 'NASA POWER'; }
    if (!climate) console.log(`no climate: ${title}`);
    if (g.lat === undefined) console.log(`no position: ${title}`);
    out[title] = { lat: g.lat, lon: g.lon, banner: g.banner, climate, ...(climate && from ? { climateFrom: from } : {}) };
  }
  save('travel-places.json', out);
  console.log(`${Object.keys(out).length} of ${titles.length} places`);
}

async function money() {
  const read = async (indicator: string) => {
    const j = JSON.parse((await get(`https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&mrv=4&per_page=2000`))!) as [unknown, { country: { id: string }; date: string; value: number | null }[]];
    const by = new Map<string, Map<number, number>>();
    for (const r of j[1]) if (r.value !== null && /^[A-Z]{2}$/.test(r.country.id)) by.set(r.country.id, (by.get(r.country.id) ?? new Map()).set(Number(r.date), r.value));
    return by;
  };
  const latest = (m: Map<number, number>) => m.get(Math.max(...m.keys()))!;
  // Price level: what a basket of household spending costs there in dollars, against the US (PPP for
  // households ÷ the market exchange rate, from the latest year that has both).
  const ppp = await read('PA.NUS.PRVT.PP'), fx = await read('PA.NUS.FCRF');
  const countries = JSON.parse(readFileSync(new URL('travel-countries.json', LIB), 'utf8')) as Record<string, [string, string[]]>;
  const currency: Record<string, string> = { ...Object.fromEntries(Object.entries(countries).map(([cc, row]) => [cc, row[1][0]])), HK: 'HKD', PR: 'USD', PF: 'XPF' };
  const level: Record<string, number> = {}, rates: Record<string, number> = { USD: 1 };
  for (const [cc, p] of ppp) {
    const f = fx.get(cc), year = f && Math.max(...[...p.keys()].filter((y) => f.has(y)));
    if (f && year && Number.isFinite(year) && f.get(year)! > 0) level[cc] = Math.round((p.get(year)! / f.get(year)!) * 100) / 100;
  }
  for (const [cc, f] of fx) { const cur = currency[cc], v = latest(f); if (cur && /^[A-Z]{3}$/.test(cur) && !(cur in rates) && v > 0) rates[cur] = Number(v.toPrecision(5)); }
  if (fx.get('DE')) rates.EUR = Number(latest(fx.get('DE')!).toPrecision(5)); // the euro, from a euro country
  // Places the World Bank doesn't price: a guess from their neighbours (marked, so the app can say so).
  const guess: Record<string, number> = { PR: 0.85, PF: 1.1, CU: 0.4, AR: 0.6 };
  for (const [cc, v] of Object.entries(guess)) level[cc] ??= v;
  const year = Math.max(...[...fx.values()].flatMap((f) => [...f.keys()]));
  save('travel-money.json', { year, level, fx: rates, currency, guessed: Object.keys(guess) });
  console.log(`${Object.keys(level).length} price levels, ${Object.keys(rates).length} currencies (${year})`);
}

async function visa() {
  const list = JSON.parse((await get('https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Visa_requirements_by_nationality&cmlimit=500&cmtype=page&format=json'))!) as { query: { categorymembers: { title: string }[] } };
  const out: Record<string, string> = {};
  for (const { title } of list.query.categorymembers) {
    if (!/^Visa requirements for /.test(title)) continue;
    const wiki = await get(`https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}?action=raw`);
    await pause(300);
    const cc = wiki && /nationality\s*=\s*([A-Z]{2})\b/.exec(wiki)?.[1];
    if (cc && !out[cc]) out[cc] = title.replace(/^Visa requirements for /, '');
    else if (!cc) console.log(`no nationality: ${title}`);
  }
  save('travel-visa-titles.json', out);
  console.log(`${Object.keys(out).length} passports`);
}

/** zone.tab: "PT\t+3843-00908\tEurope/Lisbon": a zone's country and its main place, for the map's local time. */
function zones() {
  const deg = (s: string, w: number) => { const sign = s[0] === '-' ? -1 : 1, d = s.slice(1); return sign * (Number(d.slice(0, w)) + Number(d.slice(w, w + 2)) / 60 + (Number(d.slice(w + 2, w + 4)) || 0) / 3600); };
  const out: [string, string, number, number][] = [];
  for (const line of readFileSync('/usr/share/zoneinfo/zone.tab', 'utf8').split('\n')) {
    const [cc, at, zone] = line.split('\t');
    const m = at && /^([+-]\d{4,6})([+-]\d{5,7})$/.exec(at);
    if (!cc || cc.startsWith('#') || !m || !zone) continue;
    out.push([cc, zone.trim(), Math.round(deg(m[1], 2) * 100) / 100, Math.round(deg(m[2], 3) * 100) / 100]);
  }
  save('travel-zones.json', out);
  console.log(`${out.length} zones`);
}

const want = new Set(process.argv.slice(2));
if (want.has('--zones')) zones();
if (want.has('--money')) await money();
if (want.has('--visa')) await visa();
if (want.has('--places')) await places();
