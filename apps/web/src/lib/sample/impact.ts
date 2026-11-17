import { ahead, type AirTraffic, type Plane } from '@/lib/aircraft';
import { CITIES } from '@/components/trace/map/cities';
import { BADGES, FEELINGS, GREEN_FACTORS, GREEN_KINDS, co2For, easiestKind, streak, weeklyChallenge, type GreenKind } from '@/lib/green';
import { newest, weekly, type WalletEvent } from '@/lib/impact-wallet';
import { URGENCIES, demoAid, snap, type AidStep, type ReliefKind } from '@/lib/relief';
import { GAMES, GAME_IDS, isGame, type GameId } from '@/lib/play';

// Sample answers for the impact apps (the hub, Trace, Relief and Green) while sample mode is on, so a
// signed-in person's "Explore with sample data" opens full pages. Made up on the device from a fixed seed (the same world each time), with times relative to
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
      travel: { value: 3_912, label: 'places saved', mine: { value: 12, label: 'places saved' } },
    },
    total: { people: 12_480 },
  };
}

/** GET /hub/wallet */
export function sampleWallet(me: { id: string }) {
  const now = Date.now(), r = rng(21), actions = myActions(me);
  const brands = ['Aurora Foods', 'TerraBrew Coffee', 'Kaveri Spices'];
  const at = (i: number, step: number) => now - (i * step + r()) * DAY;
  const credits = Array.from({ length: 8 }, (_, i) => ({ at: at(i, 9), v: [20, 15, 30, 10][i % 4], text: ['Volunteered at the food bank', 'Tutored first-years', 'Beach clean-up with the eco club', 'Peer mentoring'][i % 4] }));
  const pts = Array.from({ length: 20 }, (_, i) => ({ at: at(i, 3), v: 25 + Math.floor(r() * 40), brand: brands[i % 3] }));
  const helped = Array.from({ length: 7 }, (_, i) => ({ at: at(i, 11), v: 1 + Math.floor(r() * 5), text: ['Hot meals for a family', 'A lift to the clinic', 'Drinking water for 4', 'Warm clothes for 2'][i % 4] }));
  const kg = actions.reduce((s, a) => s + a.co2Kg, 0);
  const totals = { actions: actions.length, kg, byKind: {}, streak: 6 };
  const events: WalletEvent[] = [
    ...credits.map((c) => ({ app: 'campus' as const, at: iso(c.at), text: c.text, amount: `+${c.v} impact pts` })),
    ...pts.map((p) => ({ app: 'trace' as const, at: iso(p.at), text: `Scanned · ${p.brand}`, amount: `+${p.v} pts` })),
    ...helped.map((h) => ({ app: 'relief' as const, at: iso(h.at), text: `Delivered: ${h.text}`, amount: `${h.v} helped` })),
    ...actions.slice(0, 30).map((a) => ({ app: 'green' as const, at: a.createdAt, text: GREEN_FACTORS[a.kind].label, amount: `${Math.round(a.co2Kg * 10) / 10} kg CO₂` })),
  ];
  return {
    campus: { points: 145, courses: 5, weeks: weekly(credits, now) },
    trace: { points: 1860, brands: 3, worth: [{ currency: 'EUR', amount: 18.29 }], weeks: weekly(pts, now) },
    relief: { people: 23, deliveries: 9, received: 1, weeks: weekly(helped, now) },
    green: { kg: Math.round(kg * 10) / 10, actions: actions.length, streak: 6, badges: BADGES.filter((b) => b.earned(totals)).length, badgesOf: BADGES.length, weeks: weekly(actions.map((a) => ({ at: Date.parse(a.createdAt), v: a.co2Kg })), now) },
    events: newest(events),
  };
}

// ---------- Relief ----------

const NEEDS: [ReliefKind, string][] = [['FOOD', 'Food for a family of'], ['WATER', 'Drinking water for'], ['SHELTER', 'Shelter tonight for'], ['MEDICAL', 'Insulin and a ride to the clinic for'], ['CLOTHES', 'Warm clothes for'], ['TRANSPORT', 'A van to move supplies for'], ['FOOD', 'Baby formula for']];
const OFFERS: [ReliefKind, string][] = [['TRANSPORT', 'I can drive supplies on weekends'], ['SHELTER', 'Spare room for two nights'], ['FOOD', 'Hot meals every evening'], ['WATER', '40 L of water every day'], ['MEDICAL', 'First aid, I’m a nurse'], ['CLOTHES', 'Winter coats to give away']];

/** M148: the shelter board: a few places in the sample's big cities that said how they are. */
export function sampleReliefPlaces() {
  const now = Date.now();
  const KINDS = ['SHELTER', 'FOOD_BANK', 'NGO', 'SHELTER', 'COMMUNITY', 'SHELTER'];
  const NAMES = ['Harbour Night Shelter', 'Eastside Food Bank', 'Red Door Relief', 'St Anne’s Hall', 'Neighbours United', 'Riverside Sports Centre'];
  return {
    places: BIG.slice(0, 6).map((c, i) => ({
      id: `sample-place-${i}`, name: NAMES[i], kind: KINDS[i], place: c[0], lat: c[1] + 0.01 * i, lng: c[2] - 0.01 * i,
      openNow: i !== 3, bedsFree: KINDS[i] === 'SHELTER' ? [12, 0, 31][i % 3] : null, bedsTotal: KINDS[i] === 'SHELTER' ? [40, 25, 120][i % 3] : null,
      water: (['YES', 'LOW', 'YES', 'NO', 'YES', 'YES'] as const)[i], food: (['YES', 'YES', 'LOW', 'NO', 'YES', 'LOW'] as const)[i], power: (['YES', null, 'LOW', 'NO', 'YES', 'YES'] as const)[i],
      statusNote: i === 0 ? 'Pets welcome; bring ID if you have it.' : i === 5 ? 'Camp beds in the main hall, hot showers.' : null,
      statusAt: new Date(now - [1, 3, 9, 30, 0.5, 2][i] * 3_600_000).toISOString(),
    })),
  };
}

/** GET /relief/incidents (M150): one emergency going on, two friends who said they're safe. */
export function sampleReliefIncidents() {
  const now = Date.now();
  return {
    incidents: [{
      id: 'sample-incident-1', title: 'River flooding in the old town', place: BIG[0][0], lat: BIG[0][1], lng: BIG[0][2], radiusKm: 20,
      endsAt: new Date(now + 52 * 3_600_000).toISOString(), createdAt: new Date(now - 20 * 3_600_000).toISOString(),
      org: { id: 'sample-org-food', name: 'Riverside Food Bank' }, safeAt: null, told: 0,
      safeContacts: [{ name: 'Priya Sharma', at: new Date(now - 3 * 3_600_000).toISOString() }, { name: 'Tom Walker', at: new Date(now - 5 * 3_600_000).toISOString() }],
      canEnd: true, safeCount: 23,
    }],
  };
}

