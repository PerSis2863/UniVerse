import { CITIES } from '@/components/trace/map/cities';
import { BADGES, GREEN_KINDS, co2For, streak, weeklyChallenge, type GreenKind } from '@/lib/green';
import { URGENCIES, snap, type ReliefKind } from '@/lib/relief';

// Sample answers for the impact apps (the hub, Trace, Relief and Green) while sample mode is on, so a
// visitor's "Try the live demo" and a signed-in person's "Explore with sample data" both open full
// pages. Made up on the device from a fixed seed (the same world each time), with times relative to
// now so it always looks live. Answers have the same shape as the real routes (src/server/hub.ts,
// trace*.ts, relief.ts, green.ts).

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];
const BIG = CITIES.filter((c) => c[3] < 3);
const NAMES = ['Maya Rossi', 'Omar Haddad', 'Yuki Tanaka', 'Amara Okafor', 'Diego Silva', 'Priya Patel', 'Noah Müller', 'Fatima Khan', 'Leo Martin', 'Chen Wang', 'Zara Ahmed', 'Kofi Mensah', 'Elena Novak', 'Ravi Iyer', 'Hana Kim', 'Lina Larsen'];
const person = (r: () => number) => { const name = pick(r, NAMES); return { id: `sample-${name.split(' ')[0].toLowerCase()}`, name }; };
const CC: Record<string, string> = { London: 'GB', Paris: 'FR', Berlin: 'DE', Madrid: 'ES', Rome: 'IT', Istanbul: 'TR', Mumbai: 'IN', Delhi: 'IN', Tokyo: 'JP', 'New York': 'US', 'São Paulo': 'BR', Lagos: 'NG', Dubai: 'AE', Sydney: 'AU', Toronto: 'CA', Singapore: 'SG' };
const placeOf = (c: (typeof CITIES)[number]) => (CC[c[0]] ? `${c[0]}, ${CC[c[0]]}` : c[0]);

/** GET /hub */
export function sampleHub(me: { id: string }) {
  void me;
  return {
    apps: {
      campus: { value: 1240, label: 'courses running', mine: { value: 5, label: 'courses' } },
      trace: { value: 48_210, label: 'products checked', mine: { value: 1860, label: 'points earned' } },
      relief: { value: 3_904, label: 'people helped', mine: { value: 23, label: 'people helped' } },
      green: { value: 182_450, label: 'kg CO₂ saved', mine: { value: 312, label: 'kg CO₂ saved' } },
    },
    total: { people: 12_480 },
  };
}

// ---------- Relief ----------

const NEEDS: [ReliefKind, string][] = [['FOOD', 'Food for a family of'], ['WATER', 'Drinking water for'], ['SHELTER', 'Shelter tonight for'], ['MEDICAL', 'Insulin and a ride to the clinic for'], ['CLOTHES', 'Warm clothes for'], ['TRANSPORT', 'A van to move supplies for'], ['FOOD', 'Baby formula for']];
const OFFERS: [ReliefKind, string][] = [['TRANSPORT', 'I can drive supplies on weekends'], ['SHELTER', 'Spare room for two nights'], ['FOOD', 'Hot meals every evening'], ['WATER', '40 L of water every day'], ['MEDICAL', 'First aid, I’m a nurse'], ['CLOTHES', 'Winter coats to give away']];

function reliefPosts(me: { id: string; name: string }) {
  const r = rng(7), now = Date.now();
  return Array.from({ length: 140 }, (_, i) => {
    const c = pick(r, BIG), need = r() < 0.72, people = 1 + Math.floor(r() * 10), at = now - Math.pow(r(), 1.4) * 25 * DAY;
    const status = need ? pick(r, ['OPEN', 'OPEN', 'OPEN', 'TAKEN', 'DONE', 'DONE']) : 'OPEN';
    const what = pick(r, need ? NEEDS : OFFERS);
    const mine = i % 37 === 3, helping = !mine && status !== 'OPEN' && i % 29 === 5;
    const by = mine ? { id: me.id, name: me.name } : person(r);
    const helper = status === 'OPEN' ? null : helping ? { id: me.id, name: me.name } : person(r);
    return {
      id: `sample-relief-${i}`, type: need ? 'NEED' : 'OFFER', kind: what[0], title: need ? `${what[1]} ${people}` : what[1],
      details: r() < 0.4 ? 'Near the main square. Any time after 5 pm works.' : null, people, urgency: need ? pick(r, URGENCIES) : 'LOW',
      lat: snap(c[1] + (r() - 0.5) * 0.3), lng: snap(c[2] + (r() - 0.5) * 0.3), place: c[0], status, createdAt: iso(at),
      takenAt: helper ? iso(at + 3_600_000) : null, doneAt: status === 'DONE' ? iso(Math.min(now, at + (2 + r() * 20) * 3_600_000)) : null,
      by, helper, mine, helping,
    };
  });
}