/** GET /relief/contacts (M150) */
export function sampleReliefContacts() {
  return { contacts: ['Priya Sharma', 'Tom Walker', 'Alice Chen', 'Bob Martinez', 'Tara Okafor', 'Mia Rossi', 'Daniel Kim'].map((name, i) => ({ id: `sample-contact-${i}`, name })) };
}

/** GET /relief/orgs/:id/aid (M151): an organisation's aid boxes. */
export function sampleReliefAid() {
  const now = Date.now();
  const rows: [string, number, string, AidStep, number, number][] = [
    ['Hygiene kits and drinking water for 20 families', 12, 'Kochi', 'ON_THE_WAY', 3, 18],
    ['Rice, lentils and cooking oil', 40, 'Thrissur', 'DELIVERED', 26, 31],
    ['Blankets and children’s clothes', 8, 'Alappuzha', 'PACKED', 1, 2],
    ['First-aid kits', 5, 'Kottayam', 'DELIVERED', 70, 9],
  ];
  return {
    run: true,
    boxes: rows.map(([contents, boxes, toPlace, status, h, followers], i) => ({
      id: `sample-aid-${i}`, code: i === 0 ? 'DEMO' : `SMPL${i}AB7KQ`, contents, boxes, fromPlace: 'Chennai', toPlace, status,
      createdAt: new Date(now - (h + 20) * 3_600_000).toISOString(), updatedAt: new Date(now - h * 3_600_000).toISOString(), followers,
    })),
  };
}

/** GET /relief/aid/:code (M151): every code shows the sample trip. */
export const sampleAidTrip = () => demoAid(Date.now());

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

// ---------- Relief organisations (M106) ----------

const SAMPLE_ORGS = [
  { id: 'sample-org-food', name: 'Riverside Food Bank', kind: 'FOOD_BANK', role: 'OWNER', city: 0, about: 'Food parcels, hot meals on weekdays and a pantry for families. Run by 40 volunteers.' },
  { id: 'sample-org-shelter', name: 'Northside Shelter Network', kind: 'SHELTER', role: 'VOLUNTEER', city: 3, about: 'Beds for the night, warm clothes and a clinic on Saturdays.' },
] as const;
const SUPPLIES: [string, ReliefKind, string, number, number][] = [
  ['Bottled water 1.5 L', 'WATER', 'bottles', 340, 100], ['Food parcels', 'FOOD', 'parcels', 46, 60], ['Baby formula', 'FOOD', 'tins', 12, 20],
  ['Rice 5 kg', 'FOOD', 'bags', 88, 30], ['Blankets', 'SHELTER', 'blankets', 120, 40], ['First aid kits', 'MEDICAL', 'kits', 9, 10],
  ['Winter coats', 'CLOTHES', 'coats', 64, 25], ['Hygiene packs', 'OTHER', 'packs', 150, 50],
];
const SHIFT_TITLES = ['Sorting donations', 'Kitchen: hot meals', 'Deliveries by van', 'Front desk', 'Night shift at the shelter', 'Warehouse stock count', 'Saturday clinic helpers'];

function sampleShifts(me: { id: string; name: string }, orgId: string, n: number, seed: number) {
  const r = rng(seed), now = Date.now();
  return Array.from({ length: n }, (_, i) => {
    const start = now + (i * 1.3 + 0.2) * DAY + Math.floor(r() * 8) * 3_600_000, hours = pick(r, [2, 3, 4, 6]);
    const slots = pick(r, [2, 4, 6, 8, 12]), filled = Math.min(slots, Math.floor(r() * (slots + 2)));
    const people = Array.from({ length: filled }, () => person(r));
    const signedUp = i === 1 || i === 4;
    return {
      id: `sample-shift-${orgId}-${i}`, orgId, title: pick(r, SHIFT_TITLES), details: r() < 0.4 ? 'Bring closed shoes. Ask for Sam at the side door.' : null, place: r() < 0.5 ? 'Dock Road warehouse' : null,
      startsAt: iso(start), endsAt: iso(start + hours * 3_600_000), slots, filled: signedUp ? Math.min(slots, filled + 1) : filled, membersOnly: i % 5 === 3, signedUp,
      people: signedUp ? [...people.slice(0, slots - 1), { id: me.id, name: me.name }] : people,
    };
  });
}

/** GET /relief/orgs */
export function sampleReliefOrgs(me: { id: string; name: string }) {
  const orgs = SAMPLE_ORGS.map((o) => ({ id: o.id, name: o.name, kind: o.kind, place: placeOf(BIG[o.city]), lat: snap(BIG[o.city][1]), lng: snap(BIG[o.city][2]) }));
  const all = [...sampleShifts(me, orgs[0].id, 7, 11), ...sampleShifts(me, orgs[1].id, 5, 12), ...sampleShifts(me, 'sample-org-other', 6, 13)]
    .map(({ people, ...s }) => { void people; return { ...s, org: orgs.find((o) => o.id === s.orgId) ?? { id: 'sample-org-other', name: 'Harbour Mutual Aid', kind: 'COMMUNITY', place: placeOf(BIG[5]), lat: snap(BIG[5][1]), lng: snap(BIG[5][2]) } }; })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return {
    orgs: SAMPLE_ORGS.map((o, i) => ({ id: o.id, name: o.name, kind: o.kind, place: orgs[i].place, role: o.role, members: i ? 18 : 41, low: i ? 0 : 3, shifts: i ? 5 : 7 })),
    mine: all.filter((s) => s.signedUp),
    shifts: all.filter((s) => !s.signedUp && s.filled < s.slots && (!s.membersOnly || s.orgId !== 'sample-org-other')),
  };
}

/** GET /relief/orgs/:id */
export function sampleReliefOrg(me: { id: string; name: string }, id: string) {
  const o = SAMPLE_ORGS.find((x) => x.id === id);
  if (!o) return null;
  const r = rng(o.id.length * 31), now = Date.now(), c = BIG[o.city];
  const members = [{ id: me.id, name: me.name, role: o.role, since: iso(now - 120 * DAY), me: true }, ...NAMES.slice(0, o.role === 'OWNER' ? 12 : 9).map((name, i) => ({ id: `sample-m-${i}`, name, role: i === 0 ? (o.role === 'OWNER' ? 'COORDINATOR' : 'OWNER') : i < 3 ? 'COORDINATOR' : 'VOLUNTEER', since: iso(now - (100 - i * 7) * DAY), me: false }))];
  const supplies = SUPPLIES.map(([name, kind, unit, quantity, lowAt], i) => ({ id: `sample-sup-${o.id}-${i}`, name, kind, unit, quantity: o.role === 'OWNER' ? quantity : Math.round(quantity * 0.7), lowAt, low: (o.role === 'OWNER' ? quantity : Math.round(quantity * 0.7)) <= lowAt, updatedAt: iso(now - r() * 3 * DAY) }));
  const moves = Array.from({ length: 14 }, (_, i) => {
    const s = pick(r, supplies), change = r() < 0.55 ? -Math.ceil(r() * 20) : Math.ceil(r() * 60);
    return { id: `sample-move-${i}`, supplyId: s.id, change, note: change > 0 ? pick(r, ['Donation from St Mary’s school', 'Supermarket surplus', null]) : pick(r, ['Handed out at the hall', 'Van run to Ward 12', null]), at: iso(now - i * 5 * 3_600_000 - r() * 3_600_000), by: pick(r, members).name };
  });
  const posts = reliefPosts(me).filter((p) => p.type === 'NEED');
  const handling = posts.filter((p) => p.status !== 'OPEN').slice(0, 5).map((p) => ({ ...p, helperOrg: { id: o.id, name: o.name }, helping: o.role !== 'VOLUNTEER' || p.helping }));
  const near = posts.filter((p) => p.status === 'OPEN').slice(0, 8).map((p) => ({ ...p, lat: snap(c[1] + (r() - 0.5) * 0.3), lng: snap(c[2] + (r() - 0.5) * 0.3), place: placeOf(c) }));
  return {
    org: { id: o.id, name: o.name, kind: o.kind, about: o.about, place: placeOf(c), lat: snap(c[1]), lng: snap(c[2]), createdAt: iso(now - 140 * DAY), code: o.role === 'OWNER' ? 'RVR7QK' : null, textNumber: o.role === 'OWNER' ? '+447700900123' : null },
    role: o.role, members,
    // M107: text requests, for coordinators (numbers from the UK range kept for films and TV: nobody's).
    textsOn: o.role === 'OWNER',
    texts: o.role === 'OWNER' ? [
      { id: 'sample-text-0', channel: 'SMS', from: '+447700900481', body: 'Hello, we are a family of 5 near the station, no food since yesterday. Can someone help please', status: 'NEW', postId: null, createdAt: iso(now - 0.6 * 3_600_000) },
      { id: 'sample-text-1', channel: 'WHATSAPP', from: '+447700900662', body: 'My mother needs insulin urgently, the pharmacy is closed. We are on Mill Lane.', status: 'NEW', postId: null, createdAt: iso(now - 2.2 * 3_600_000) },
      { id: 'sample-text-2', channel: 'SMS', from: '+447700900137', body: 'Need blankets for 3 children tonight', status: 'POSTED', postId: 'sample-relief-4', createdAt: iso(now - 9 * 3_600_000) },
    ] : null, supplies, moves, shifts: sampleShifts(me, o.id, o.role === 'OWNER' ? 7 : 5, o.role === 'OWNER' ? 11 : 12), handling, near,
  };
}

// ---------- Green ----------

const AMT: Record<GreenKind, [number, number]> = { TREE: [1, 4], CYCLE: [3, 25], TRANSIT: [5, 40], WALK: [1, 6], RECYCLE: [1, 8], SOLAR: [5, 30], MEATFREE: [1, 3], CLEANUP: [1, 6] };