/** GET /relief/map */
export function sampleReliefMap(me: { id: string; name: string }) {
  const all = reliefPosts(me), open = all.filter((p) => p.status !== 'DONE'), done = all.filter((p) => p.status === 'DONE');
  const needs = open.filter((p) => p.type === 'NEED');
  return {
    posts: open, recent: done.slice(0, 20), done: done.map((p) => ({ lat: p.lat, lng: p.lng, people: p.people, kind: p.kind })),
    stats: {
      openNeeds: needs.filter((p) => p.status === 'OPEN').length, inProgress: needs.filter((p) => p.status === 'TAKEN').length,
      offers: open.filter((p) => p.type === 'OFFER').length, peopleWaiting: needs.reduce((a, p) => a + p.people, 0),
      helped: done.reduce((a, p) => a + p.people, 0), avgMinutes: 214, helpers: 61,
    },
  };
}

/** GET /relief/mine */
export function sampleReliefMine(me: { id: string; name: string }) {
  const all = reliefPosts(me), helping = all.filter((p) => p.helping);
  return { mine: all.filter((p) => p.mine), helping, helped: helping.filter((p) => p.status === 'DONE').reduce((a, p) => a + p.people, 0) };
}

// ---------- Green ----------

const AMT: Record<GreenKind, [number, number]> = { TREE: [1, 4], CYCLE: [3, 25], TRANSIT: [5, 40], WALK: [1, 6], RECYCLE: [1, 8], SOLAR: [5, 30], MEATFREE: [1, 3], CLEANUP: [1, 6] };