function myActions(me: { id: string }) {
  const r = rng(9), now = Date.now(), home = BIG[3];
  return Array.from({ length: 64 }, (_, i) => {
    const kind = pick(r, GREEN_KINDS), [lo, hi] = AMT[kind], amount = Math.round((lo + r() * (hi - lo)) * 10) / 10;
    // Every one of the last six days has one, so the streak shows.
    const at = i < 6 ? now - i * DAY - 3_600_000 * (1 + r() * 6) : now - (6 + r() * 54) * DAY;
    // Most older actions were confirmed by a teammate; a few recent ones wait with their photo.
    const photoUrl = i % 5 === 1 ? '/og.jpg' : null, verifiedAt = i > 3 && i % 4 !== 0 ? iso(at + 3_600_000) : null;
    return { id: `sample-green-${i}`, userId: me.id, kind, amount, co2Kg: co2For(kind, amount), note: r() < 0.2 ? 'With the team' : null, lat: Math.round(home[1] * 10) / 10, lng: Math.round(home[2] * 10) / 10, place: home[0], photoUrl: photoUrl ?? (verifiedAt ? '/og.jpg' : null), verifiedAt, feeling: i % 3 ? (kind === 'CYCLE' || kind === 'WALK' ? 'EASY' : FEELINGS[i % 3]) : null, createdAt: iso(at) };
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
  const thisWeek = actions.filter((a) => a.kind === challenge.kind && Date.parse(a.createdAt) >= week);
  const mine = thisWeek.filter((a) => a.verifiedAt).reduce((s, a) => s + a.amount, 0), waiting = thisWeek.filter((a) => !a.verifiedAt).reduce((s, a) => s + a.amount, 0);
  const proven = actions.filter((a) => a.verifiedAt);
  // M216: a year of made-up days (more in spring and summer), for the heatmap and the year card.
  const year: Record<string, number> = {}, yr = rng(7);
  for (let i = 0; i < 365; i++) { const t = now - i * DAY, m = new Date(t).getUTCMonth(); if (yr() < (m >= 3 && m <= 8 ? 0.55 : 0.3)) year[iso(t).slice(0, 10)] = Math.round((1 + yr() * 9) * 10) / 10; }
  for (const a of actions) { const d = a.createdAt.slice(0, 10); year[d] = Math.round(((year[d] ?? 0) + a.co2Kg) * 10) / 10; }
  return {
    totals: { ...totals, kg: Math.round(kg * 10) / 10, kgByKind, longest: 12 },
    year,
    badges: BADGES.map((b) => ({ id: b.id, label: b.label, text: b.text, earned: b.earned(totals) })),
    challenge: { ...challenge, mine: Math.round(mine * 10) / 10, waiting: Math.round(waiting * 10) / 10, team: Math.round((mine * 7.4 + 12) * 10) / 10 },
    verified: { actions: proven.length, kg: Math.round(proven.reduce((s, a) => s + a.co2Kg, 0) * 10) / 10 },
    perDay: Array.from({ length: 30 }, (_, i) => {
      const d = iso(now - (29 - i) * DAY).slice(0, 10);
      return { day: d, kg: Math.round(actions.filter((a) => a.createdAt.startsWith(d)).reduce((s, a) => s + a.co2Kg, 0) * 10) / 10 };
    }),
    recent: actions.slice(0, 30), teams: 2, easiest: easiestKind(actions),
    community: { kg: 182_450, actions: 41_236, people: 2_904 },
  };
}

/** GET /relief/alerts (M217): made-up alerts in the shape GDACS and USGS give. */
export function sampleReliefAlerts() {
  const at = (h: number) => iso(Date.now() - h * 3_600_000);
  return { alerts: [
    { id: 'sample-al-1', kind: 'TC', title: 'Tropical cyclone Lina', level: 'red', lat: 18.2, lng: 121.6, at: at(5), url: null, country: 'Philippines', source: 'GDACS', magnitude: null },
    { id: 'sample-al-2', kind: 'FL', title: 'Flood in the Po valley', level: 'orange', lat: 45.0, lng: 10.6, at: at(20), url: null, country: 'Italy', source: 'GDACS', magnitude: null },
    { id: 'sample-al-3', kind: 'EQ', title: 'M6.2 off the coast of Chile', level: 'orange', lat: -33.1, lng: -72.4, at: at(30), url: null, country: null, source: 'USGS', magnitude: 6.2 },
    { id: 'sample-al-4', kind: 'WF', title: 'Forest fires in Andalusia', level: 'orange', lat: 37.3, lng: -5.9, at: at(44), url: null, country: 'Spain', source: 'GDACS', magnitude: null },
    { id: 'sample-al-5', kind: 'EQ', title: 'M4.9 Azores', level: 'green', lat: 38.5, lng: -28.3, at: at(60), url: null, country: null, source: 'USGS', magnitude: 4.9 },
  ], credit: 'Alerts: GDACS (UN and European Commission) and the US Geological Survey' };
}
/** GET /relief/plan (M217) */
export function sampleReliefPlan() {
  return { plan: { people: 3, meetNear: 'The bakery on the corner', meetFar: 'Aunt Rosa’s house, Sintra', contacts: [{ name: 'Rosa', phone: '+351 21 000 0000' }], needs: 'Inhaler for Leo', pets: 'Mimi the cat', notes: '' }, kit: ['water', 'torch', 'firstaid', 'docs'], updatedAt: iso(Date.now() - 9 * DAY) };
}
/** GET /relief/hours (M217) */
export function sampleReliefHours() {
  const s = (id: string, title: string, org: string, daysAgo: number, hours: number) => ({ id, title, org, startsAt: iso(Date.now() - daysAgo * DAY), hours });
  return { total: 14.5, shifts: [s('sample-sh-1', 'Sorting donations', 'Eastside Food Bank', 3, 3), s('sample-sh-2', 'Night shelter evening', 'Harbour Night Shelter', 10, 5), s('sample-sh-3', 'Hot meals round', 'Red Door Relief', 17, 4), s('sample-sh-4', 'Warehouse', 'Eastside Food Bank', 25, 2.5)] };
}
/** GET /green/footprints (M216): two made-up results a few months apart. */
export function sampleGreenFootprints() {
  const a = { carKmWeek: 120, car: 'petrol', transitKmWeek: 20, shortFlights: 2, longFlights: 1, diet: 'medium', heat: 'gas', size: 'flat', people: 2, greenPower: false, kwhMonth: 250, stuff: 'some' };
  return { history: [
    { id: 'sample-fp-2', kg: 6815, createdAt: iso(Date.now() - 3 * DAY), answers: { ...a, carKmWeek: 60, longFlights: 0, diet: 'low' } },
    { id: 'sample-fp-1', kg: 8984, createdAt: iso(Date.now() - 120 * DAY), answers: a },
  ] };
}
/** GET /green/goals (M216) */
export function sampleGreenGoals() {
  const d = (back: number) => iso(Date.now() - back * DAY).slice(0, 10), m = new Date();
  return { monthlyKg: 60, monthKg: 38.4, monthStart: new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), 1)).toISOString().slice(0, 10), pledges: [
    { id: 'sample-pl-1', tip: 'meat-free-days', days: [d(1), d(4), d(8)], createdAt: iso(Date.now() - 20 * DAY) },
    { id: 'sample-pl-2', tip: 'bike-commute', days: [d(0), d(1), d(2), d(3), d(6)], createdAt: iso(Date.now() - 40 * DAY) },
  ] };
}
/** GET /green/events (M216): made-up community events nearby. */
export function sampleGreenEvents() {
  const d = (ahead: number) => iso(Date.now() + ahead * DAY).slice(0, 10);
  const e = (id: string, title: string, kind: string, ahead: number, time: string, place: string, lat: number, lng: number, going: number, details: string) => ({ id, name: NAMES[going % NAMES.length].split(' ')[0], title, kind, date: d(ahead), time, place, lat, lng, details, going, imGoing: going % 3 === 0, mine: false });
  return { events: [
    e('sample-ev-1', 'Beach clean-up at Carcavelos', 'cleanup', 3, '10:00', 'Carcavelos beach, by the fort', 38.677, -9.335, 24, 'Gloves and bags provided. Bring water and a hat.'),
    e('sample-ev-2', 'Plant 200 trees in Monsanto', 'planting', 9, '09:30', 'Monsanto park, Alvito picnic area', 38.721, -9.188, 41, 'With the city’s park rangers. Children welcome with an adult.'),
    e('sample-ev-3', 'Repair café', 'repair', 12, '14:00', 'Biblioteca de Alcântara', 38.705, -9.177, 9, 'Bring a broken toaster, lamp or bike: volunteers help you fix it.'),
    e('sample-ev-4', 'Clothes swap', 'swap', 18, '11:00', 'LX Factory, main hall', 38.703, -9.178, 33, 'Bring up to five clean things, take five home.'),
  ] };
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
    week: board.map((t) => ({ ...t, kg: Math.round(t.kg / 4.3 * 10) / 10, actions: Math.round(t.actions / 4.3) })).sort((a, b) => b.kg - a.kg).map((t, i) => ({ ...t, rank: i + 1 })),
    people: NAMES.slice(0, 10).map((name, i) => ({ rank: i + 1, name, kg: Math.round((640 - i * 48) * 10) / 10, actions: 90 - i * 6, me: false })),
  };
}

/** GET /green/map */
/** GET /green/proofs */
export function sampleGreenProofs() {
  const now = Date.now(), r = rng(33);
  return {
    teams: 2,
    proofs: (['TREE', 'CLEANUP', 'CYCLE'] as const).map((kind, i) => {
      const amount = [3, 4.5, 18][i];
      return { id: `sample-proof-${i}`, kind, amount, co2Kg: co2For(kind, amount), note: ['Behind the school', 'Riverbank, 6 bags', null][i], photoUrl: '/og.jpg', place: null, createdAt: iso(now - (i + r()) * 5 * 3_600_000), by: NAMES[i * 3] };
    }),
  };
}

export function sampleGreenMap() {
  const r = rng(11);
  return { cells: BIG.flatMap((c) => Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({ lat: Math.round((c[1] + (r() - 0.5) * 0.6) * 10) / 10, lng: Math.round((c[2] + (r() - 0.5) * 0.6) * 10) / 10, kg: Math.round(20 + r() * 900), actions: 3 + Math.floor(r() * 120), place: c[0] }))) };
}

// ---------- Trace ----------

const BRAND = { id: 'sample-brand', name: 'Aurora Foods', slug: 'aurora-foods', category: 'food', color: '#fe81d1', logoUrl: null, plan: 'PRO', pointValue: 0.01, currency: 'EUR', minCashout: 500 };
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
  // M108: the olive oil has its Digital Product Passport filled in (GS1 keeps prefix 952 for examples).
  ...(i === 0 && { gtin: '09520123456788', dpp: JSON.stringify(SAMPLE_DPP) }),
  // M146: the olive oil's bottles come back for recycling.
  ...(i === 0 && { takeBackHow: 'Bring the empty bottle to any Aurora shop', takeBackPoints: 20 }),
}));

/** M146: bottles on their way back, one waiting at the counter and one already in. */
export const sampleTraceTakebacks = () => {
  const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  return [
    { id: 'smp-tb1', code: 'SMPL-AUR1-0042', product: PRODUCTS[0].name, status: 'ASKED', dropCode: 'K7Q2MX', points: 20, createdAt: ago(1), receivedAt: null },
    { id: 'smp-tb2', code: 'SMPL-AUR1-0017', product: PRODUCTS[0].name, status: 'RECEIVED', dropCode: 'B4N9TR', points: 20, createdAt: ago(6), receivedAt: ago(4) },
  ];
};

const SAMPLE_DPP = {
  madeIn: 'Spain', manufacturer: { name: 'Aurora Foods S.L. (sample)', address: 'Camino de las Lomas 12, 23001 Jaén, Spain', website: null },
  materials: [
    { name: 'Picual olives', percent: 100, recycled: 0, origin: 'Jaén, Spain', supplier: 'Ortega family groves' },
    { name: 'Glass bottle 1 L', percent: null, recycled: 62, origin: 'Seville, Spain', supplier: 'Vidrios del Sur' },
  ],
  substances: [], carbonKg: 2.6, carbonMethod: 'ISO 14067', recycledContent: 55, recyclable: 96, durabilityYears: 2, repairScore: null, spareYears: null,
  care: 'Keep away from light and heat. Best within 3 months of opening.', repair: null, endOfLife: 'Bottle and cap in the glass bin; used oil to a collection point.',
  certifications: ['EU organic', 'No substances of concern (REACH)'], documents: [],
};

/** GET /trace/products/:id/supply (M108): supplier requests, one answered. */
export const sampleTraceSupply = () => [
  { id: 'sample-sup-1', supplier: 'Tapones Levante', asks: 'Aluminium cap', status: 'ANSWERED', answer: { material: { name: 'Aluminium cap', percent: null, recycled: 40, origin: 'Valencia, Spain', supplier: 'Tapones Levante' }, carbonKg: 0.04, certifications: ['ASI Performance'], documents: [], note: null }, answeredAt: iso(Date.now() - 2 * DAY), expiresAt: iso(Date.now() + 50 * DAY) },
  { id: 'sample-sup-2', supplier: 'Etiquetas Jaén', asks: 'Paper label', status: 'OPEN', answer: null, answeredAt: null, expiresAt: iso(Date.now() + 58 * DAY) },
];

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
    { id: 'sample-brand', name: 'Aurora Foods', color: '#fe81d1', logoUrl: null, pointValue: 0.01, currency: 'EUR', minCashout: 500 },
    { id: 'sample-brand-2', name: 'TerraBrew Coffee', color: '#a16207', logoUrl: null, pointValue: 0.01, currency: 'EUR', minCashout: 500 },
    { id: 'sample-brand-3', name: 'Kaveri Spices', color: '#f59e0b', logoUrl: null, pointValue: 0.008, currency: 'EUR', minCashout: 400 },
  ];
  const balances = [{ brand: brands[0], points: 1240 }, { brand: brands[1], points: 465 }, { brand: brands[2], points: 155 }];
  return {
    total: 1860, worth: { EUR: 18.29 }, verified: true, balances,
    history: Array.from({ length: 24 }, (_, i) => { const b = pick(r, brands); return { id: `sample-pt-${i}`, brandId: b.id, kind: i % 9 === 4 ? 'BONUS' : 'SCAN', points: 25 + Math.floor(r() * 40), note: i % 9 === 4 ? 'Campaign bonus' : 'Sold and scanned', createdAt: iso(now - i * 0.7 * DAY), brand: b.name }; }),
    cashouts: [{ id: 'sample-wc1', points: 600, amount: 6, currency: 'EUR', status: 'PAID', note: null, createdAt: iso(now - 12 * DAY), brand: 'Aurora Foods' }],
    offers: [
      { id: 'sample-o1', title: 'Paris launch: +40 points per sale', bonusPoints: 40, left: 20_160, area: 'Paris (30 km)', endsAt: iso(now + 12 * DAY), brand: 'Aurora Foods', color: '#fe81d1', product: 'Aurora Olive Oil, 1 L' },
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
    // M147: where buyers said they got copies.
    copiesSold: [
      { shop: 'GourmetDeals24 (online)', area: 'Marseille, FR', country: 'FR', reports: 4, last: iso(now - 2 * 3_600_000), price: '€6.90' },
      { shop: 'Corner market, Rue de la Paix', area: 'Lyon, FR', country: 'FR', reports: 2, last: iso(now - 26 * 3_600_000), price: '€7.50' },
    ],
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
    { id: 'sample-v1', code: 'AURORA00042K7QX', since: iso(now - 40 * DAY), owners: 1, product: { id: 'sample-p1', name: 'Aurora Olive Oil, 1 L', imageUrl: null, category: 'food' }, brand: { id: 'sample-brand', name: 'Aurora Foods', color: '#fe81d1', slug: 'aurora-foods' }, warrantyEnds: null, transfer: null },
    { id: 'sample-v2', code: 'ZENITH0911PQ4M', since: iso(now - 120 * DAY), owners: 2, product: { id: 'sample-w', name: 'Zenith Diver 300', imageUrl: null, category: 'watches' }, brand: { id: 'sample-zenith', name: 'Zenith Watches', color: '#94a3b8', slug: 'zenith-watches' }, warrantyEnds: iso(now + 600 * DAY), transfer: { code: 'K7Q2XM4P', until: iso(now + 5 * DAY) } },
  ];
}

/** GET /play/me */
export function samplePlayMe() {
  const r = rng(31), now = Date.now();
  const games = Object.fromEntries(GAME_IDS.map((g) => [g, { best: Math.round(GAMES[g].maxScore * (0.18 + r() * 0.2)), solo: 3 + Math.floor(r() * 9), multi: Math.floor(r() * 5) }])) as Record<GameId, { best: number; solo: number; multi: number }>;
  const recent = Array.from({ length: 8 }, (_, i) => {
    const game = pick(r, GAME_IDS);
    return { game, mode: r() < 0.35 ? 'multi' : 'solo', score: Math.round(games[game].best * (0.55 + r() * 0.45)), createdAt: iso(now - (i * 5 + r() * 4) * 3_600_000) };
  });
  return { games, played: GAME_IDS.reduce((n, g) => n + games[g].solo + games[g].multi, 0), recent, age: null, xp: 6_420 };
}

/** GET /play/leaderboard */
export function samplePlayBoard(me: { id: string; name: string }, gameRaw: unknown, rangeRaw: unknown) {
  const game: GameId = isGame(gameRaw) ? gameRaw : 'quiz', range = rangeRaw === 'all' ? 'all' : 'week';
  const r = rng(game.length * 7 + (range === 'all' ? 3 : 0)), max = GAMES[game].maxScore;
  const mine = Math.round(max * (range === 'all' ? 0.36 : 0.31));
  const rows = [...NAMES.slice(0, 14).map((name) => ({ name, score: Math.round(max * (0.2 + r() * 0.35)), me: false })), { name: me.name, score: mine, me: true }]
    .sort((a, b) => b.score - a.score)
    .map((x, i) => ({ rank: i + 1, name: x.name, avatar: null, score: x.score, rounds: 1 + Math.floor(r() * 12), me: x.me }));
  return { game, range, maxScore: max, rows, mine };
}