function myActions(me: { id: string }) {
  const r = rng(9), now = Date.now(), home = BIG[3];
  return Array.from({ length: 64 }, (_, i) => {
    const kind = pick(r, GREEN_KINDS), [lo, hi] = AMT[kind], amount = Math.round((lo + r() * (hi - lo)) * 10) / 10;
    // Every one of the last six days has one, so the streak shows.
    const at = i < 6 ? now - i * DAY - 3_600_000 * (1 + r() * 6) : now - (6 + r() * 54) * DAY;
    return { id: `sample-green-${i}`, userId: me.id, kind, amount, co2Kg: co2For(kind, amount), note: r() < 0.2 ? 'With the team' : null, lat: Math.round(home[1] * 10) / 10, lng: Math.round(home[2] * 10) / 10, place: home[0], createdAt: iso(at) };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** GET /green/me */
export function sampleGreenMe(me: { id: string }) {
  const now = Date.now(), actions = myActions(me), challenge = weeklyChallenge(now);
  const byKind: Partial<Record<GreenKind, number>> = {}, kgByKind: Partial<Record<GreenKind, number>> = {};
  for (const a of actions) { byKind[a.kind] = (byKind[a.kind] ?? 0) + a.amount; kgByKind[a.kind] = (kgByKind[a.kind] ?? 0) + a.co2Kg; }
  const kg = actions.reduce((s, a) => s + a.co2Kg, 0);
  const totals = { actions: actions.length, kg, byKind, streak: streak(actions.map((a) => a.createdAt.slice(0, 10)), iso(now).slice(0, 10)) };
  const week = Date.parse(challenge.starts);
  const mine = actions.filter((a) => a.kind === challenge.kind && Date.parse(a.createdAt) >= week).reduce((s, a) => s + a.amount, 0);
  return {
    totals: { ...totals, kg: Math.round(kg * 10) / 10, kgByKind },
    badges: BADGES.map((b) => ({ id: b.id, label: b.label, text: b.text, earned: b.earned(totals) })),
    challenge: { ...challenge, mine: Math.round(mine * 10) / 10, team: Math.round((mine * 7.4 + 12) * 10) / 10 },
    perDay: Array.from({ length: 30 }, (_, i) => {
      const d = iso(now - (29 - i) * DAY).slice(0, 10);
      return { day: d, kg: Math.round(actions.filter((a) => a.createdAt.startsWith(d)).reduce((s, a) => s + a.co2Kg, 0) * 10) / 10 };
    }),
    recent: actions.slice(0, 30), teams: 2,
    community: { kg: 182_450, actions: 41_236, people: 2_904 },
  };
}

const TEAMS = ['Class 10B', 'Riverside Cycling Club', 'Marketing team', 'Green Ward 12', 'Engineering', 'Eco Warriors', 'Sunrise School', 'Climate Crew', 'Plant Parents', 'Zero Waste Hub', 'Office Bikers', 'Ocean Savers'];

/** GET /green/teams */
export function sampleGreenTeams(me: { id: string; name: string }) {
  const r = rng(10);
  const board = TEAMS.map((name, i) => ({ id: `sample-team-${i}`, name, members: 4 + Math.floor(r() * 26), kg: Math.round((2400 - i * 170) * (0.85 + r() * 0.3) * 10) / 10, actions: 60 + Math.floor(r() * 400) }))
    .sort((a, b) => b.kg - a.kg).map((t, i) => ({ ...t, rank: i + 1, mine: t.id === 'sample-team-1' || t.id === 'sample-team-4' }));
  const team = (id: string, owner: boolean) => {
    const t = board.find((b) => b.id === id)!;
    const members = [{ id: me.id, name: me.name, kg: 312.4, me: true }, ...NAMES.slice(0, 6).map((n, i) => ({ id: `sample-m-${id}-${i}`, name: n, kg: Math.round((420 - i * 55) * 10) / 10, me: false }))].sort((a, b) => b.kg - a.kg);
    return { id, name: t.name, code: owner ? 'GRN4KQ' : 'RVR7TX', owner, members, kg: Math.round(members.reduce((s, m) => s + m.kg, 0) * 10) / 10 };
  };
  return {
    mine: [team('sample-team-1', false), team('sample-team-4', true)],
    leaderboard: board,
    people: NAMES.slice(0, 10).map((name, i) => ({ rank: i + 1, name, kg: Math.round((640 - i * 48) * 10) / 10, actions: 90 - i * 6, me: false })),
  };
}

/** GET /green/map */
export function sampleGreenMap() {
  const r = rng(11);
  return { cells: BIG.flatMap((c) => Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({ lat: Math.round((c[1] + (r() - 0.5) * 0.6) * 10) / 10, lng: Math.round((c[2] + (r() - 0.5) * 0.6) * 10) / 10, kg: Math.round(20 + r() * 900), actions: 3 + Math.floor(r() * 120), place: c[0] }))) };
}

// ---------- Trace ----------

const BRAND = { id: 'sample-brand', name: 'Aurora Foods', slug: 'aurora-foods', category: 'food', color: '#ec4899', logoUrl: null, plan: 'PRO', pointValue: 0.01, currency: 'EUR', minCashout: 500 };
const PRODUCTS = [
  { id: 'sample-p1', name: 'Aurora Olive Oil, 1 L', category: 'food', origin: BIG.find((c) => c[0] === 'Madrid') ?? BIG[0] },
  { id: 'sample-p2', name: 'Aurora Saffron, 2 g', category: 'food', origin: BIG.find((c) => c[0] === 'Mumbai') ?? BIG[1] },
  { id: 'sample-p3', name: 'Aurora Honey, 500 g', category: 'food', origin: BIG.find((c) => c[0] === 'Rome') ?? BIG[2] },
];
const MARKETS = BIG.filter((_, i) => i % 3 === 0).slice(0, 40);

interface SampleScan { id: string; at: number; city: (typeof CITIES)[number]; lat: number; lng: number; verdict: 'FIRST' | 'SEEN' | 'SUSPECT'; product: number; serial: number; batch: number }
function scans(): SampleScan[] {
  const r = rng(12), now = Date.now();
  return Array.from({ length: 2400 }, (_, i): SampleScan => {
    const city = pick(r, MARKETS), roll = r();
    return { id: `sample-scan-${i}`, at: now - Math.pow(r(), 1.3) * 90 * DAY, city, lat: city[1] + (r() - 0.5) * 0.2, lng: city[2] + (r() - 0.5) * 0.2, verdict: roll < 0.035 ? 'SUSPECT' : roll < 0.8 ? 'FIRST' : 'SEEN', product: Math.floor(r() * 3), serial: Math.floor(r() * 5000), batch: Math.floor(r() * 2) };
  }).sort((a, b) => b.at - a.at);
}
const codeLabel = (s: SampleScan) => `AURORA-${String(s.serial).padStart(4, '0')}-${s.id.slice(-3).toUpperCase()}`;

function batches(p: number) {
  const now = Date.now(), prod = PRODUCTS[p];
  return [0, 1].map((n) => {
    const status = n === 0 ? 'DELIVERED' : p === 0 ? 'IN_TRANSIT' : p === 1 ? 'SHIPPED' : 'MADE';
    const dest = BIG[(p * 7 + 11) % BIG.length];
    return { id: `sample-b${p}${n}`, label: `Batch 2026-${p + 1}${n}`, quantity: 5000, origin: prod.origin[0], madeAt: iso(now - (50 - n * 30) * DAY), createdAt: iso(now - (50 - n * 30) * DAY), status, destPlace: status === 'IN_TRANSIT' ? dest[0] : null, carrierKey: status === 'IN_TRANSIT' ? 'SAMPLE' : null, dest };
  });
}

/** GET /trace/brand */
export const sampleTraceBrand = () => ({ brand: BRAND, pro: true, units: 30_000, unitLimit: 1_000_000 });

/** GET /trace/products */
export const sampleTraceProducts = () => PRODUCTS.map((p, i) => ({
  id: p.id, name: p.name, sku: `AUR-${100 + i}`, category: p.category, description: `Made by Aurora Foods near ${p.origin[0]}.`, story: 'Picked by hand and packed the same day.',
  rewardPoints: 25, warrantyMonths: 0, sample: true, batches: batches(i).map(({ dest, ...b }) => { void dest; return b; }), _count: { codes: 6_800 + i * 1_300 },
}));

/** GET /trace/overview?days= */
export function sampleTraceOverview(days: number) {
  const now = Date.now(), all = scans(), since = now - days * DAY, list = all.filter((s) => s.at >= since);
  const perDay = (v?: string) => Array.from({ length: days }, (_, i) => list.filter((s) => Math.floor((now - s.at) / DAY) === days - 1 - i && (!v || s.verdict === v)).length);
  const places = new Map<string, number>();
  for (const s of list) { const k = placeOf(s.city); places.set(k, (places.get(k) ?? 0) + 1); }
  const code = (s: SampleScan) => ({ id: s.id, label: codeLabel(s), serial: s.serial, product: { name: PRODUCTS[s.product].name }, batch: { label: `Batch 2026-${s.product + 1}${s.batch}` } });
  return {
    days, products: 3, batches: 6, units: 30_000, scanned: 18_412, claimed: 6_204, points: 155_100,
    scans: perDay(), suspect: perDay('SUSPECT'), first: list.filter((s) => s.verdict === 'FIRST').length, seen: list.filter((s) => s.verdict === 'SEEN').length, suspects: list.filter((s) => s.verdict === 'SUSPECT').length,
    places: [...places].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([place, n]) => ({ place, scans: n })),
    recent: list.slice(0, 12).map((s) => ({ id: s.id, verdict: s.verdict, place: placeOf(s.city), createdAt: iso(s.at), code: code(s) })),
    suspectList: list.filter((s) => s.verdict === 'SUSPECT').slice(0, 8).map((s) => ({ id: s.id, place: placeOf(s.city), createdAt: iso(s.at), code: { id: s.id, label: codeLabel(s), status: 'ACTIVE', firstPlace: placeOf(MARKETS[(s.serial + 5) % MARKETS.length]), scanCount: 2 + (s.serial % 3), product: { name: PRODUCTS[s.product].name } } })),
    campaigns: { active: 2, scans: 412, fees: 20.6 }, pendingCashouts: 3, currency: 'EUR',
  };
}

/** GET /trace/map/market?days=&product= */
export function sampleTraceMarket(daysRaw: number, product: string | null) {
  const days = Math.min(90, Math.max(1, Math.round(daysRaw) || 30)), now = Date.now(), start = now - days * DAY;
  const bh = days <= 1 ? 1 : days <= 7 ? 3 : days <= 30 ? 12 : 24, bins = Math.ceil((days * 24) / bh);
  const pIndex = product ? PRODUCTS.findIndex((p) => p.id === product) : -1;
  const list = scans().filter((s) => s.at >= start && (pIndex < 0 || s.product === pIndex));
  const key = (s: SampleScan) => `${Math.round(s.lat * 10) / 10},${Math.round(s.lng * 10) / 10}`;
  const cellMap = new Map<string, { lat: number; lng: number; scans: number; suspect: number; first: number; place: string; country: string | null; last: string; products: Record<string, number> }>();
  for (const s of list) {
    const k = key(s);
    let c = cellMap.get(k);
    if (!c) { c = { lat: Math.round(s.lat * 10) / 10, lng: Math.round(s.lng * 10) / 10, scans: 0, suspect: 0, first: 0, place: placeOf(s.city), country: CC[s.city[0]] ?? null, last: iso(s.at), products: {} }; cellMap.set(k, c); }
    c.scans++; if (s.verdict === 'SUSPECT') c.suspect++; if (s.verdict === 'FIRST') c.first++;
    c.products[PRODUCTS[s.product].id] = (c.products[PRODUCTS[s.product].id] ?? 0) + 1;
  }
  const cells = [...cellMap.values()].sort((a, b) => b.scans - a.scans);
  const index = new Map(cells.map((c, i) => [`${c.lat},${c.lng}`, i]));
  const timeline: [number, number][] = Array.from({ length: bins }, () => [0, 0]);
  const events: [number, number, number, number][] = [];
  for (const s of [...list].reverse()) {
    const b = Math.floor((s.at - start) / (bh * 3_600_000)), c = index.get(key(s));
    if (c === undefined || b < 0 || b >= bins) continue;
    timeline[b][0]++; if (s.verdict === 'SUSPECT') timeline[b][1]++;
    events.push([c, b, s.verdict === 'SUSPECT' ? 2 : s.verdict === 'FIRST' ? 1 : 0, s.product]);
  }
  const r = rng(13);
  const marketCells = [...cells.slice(0, 60).map((c) => ({ lat: c.lat, lng: c.lng, total: Math.round(c.scans * (2 + r() * 4)), yours: c.scans, place: c.place })),
    ...BIG.filter((_, i) => i % 3 === 1).slice(0, 14).map((c) => ({ lat: Math.round(c[1] * 10) / 10, lng: Math.round(c[2] * 10) / 10, total: 40 + Math.floor(r() * 400), yours: 0, place: placeOf(c) }))];
  const total = marketCells.reduce((a, c) => a + c.total, 0), yours = marketCells.reduce((a, c) => a + c.yours, 0);
  return {
    days, bucketHours: bh, bins, start: iso(start), now: iso(now),
    brand: { name: BRAND.name, color: BRAND.color, category: BRAND.category },
    products: PRODUCTS.map((p) => ({ id: p.id, name: p.name })),
    cells, timeline, events: events.reverse(), sample: true,
    origins: PRODUCTS.map((p) => ({ lat: Math.round(p.origin[1] * 10) / 10, lng: Math.round(p.origin[2] * 10) / 10, place: p.origin[0] })),
    market: { locked: false, category: 'food', cells: marketCells, total, yours, sample: true,
      opportunities: marketCells.filter((c) => c.total > 0).map((c) => ({ ...c, share: c.yours / c.total })).sort((a, b) => a.share - b.share || b.total - a.total).slice(0, 8) },
  };
}

/** GET /trace/map/live?since=: a scan every few seconds somewhere in the brand's markets. */
export function sampleTraceLive() {
  const now = Date.now(), r = rng(Math.floor(now / 6000));
  const n = r() < 0.7 ? 1 : 2;
  return { now: iso(now), scans: Array.from({ length: n }, (_, i) => { const c = pick(r, MARKETS); return { id: `sample-live-${Math.floor(now / 6000)}-${i}`, lat: c[1] + (r() - 0.5) * 0.2, lng: c[2] + (r() - 0.5) * 0.2, verdict: r() < 0.05 ? 'SUSPECT' : 'FIRST', productId: pick(r, PRODUCTS).id, place: placeOf(c), at: iso(now - i * 1500), sample: true }; }) };
}

/** GET /trace/map/tracking: one batch on the road that moves along its route, the rest at their stops. */
export function sampleTraceTracking() {
  const now = Date.now();
  const shipments = PRODUCTS.flatMap((p, pi) => batches(pi).map((b) => {
    const o = p.origin, port = { lat: o[1] + 0.3, lng: o[2] + 0.3 };
    const stops = [{ stage: 'MADE', place: o[0], lat: o[1], lng: o[2], at: b.madeAt! }, ...(b.status !== 'MADE' ? [{ stage: 'SHIPPED', place: `Port near ${o[0]}`, ...port, at: iso(Date.parse(b.madeAt!) + 3 * DAY) }] : []),
      ...(b.status === 'DELIVERED' ? [{ stage: 'DELIVERED', place: b.dest[0], lat: b.dest[1], lng: b.dest[2], at: iso(Date.parse(b.madeAt!) + 12 * DAY) }] : [])];
    const dest = b.status === 'IN_TRANSIT' ? { lat: b.dest[1], lng: b.dest[2], place: b.dest[0] } : null;
    let trail: { lat: number; lng: number; at: string; speed: number | null }[] = [];
    if (dest) {
      const period = 40 * 60_000, from = stops[stops.length - 1];
      trail = Array.from({ length: 30 }, (_, i) => {
        const at = now - (29 - i) * 20_000, t = (at % period) / period;
        return { lat: from.lat + (dest.lat - from.lat) * t, lng: from.lng + (dest.lng - from.lng) * t, at: iso(at), speed: 78 + 6 * Math.sin(at / 60_000) };
      });
    }
    const last = trail[trail.length - 1] ?? null, here = last ?? stops[stops.length - 1];
    const prev = trail[trail.length - 2];
    const kmLeft = dest ? Math.round(Math.hypot((dest.lat - here.lat) * 111, (dest.lng - here.lng) * 111 * Math.cos((here.lat * Math.PI) / 180)) * 10) / 10 : null;
    return {
      id: b.id, label: b.label, status: b.status, quantity: b.quantity, product: p.name, productId: p.id, sample: true, simulated: !!dest,
      stops, dest, trail, position: { lat: here.lat, lng: here.lng },
      heading: prev && last ? (Math.atan2(last.lng - prev.lng, last.lat - prev.lat) * 180) / Math.PI : null,
      speedKmh: last?.speed ?? null, lastPingAt: last?.at ?? null, carrierPath: dest ? '/carry/SAMPLE' : null,
      kmLeft, etaMinutes: kmLeft !== null ? Math.round((kmLeft / 80) * 60) : null,
      // The olive oil rides in a cooled truck with a Bluetooth thermometer: a warm spell an hour ago.
      ...(pi === 0 ? { maxTempC: 8, sensor: 'BLE', temps: Array.from({ length: 48 }, (_, i) => Math.round((5.2 + Math.sin(i / 5) * 0.8 + (i > 30 && i < 36 ? 3.4 : 0)) * 10) / 10), tempC: 5.6, tempAt: iso(now - 60_000), breaches: 4 } : {}),
    };
  }));
  return { now: iso(now), shipments };
}

/** GET /trace/campaigns */
export function sampleTraceCampaigns() {
  const now = Date.now();
  return [
    { id: 'sample-c1', title: 'Paris launch: +40 points per sale', productId: 'sample-p1', bonusPoints: 40, budgetPoints: 30_000, spentPoints: 9_840, scans: 246, feeCents: 5, status: 'ACTIVE', country: null, lat: 48.86, lng: 2.35, radiusKm: 30, place: 'Paris (30 km)', endsAt: iso(now + 12 * DAY), createdAt: iso(now - 9 * DAY) },
    { id: 'sample-c2', title: 'Mumbai shops: +60 points', productId: 'sample-p2', bonusPoints: 60, budgetPoints: 20_000, spentPoints: 9_960, scans: 166, feeCents: 5, status: 'ACTIVE', country: null, lat: 19.08, lng: 72.88, radiusKm: 25, place: 'Mumbai (25 km)', endsAt: null, createdAt: iso(now - 4 * DAY) },
    { id: 'sample-c3', title: 'Summer in Rome', productId: null, bonusPoints: 25, budgetPoints: 10_000, spentPoints: 10_000, scans: 400, feeCents: 5, status: 'ENDED', country: null, lat: 41.9, lng: 12.5, radiusKm: 20, place: 'Rome (20 km)', endsAt: iso(now - 20 * DAY), createdAt: iso(now - 50 * DAY) },
  ];
}

/** GET /trace/cashouts */
export function sampleTraceCashouts() {
  const now = Date.now();
  return [
    { id: 'sample-co1', points: 800, amount: 8, currency: 'EUR', payTo: 'maya@upi', status: 'PENDING', note: null, createdAt: iso(now - 0.3 * DAY), user: { name: 'Maya Rossi', email: 'maya@example.com' } },
    { id: 'sample-co2', points: 1200, amount: 12, currency: 'EUR', payTo: 'FR76 3000 6000 0112 3456 7890 189', status: 'PENDING', note: null, createdAt: iso(now - 1.2 * DAY), user: { name: 'Omar Haddad', email: 'omar@example.com' } },
    { id: 'sample-co3', points: 600, amount: 6, currency: 'EUR', payTo: 'priya@upi', status: 'PENDING', note: null, createdAt: iso(now - 2 * DAY), user: { name: 'Priya Patel', email: 'priya@example.com' } },
    { id: 'sample-co4', points: 2000, amount: 20, currency: 'EUR', payTo: 'leo@paypal', status: 'PAID', note: 'Paid by bank transfer', createdAt: iso(now - 9 * DAY), user: { name: 'Leo Martin', email: 'leo@example.com' } },
  ];
}

/** GET /trace/wallet */
export function sampleTraceWallet() {
  const now = Date.now(), r = rng(14);
  const brands = [
    { id: 'sample-brand', name: 'Aurora Foods', color: '#ec4899', logoUrl: null, pointValue: 0.01, currency: 'EUR', minCashout: 500 },
    { id: 'sample-brand-2', name: 'TerraBrew Coffee', color: '#a16207', logoUrl: null, pointValue: 0.01, currency: 'EUR', minCashout: 500 },
    { id: 'sample-brand-3', name: 'Kaveri Spices', color: '#f59e0b', logoUrl: null, pointValue: 0.008, currency: 'EUR', minCashout: 400 },
  ];
  const balances = [{ brand: brands[0], points: 1240 }, { brand: brands[1], points: 465 }, { brand: brands[2], points: 155 }];
  return {
    total: 1860, worth: { EUR: 18.29 }, verified: true, balances,
    history: Array.from({ length: 24 }, (_, i) => { const b = pick(r, brands); return { id: `sample-pt-${i}`, brandId: b.id, kind: i % 9 === 4 ? 'BONUS' : 'SCAN', points: 25 + Math.floor(r() * 40), note: i % 9 === 4 ? 'Campaign bonus' : 'Sold and scanned', createdAt: iso(now - i * 0.7 * DAY), brand: b.name }; }),
    cashouts: [{ id: 'sample-wc1', points: 600, amount: 6, currency: 'EUR', status: 'PAID', note: null, createdAt: iso(now - 12 * DAY), brand: 'Aurora Foods' }],
    offers: [
      { id: 'sample-o1', title: 'Paris launch: +40 points per sale', bonusPoints: 40, left: 20_160, area: 'Paris (30 km)', endsAt: iso(now + 12 * DAY), brand: 'Aurora Foods', color: '#ec4899', product: 'Aurora Olive Oil, 1 L' },
      { id: 'sample-o2', title: 'Double points on cold brew', bonusPoints: 30, left: 4_500, area: 'Everywhere', endsAt: null, brand: 'TerraBrew Coffee', color: '#a16207', product: null },
    ],
  };
}

/** GET /trace/radar */
export function sampleTraceRadar() {
  const all = scans(), now = Date.now();
  const row = (s: SampleScan) => ({ id: s.id, code: codeLabel(s).replace(/-/g, ''), place: placeOf(s.city), country: CC[s.city[0]] ?? null, at: iso(s.at), product: PRODUCTS[s.product].name });
  const suspect = all.filter((s) => s.verdict === 'SUSPECT' && s.at > now - 30 * DAY).slice(0, 20).map(row);
  const diverted = all.filter((s) => s.product === 1 && !['Mumbai', 'Delhi'].includes(s.city[0]) && s.at > now - 30 * DAY).slice(0, 9).map(row);
  return {
    counts: { suspect: suspect.length, diverted: diverted.length, blocked: 1, recalls: 1, flagged: 4, cold: 1 },
    suspect, diverted,
    blocked: [{ id: 'sample-b21', label: 'Batch 2026-31', product: PRODUCTS[2].name, at: iso(now - 6 * DAY) }],
    recalls: [
      { id: 'sample-r1', batchId: 'sample-b10', batch: 'Batch 2026-10', product: PRODUCTS[0].name, reason: 'Some caps may not seal fully', advice: 'Return it to the shop for a new bottle.', severity: 'HIGH', status: 'ACTIVE', at: iso(now - 2 * DAY), endedAt: null },
      { id: 'sample-r2', batchId: 'sample-b20', batch: 'Batch 2026-20', product: PRODUCTS[2].name, reason: 'Wrong best-before date on the label', advice: null, severity: 'MEDIUM', status: 'ENDED', at: iso(now - 40 * DAY), endedAt: iso(now - 33 * DAY) },
    ],
    cold: [{ batchId: 'sample-b01', label: 'Batch 2026-11', product: PRODUCTS[0].name, maxT: 11.4, limit: 8, readings: 6, last: iso(now - 3_600_000) }],
  };
}

/** GET /trace/insights */
export function sampleTraceInsights() {
  const now = Date.now(), all = scans(), r = rng(15);
  const days = Array.from({ length: 60 }, (_, i) => iso(now - (59 - i) * DAY).slice(0, 10));
  const series = days.map((d) => all.filter((s) => iso(s.at).startsWith(d)).length);
  const heat = Array.from({ length: 7 }, (_, wd) => Array.from({ length: 24 }, (_, h) => Math.round(Math.max(0, Math.sin(((h - 7) / 15) * Math.PI)) * (wd === 0 || wd === 6 ? 22 : 14) * (0.7 + r() * 0.6))));
  const best = heat.flatMap((row, wd) => row.map((n, h) => ({ wd, h, n }))).sort((a, b) => b.n - a.n).slice(0, 3);
  // A simple weekly-shaped forecast, like the real one (src/lib/trace.ts forecast).
  const avg = series.slice(-7).reduce((a, b) => a + b, 0) / 7;
  const values = Array.from({ length: 14 }, (_, i) => Math.round((avg * 1.06 + Math.sin((i + 2) / 7 * 2 * Math.PI) * avg * 0.18) * 10) / 10);
  const stars = [6, 9, 31, 118, 296];
  const TEXTS = ['You can taste the difference.', 'Good to know it’s the real one.', 'Lovely gift, the story on the passport is a nice touch.', 'Bottle could pour better.', 'My go-to oil now.', 'Arrived well packed.'];
  return {
    forecast: { days, series, next: { values, band: values.map((_, i) => Math.round(avg * 0.22 * Math.sqrt(1 + i / 7) * 10) / 10) } },
    heat, best,
    carbon: { kg: 1_284.6, batches: PRODUCTS.flatMap((p, pi) => [0, 1].map((n) => ({ id: `sample-b${pi}${n}`, label: `Batch 2026-${pi + 1}${n}`, product: p.name, stops: 3 + n, km: 1400 + pi * 2300 + n * 400, kg: 180 + pi * 260 + n * 40, perUnitG: Math.round((36 + pi * 52 + n * 8) * 10) / 10 }))) },
    reviews: { avg: 4.5, count: stars.reduce((a, b) => a + b, 0), stars, recent: Array.from({ length: 8 }, (_, i) => ({ id: `sample-rv-${i}`, stars: i % 4 === 3 ? 4 : 5, text: TEXTS[i % TEXTS.length], place: placeOf(pick(r, MARKETS)), createdAt: iso(now - i * 1.3 * DAY), product: PRODUCTS[i % 3].name })) },
    shops: NAMES.slice(0, 10).map((n, i) => { const sales = [164, 121, 88, 61, 44, 32, 21, 17, 9, 6][i]; return { rank: i + 1, name: `${n.split(' ')[0]}’s Market`, sales, tier: sales >= 100 ? { label: 'Gold', multiplier: 1.5, next: null } : sales >= 20 ? { label: 'Silver', multiplier: 1.25, next: { label: 'Gold', need: 100 - sales } } : { label: 'Bronze', multiplier: 1, next: { label: 'Silver', need: 20 - sales } } }; }),
    wins: { total: 41, redeemed: 33, list: [] },
    warranties: { total: 0, active: 0 },
    trust: { score: 94, genuinePct: 96.8 },
  };
}

/** GET /trace/vault */
export function sampleTraceVault() {
  const now = Date.now();
  return [
    { id: 'sample-v1', code: 'AURORA00042K7QX', since: iso(now - 40 * DAY), owners: 1, product: { id: 'sample-p1', name: 'Aurora Olive Oil, 1 L', imageUrl: null, category: 'food' }, brand: { id: 'sample-brand', name: 'Aurora Foods', color: '#ec4899', slug: 'aurora-foods' }, warrantyEnds: null, transfer: null },
    { id: 'sample-v2', code: 'ZENITH0911PQ4M', since: iso(now - 120 * DAY), owners: 2, product: { id: 'sample-w', name: 'Zenith Diver 300', imageUrl: null, category: 'watches' }, brand: { id: 'sample-zenith', name: 'Zenith Watches', color: '#94a3b8', slug: 'zenith-watches' }, warrantyEnds: iso(now + 600 * DAY), transfer: { code: 'K7Q2XM4P', until: iso(now + 5 * DAY) } },
  ];
}