// ---------- Air traffic (M69) ----------

const HUBS: [number, number][] = [[51.47, -0.45], [49.01, 2.55], [50.03, 8.57], [52.31, 4.76], [40.47, -3.56], [41.26, 28.74], [25.25, 55.36], [25.27, 51.61], [28.56, 77.1], [19.09, 72.87], [1.36, 103.99], [13.69, 100.75], [22.31, 113.92], [31.14, 121.81], [40.08, 116.6], [37.46, 126.44], [35.55, 139.78], [-33.95, 151.18], [40.64, -73.78], [41.98, -87.9], [33.64, -84.43], [32.9, -97.04], [33.94, -118.41], [37.62, -122.38], [43.68, -79.63], [19.44, -99.07], [-23.43, -46.47], [4.7, -74.15], [-26.14, 28.25], [30.12, 31.41], [-1.32, 36.93], [6.58, 3.32]];
/** GET /trace/aircraft: made-up flights between 32 real airports, as "now". */
export function sampleAircraft(): AirTraffic {
  const r = rng(77), planes: Plane[] = [];
  const brg = (a: [number, number], b: [number, number]) => { const p1 = a[0] * Math.PI / 180, p2 = b[0] * Math.PI / 180, dl = (b[1] - a[1]) * Math.PI / 180; return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * 180 / Math.PI + 360) % 360; };
  while (planes.length < 1600) {
    const a = HUBS[Math.floor(r() * HUBS.length)], b = HUBS[Math.floor(r() * HUBS.length)];
    if (a === b) continue;
    const d = 6_371_000 * Math.acos(Math.min(1, Math.sin(a[0] * Math.PI / 180) * Math.sin(b[0] * Math.PI / 180) + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.cos((b[1] - a[1]) * Math.PI / 180)));
    if (d < 400_000) continue;
    const f = 0.05 + r() * 0.9, [lat, lon] = ahead(a[0], a[1], brg(a, b), d * f);
    planes.push([Math.round(lat * 100) / 100, Math.round(lon * 100) / 100, Math.round(brg([lat, lon], b)), Math.round(210 + r() * 50), Math.round(9000 + r() * 3000)]);
  }
  return { at: new Date().toISOString(), planes, source: 'sample flights' };
}

// ——— UniVerse Travel (M202): a sample guide (Lisbon), search, the week's weather and saved places. ———
const SAMPLE_GUIDE = {
  title: 'Lisbon', banner: 'Lisbon Wikivoyage Banner.png', lat: 38.7139, lon: -9.1394, parent: 'Portugal',
  summary: ['Lisbon is Portugal’s hilly, coastal capital: pastel streets, old trams climbing to viewpoints, river light and the smell of grilled sardines.', 'Most sights sit within a few hills of the Tagus, close enough to walk between trams.'],
  places: [{ title: 'Lisbon/Baixa', name: 'Baixa', text: 'The grid of shopping streets rebuilt after the 1755 earthquake.' }, { title: 'Lisbon/Alfama', name: 'Alfama', text: 'The oldest quarter: lanes, laundry lines and fado at night.' }, { title: 'Lisbon/Belém', name: 'Belém', text: 'Monuments of the age of discovery, and the famous custard tarts.' }],
  sections: [
    { part: 'understand', title: 'Understand', text: ['Lisbon is one of Europe’s oldest cities and one of its sunniest, with mild winters and warm, dry summers.'], listings: [] },
    { part: 'see', title: 'See', text: ['Start at a viewpoint (miradouro) for the shape of the city.'], listings: [
      { kind: 'see', name: 'Belém Tower', price: '€8', hours: '10:00–17:30, closed Mondays', address: 'Av. Brasília', lat: 38.6916, lon: -9.216, text: 'A riverside fortress from the 1500s, Lisbon’s best-known landmark.' },
      { kind: 'see', name: 'Jerónimos Monastery', price: '€10', hours: '09:30–17:30', lat: 38.6979, lon: -9.2068, text: 'A cloister of carved stone, built on the wealth of the spice trade.' },
      { kind: 'see', name: 'Miradouro da Senhora do Monte', price: 'Free', lat: 38.7192, lon: -9.1326, text: 'The highest viewpoint, with the castle and the river below.' },
      { kind: 'see', name: 'São Jorge Castle', price: '€15', hours: '09:00–21:00', lat: 38.7139, lon: -9.1335, text: 'Moorish walls and peacocks above Alfama.' },
    ] },
    { part: 'eat', title: 'Eat', text: ['Lunch menus (prato do dia) are the best value.'], listings: [
      { kind: 'eat', name: 'Pastéis de Belém', price: '€1.40 a tart', hours: '08:00–23:00', lat: 38.6975, lon: -9.2032, text: 'The custard tarts everyone queues for, warm from the oven.' },
      { kind: 'eat', name: 'Time Out Market', price: '€8–20', lat: 38.7069, lon: -9.1459, text: 'A market hall of the city’s favourite cooks under one roof.' },
    ] },
    { part: 'sleep', title: 'Sleep', text: [], listings: [{ kind: 'sleep', name: 'A guest house in Alfama', price: '€70–110', text: 'Quiet rooms on a lane near the castle.', group: 'Mid-range' }] },
    { part: 'stay safe', title: 'Stay safe', text: ['Lisbon is safe; watch for pickpockets on tram 28 and in crowds.'], listings: [] },
  ],
};
/** GET /travel/guide */
export function sampleTravelGuide(d: string | null) {
  const title = d || 'Lisbon';
  const guide = { ...SAMPLE_GUIDE, title: title.startsWith('Lisbon') ? title : 'Lisbon' };
  return { guide, country: { name: 'Portugal', code: 'PT', flag: '🇵🇹', capital: 'Lisbon', currencies: [{ code: 'EUR', name: 'Euro' }], languages: ['Portuguese'], callingCode: '+351', drives: 'right', emergency: ['112'], plugs: ['C', 'F'], volts: [230] }, credit: { source: 'Wikivoyage', licence: 'CC BY-SA 3.0', url: 'https://en.wikivoyage.org/wiki/Lisbon' },
    // M204: sample "know before you go" (written for the demo, not taken from the guide).
    tips: {
      tipping: ['Service is usually included; leaving the small change or about 5% for good service is common.'],
      water: ['Tap water is safe to drink across the city.'],
      scams: ['Watch your bag on the busiest tram lines, where pickpockets work the crowds.'],
      dishes: ['Try a custard tart warm from the oven, ideally with cinnamon on top.', 'Grilled sardines are the taste of the June festivals.'],
      stories: ['The city spreads over seven hills above a wide river mouth.', 'Much of the centre was rebuilt on a grid after the great earthquake of 1755.'],
      transit: ['A rechargeable travel card covers the metro, trams, buses and river ferries.'],
      night: ['Keep to busy streets late at night in Bairro Alto.'],
    },
    climate: { high: [15, 16, 19, 20, 23, 26, 28, 28, 27, 23, 18, 15], low: [8, 9, 11, 12, 14, 17, 18, 19, 18, 15, 12, 9], rain: [100, 78, 69, 72, 58, 16, 4, 6, 33, 100, 114, 127] },
    fromCountry: [], tipsCountry: null,
  };
}
/** GET /travel/search */
export function sampleTravelSearch(q: string | null) {
  const all = [{ title: 'Lisbon', about: 'capital of Portugal' }, { title: 'Lisbon/Alfama', about: 'district of Lisbon' }, { title: 'Kyoto', about: 'city in Japan' }, { title: 'Bali', about: 'island in Indonesia' }];
  const t = (q ?? '').toLowerCase();
  return { results: all.filter((r) => r.title.toLowerCase().includes(t)).map((r) => ({ ...r, thumb: null })) };
}
/** GET /travel/weather */
export function sampleTravelWeather() {
  const skies = ['clearsky_day', 'partlycloudy_day', 'fair_day', 'rain', 'partlycloudy_day', 'clearsky_day', 'cloudy'];
  return { days: skies.map((symbol, i) => ({ date: new Date(Date.now() + i * DAY).toISOString().slice(0, 10), min: 12 + (i % 3), max: 19 + (i % 4), symbol, rain: symbol === 'rain' ? 4.2 : 0 })), credit: 'Weather: MET Norway (CC BY 4.0)' };
}
/** GET /travel/visa (M205): a sample passport's rules (written for the demo). */
export function sampleTravelVisa(p: string | null) {
  const none = { s: 'none', d: '90 days' }, evisa = { s: 'evisa', d: '30 days' };
  const rules: Record<string, { s: string; d?: string }> = { PT: none, ES: none, FR: none, IT: none, GR: none, HR: none, JP: none, KR: none, TH: { s: 'none', d: '30 days' }, VN: { s: 'evisa', d: '90 days' }, ID: { s: 'arrival', d: '30 days' }, IN: evisa, MA: none, TR: none, US: { s: 'eta', d: '90 days' }, CA: { s: 'eta', d: '6 months' }, MX: { s: 'none', d: '180 days' }, PE: { s: 'none', d: '183 days' }, AU: { s: 'eta', d: '3 months' }, EG: evisa, CN: { s: 'required' }, RU: { s: 'required' } };
  return { passport: (p ?? 'GB').toUpperCase(), who: 'British citizens', rules, credit: { source: 'Wikipedia', licence: 'CC BY-SA 4.0', url: 'https://en.wikipedia.org/wiki/Visa_requirements_for_British_citizens' } };
}
/** GET /travel/trips (M206): a sample trip being planned with a friend. */
export function sampleTravelTrips() {
  return { trips: [{ id: 'sample-trip-1', name: 'Portugal in spring', startDate: '2027-04-08', mine: true, updatedAt: new Date().toISOString(), cities: ['Lisbon', 'Porto'], cover: 'Lisbon', days: 5, people: 2, places: 6 }] };
}
/** GET /travel/trips/:id */
export function sampleTravelTrip(me: { id: string; name?: string }) {
  const stop = (id: string, guide: string, lat: number, lon: number, days: number, position: number) => ({ id, tripId: 'sample-trip-1', guide, name: guide, cc: 'PT', lat, lon, days, position });
  const item = (id: string, stopId: string, day: number | null, position: number, name: string, kind: string, lat: number, lon: number, minutes: number, extra: { hours?: string; price?: string; note?: string } = {}) => ({ id, tripId: 'sample-trip-1', stopId, day, position, name, kind, lat, lon, minutes, hours: extra.hours ?? null, price: extra.price ?? null, note: extra.note ?? null, address: null, url: null, addedById: me.id, createdAt: new Date().toISOString() });
  return {
    trip: { id: 'sample-trip-1', name: 'Portugal in spring', startDate: '2027-04-08', travellers: 2, style: 'mid', currency: 'EUR', updatedAt: new Date().toISOString() },
    code: 'SAMPLE2345', owner: true, ownerId: me.id, me: me.id,
    stops: [stop('sample-stop-1', 'Lisbon', 38.7139, -9.1394, 3, 0), stop('sample-stop-2', 'Porto', 41.1496, -8.611, 2, 1)],
    items: [
      item('sample-item-1', 'sample-stop-1', 0, 0, 'Belém Tower', 'see', 38.6916, -9.216, 60, { hours: '10:00–18:30', price: '€8' }),
      item('sample-item-2', 'sample-stop-1', 0, 1, 'Jerónimos Monastery', 'see', 38.6979, -9.2068, 120, { hours: '09:30–18:00', price: '€12' }),
      item('sample-item-3', 'sample-stop-1', 0, 2, 'Pastéis de Belém', 'eat', 38.6975, -9.2032, 45, { price: '€1.40 a tart' }),
      item('sample-item-4', 'sample-stop-1', 1, 0, 'São Jorge Castle', 'see', 38.7139, -9.1335, 90, { price: '€15' }),
      item('sample-item-5', 'sample-stop-1', null, 0, 'Time Out Market', 'eat', 38.7069, -9.1459, 75, { price: '€8–20' }),
      item('sample-item-6', 'sample-stop-2', 0, 0, 'Livraria Lello', 'see', 41.1469, -8.6149, 30, { price: '€10' }),
    ],
    members: [{ id: me.id, name: (me.name ?? 'You').split(' ')[0], avatar: null, owner: true, zone: null }, { id: 'sample-friend', name: 'Maya', avatar: null, owner: false, zone: 'America/New_York' }],
  };
}
/** GET /travel/trips/:id/expenses (M215): costs shared with the sample friend (made up). */
export function sampleTripExpenses(me: { id: string }) {
  const e = (id: string, what: string, amount: number, paidBy: string, category: string, day: string, split = [me.id, 'sample-friend']) => ({ id, what, amount, currency: 'EUR', paidBy, category, day, split, createdBy: paidBy, createdAt: new Date().toISOString() });
  return { expenses: [
    e('sample-x-1', 'Dinner at Time Out Market', 4600, 'sample-friend', 'food', '2027-04-08'),
    e('sample-x-2', 'Tram 28 tickets', 1200, me.id, 'travel', '2027-04-09'),
    e('sample-x-3', 'Jerónimos Monastery', 2400, me.id, 'fun', '2027-04-08'),
    e('sample-x-4', 'Two nights in Lisbon', 24000, 'sample-friend', 'stay', '2027-04-08'),
  ] };
}
/** GET /travel/trips/:id/packing (M215) */
export function sampleTripPacking() {
  const p = (id: string, item: string, grp: string, done = false) => ({ id, item, grp, done, doneBy: done ? 'sample-friend' : null });
  return { items: [p('sample-p-1', 'Passport (valid six months past the trip)', 'Documents', true), p('sample-p-2', 'Comfortable walking shoes', 'Clothes'), p('sample-p-3', 'A light jacket for the evenings', 'Weather'), p('sample-p-4', 'Sunscreen', 'Health', true)] };
}
/** GET /travel/trips/:id/journal (M242): the sample trip's notes (written for the demo). */
export function sampleTripJournal() {
  const e = (id: string, day: number, text: string, place: string, by: string, mine: boolean) => ({ id, day, text, photoUrl: null, place, shared: true, mine, by, createdAt: new Date().toISOString() });
  return { entries: [
    e('sample-j-1', 0, 'Landed at noon and went straight to Belém for custard tarts, still warm. The queue moves fast.', 'Belém', 'Maya', false),
    e('sample-j-2', 0, 'Sunset from the castle walls: the whole city goes gold.', 'São Jorge Castle', 'You', true),
    e('sample-j-3', 1, 'Tram 28 was packed, so we walked the hills instead and found a tiny fado bar.', 'Alfama', 'Maya', false),
  ] };
}
/** GET /travel/trips/:id/polls (M243): the sample trip's votes (made up). */
export function sampleTripPolls() {
  const at = new Date().toISOString();
  return { polls: [
    { id: 'sample-poll-1', kind: 'place', question: 'Day trip from Lisbon?', multi: false, closed: false, by: 'Maya', mine: false, createdAt: at, options: [{ text: 'Sintra', voters: ['Maya', 'You'] }, { text: 'Cascais', voters: [] }, { text: 'Évora', voters: [] }], chosen: [0], people: 2 },
    { id: 'sample-poll-2', kind: 'stay', question: 'Where to stay in Porto?', multi: true, closed: false, by: 'You', mine: true, createdAt: at, options: [{ text: 'Ribeira, by the river', voters: ['Maya'] }, { text: 'Cedofeita, quieter', voters: [] }], chosen: [], people: 1 },
  ] };
}
/** GET /travel/docs (M245): sample documents (made up; names and dates only). */
export function sampleTravelDocs() {
  return { docs: [
    { id: 'sample-doc-1', tripId: null, kind: 'passport', label: 'Passport', expires: '2027-08-30', note: null, reminded: '' },
    { id: 'sample-doc-2', tripId: 'sample-trip-1', kind: 'insurance', label: 'Travel insurance', expires: '2027-12-31', note: 'Policy in my email', reminded: '' },
  ] };
}
/** GET /travel/trips/:id/share (M248): the sample trip's family link is off; Maya checked in (made up). */
export function sampleTripShare() {
  return { code: null, checkins: [{ id: 'sample-c-1', by: 'Maya', note: 'Landed, all good!', place: 'Lisbon', at: new Date(Date.now() - 2 * 3_600_000).toISOString() }] };
}
/** GET /travel/board (M207): sample travellers in the same city on the same dates (made up). */
export function sampleTravelBoard() {
  return {
    mine: { id: 'sample-board-me', fromDate: '2027-04-08', toDate: '2027-04-10', note: 'Up for a food tour', hidden: false },
    people: [
      { id: 'sample-board-1', name: 'Maya', fromDate: '2027-04-07', toDate: '2027-04-12', note: 'Looking for people to try fado with' },
      { id: 'sample-board-2', name: 'Tom', fromDate: '2027-04-09', toDate: '2027-04-10', note: 'Sintra day trip on the 10th?' },
    ],
    count: 2,
  };
}
/** M209: the map's sample answers (written for the demo; the real ones come from OpenStreetMap, Wikidata,
 *  Commons and Wikipedia). GET /travel/place */
export function sampleTravelPlace() {
  return { place: { key: 'N398922337', name: 'Pastéis de Belém', kind: 'Pastry shop', lat: 38.6975, lon: -9.2033, cc: 'PT', city: 'Lisbon', address: 'Rua de Belém 84-92, Belém, Lisbon', phone: null, website: 'https://pasteisdebelem.pt', menu: null, hours: 'Mo-Su 08:00-21:00', cuisine: ['Regional'], facts: ['Wheelchair accessible', 'Since 1837'], wikidata: null, about: 'The bakery that has made Belém’s custard tarts since 1837.', image: null, wiki: null }, credit: 'Facts: OpenStreetMap contributors (ODbL), Wikidata, Wikipedia (CC BY-SA)' };
}
/** GET /travel/where */
export const sampleTravelWhere = () => ({ lat: 38.7139, lon: -9.1394, box: [-9.23, 38.69, -9.09, 38.8] });
/** GET /travel/photos, /travel/stories */
export const sampleTravelPhotos = () => ({ photos: [], credit: 'Photos: Wikimedia Commons (each by its author, under its licence)' });
export const sampleTravelStories = () => ({ stories: [{ title: 'Belém Tower', lat: 38.6916, lon: -9.216, extract: 'A 16th-century fortress on the Tagus, where ships set out on the voyages of discovery.', thumb: null, url: 'https://en.wikipedia.org/wiki/Bel%C3%A9m_Tower' }], credit: 'Stories: Wikipedia (CC BY-SA 4.0)' });
/** GET /travel/reviews, /travel/reviews/near */
export function sampleTravelReviews() {
  const at = new Date().toISOString();
  return {
    summary: { count: 3, average: 4.7, locals: { count: 2, average: 5 }, visitors: { count: 1, average: 4 } },
    reviews: [
      { id: 'sample-review-1', name: 'Inês', rating: 5, text: 'Go early on a weekday and eat them warm at the counter, with cinnamon.', local: true, visited: '2026-10', at, mine: false },
      { id: 'sample-review-2', name: 'Rui', rating: 5, text: 'Still the best, and the queue moves fast.', local: true, visited: null, at, mine: false },
      { id: 'sample-review-3', name: 'Maya', rating: 4, text: 'Worth the trip to Belém; the tower is a short walk away.', local: false, visited: '2026-09', at, mine: false },
    ],
    mine: null,
  };
}
export const sampleTravelReviewsNear = () => ({ places: [{ place: 'N398922337', name: 'Pastéis de Belém', lat: 38.6975, lon: -9.2033, count: 3, average: 4.7, locals: { count: 2, average: 5 }, visitors: { count: 1, average: 4 } }] });
/** GET /travel/saved */
export function sampleTravelSaved(me: { id: string }) {
  const at = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  return { saved: [
    { id: 'sample-saved-1', userId: me.id, guide: 'Lisbon', name: 'Pastéis de Belém', kind: 'eat', lat: 38.6975, lon: -9.2032, note: 'The custard tarts everyone queues for.', address: null, url: null, createdAt: at(5) },
    { id: 'sample-saved-2', userId: me.id, guide: 'Lisbon', name: 'Belém Tower', kind: 'see', lat: 38.6916, lon: -9.216, note: 'A riverside fortress from the 1500s.', address: 'Av. Brasília', url: null, createdAt: at(30) },
    { id: 'sample-saved-3', userId: me.id, guide: 'Kyoto', name: 'Fushimi Inari-taisha', kind: 'see', lat: 34.9671, lon: 135.7727, note: 'Thousands of red gates up the mountain.', address: null, url: null, createdAt: at(80) },
  ] };
}
