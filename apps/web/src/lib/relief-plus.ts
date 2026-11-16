import type { ReliefKind, Urgency } from './relief';

// UniVerse Relief's second wave (M217, the owner: "big and major upgrades … like 10 features"): the most urgent
// needs first, offers that fit open needs, a go-bag checklist and an emergency plan, the weather's risks where
// you are, live disaster alerts (GDACS and USGS, read once for everyone and kept 15 minutes), and first-aid
// basics. Pure: the pages and the server share them.

const H = 3_600_000;
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(s));
};
export const walkMinutes = (d: number) => Math.max(1, Math.round((d * 1.3 / 4.5) * 60));

// ——— Most urgent ———
export interface TriagePost { id: string; type: 'NEED' | 'OFFER'; kind: ReliefKind; urgency: Urgency; people: number; status: string; createdAt: string; lat: number; lng: number }
const WEIGHT: Record<Urgency, number> = { CRITICAL: 8, HIGH: 4, MEDIUM: 2, LOW: 1 };
/** Open needs, the most urgent first: how urgent, times how long they've waited (it grows slowly), times how
 *  many people (likewise). Each with the reasons in words. */
export function triage<T extends TriagePost>(posts: T[], now: number): { post: T; score: number; hours: number; why: string[] }[] {
  return posts.filter((p) => p.type === 'NEED' && p.status === 'OPEN').map((post) => {
    const hours = Math.max(0, (now - Date.parse(post.createdAt)) / H), people = Math.max(1, post.people);
    const score = WEIGHT[post.urgency] * (1 + Math.log2(1 + hours)) * (1 + Math.log2(people));
    const why = [
      post.urgency === 'CRITICAL' ? 'Critical' : post.urgency === 'HIGH' ? 'High urgency' : null,
      hours >= 24 ? `Waiting ${Math.floor(hours / 24)} ${Math.floor(hours / 24) === 1 ? 'day' : 'days'}` : hours >= 2 ? `Waiting ${Math.floor(hours)} hours` : null,
      people >= 5 ? `${people} people` : null,
    ].filter((x): x is string => !!x);
    return { post, score: Math.round(score * 10) / 10, hours, why };
  }).sort((a, b) => b.score - a.score);
}

// ——— Matches ———
/** For each open need, the open offers of the same kind within reach (15 km), nearest first. */
export function matches<T extends TriagePost>(posts: T[], reachKm = 15): { need: T; offers: { offer: T; km: number }[] }[] {
  const offers = posts.filter((p) => p.type === 'OFFER' && p.status === 'OPEN');
  return posts.filter((p) => p.type === 'NEED' && p.status === 'OPEN').map((need) => ({
    need, offers: offers.filter((o) => o.kind === need.kind).map((offer) => ({ offer, km: Math.round(km(need, offer) * 10) / 10 })).filter((x) => x.km <= reachKm).sort((a, b) => a.km - b.km).slice(0, 3),
  })).filter((m) => m.offers.length).sort((a, b) => WEIGHT[b.need.urgency] - WEIGHT[a.need.urgency] || a.offers[0].km - b.offers[0].km);
}
export const distanceKm = km;

// ——— A go-bag ———
/** What to have ready to leave in minutes (from Red Cross and civil-protection lists): for three days. */
export const KIT: { id: string; group: 'Water and food' | 'Light and power' | 'Health' | 'Documents and money' | 'Clothes and shelter' | 'Others'; label: (people: number) => string }[] = [
  { id: 'water', group: 'Water and food', label: (n) => `${n * 9} litres of water (3 a person a day, for 3 days)` },
  { id: 'food', group: 'Water and food', label: (n) => `Food that keeps for ${n * 3} person-days, and a tin opener` },
  { id: 'torch', group: 'Light and power', label: () => 'A torch and spare batteries' },
  { id: 'radio', group: 'Light and power', label: () => 'A battery or wind-up radio' },
  { id: 'powerbank', group: 'Light and power', label: () => 'A charged power bank and cables' },
  { id: 'firstaid', group: 'Health', label: () => 'A first-aid kit' },
  { id: 'meds', group: 'Health', label: () => 'A week of everyone’s medicines, and copies of prescriptions' },
  { id: 'hygiene', group: 'Health', label: () => 'Soap, hand gel, masks and sanitary products' },
  { id: 'docs', group: 'Documents and money', label: () => 'Copies of IDs, insurance and bank details, in a waterproof bag' },
  { id: 'cash', group: 'Documents and money', label: () => 'Some cash in small notes' },
  { id: 'contacts', group: 'Documents and money', label: () => 'Important numbers written on paper' },
  { id: 'clothes', group: 'Clothes and shelter', label: () => 'Warm clothes, a rain jacket and sturdy shoes' },
  { id: 'blanket', group: 'Clothes and shelter', label: (n) => `${n} emergency ${n === 1 ? 'blanket' : 'blankets'}` },
  { id: 'whistle', group: 'Others', label: () => 'A whistle, to call for help' },
  { id: 'keys', group: 'Others', label: () => 'Spare keys for home and car' },
  { id: 'children', group: 'Others', label: () => 'For children, babies or pets: their food and comforts' },
];
export const KIT_IDS = KIT.map((k) => k.id);

// ——— An emergency plan ———
export interface Plan { people: number; meetNear: string; meetFar: string; contacts: { name: string; phone: string }[]; needs: string; pets: string; notes: string }
export const PLAN_EMPTY: Plan = { people: 1, meetNear: '', meetFar: '', contacts: [], needs: '', pets: '', notes: '' };
const clipText = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, n) : '');
/** A plan as sent, checked: lengths kept short, at most six contacts, phone numbers only digits and + ( ) - spaces. */
export function readPlan(v: unknown): Plan {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const people = typeof o.people === 'number' && Number.isInteger(o.people) ? Math.min(20, Math.max(1, o.people)) : 1;
  const contacts = (Array.isArray(o.contacts) ? o.contacts : []).slice(0, 6).map((c) => {
    const x = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    return { name: clipText(x.name, 60), phone: clipText(x.phone, 30).replace(/[^\d+()\-\s]/g, '') };
  }).filter((c) => c.name || c.phone);
  return { people, meetNear: clipText(o.meetNear, 120), meetFar: clipText(o.meetFar, 120), contacts, needs: clipText(o.needs, 300), pets: clipText(o.pets, 120), notes: clipText(o.notes, 500) };
}
export const readKit = (v: unknown): string[] => [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string' && KIT_IDS.includes(x)))];

// ——— The weather's risks ———
export interface Day { date: string; min: number; max: number; rain: number }
/** Heat, cold and heavy rain in the coming days, with what to do (public-health thresholds, rounded). */
export function weatherRisks(days: Day[]): { date: string; kind: 'heat' | 'cold' | 'rain'; level: 'take care' | 'danger'; text: string }[] {
  const out: { date: string; kind: 'heat' | 'cold' | 'rain'; level: 'take care' | 'danger'; text: string }[] = [];
  for (const d of days) {
    if (d.max >= 38) out.push({ date: d.date, kind: 'heat', level: 'danger', text: `Up to ${d.max} °C: stay out of the sun from late morning to late afternoon, drink water often, check on older neighbours.` });
    else if (d.max >= 32) out.push({ date: d.date, kind: 'heat', level: 'take care', text: `Up to ${d.max} °C: shade, water and a cool room in the hottest hours.` });
    if (d.min <= -10) out.push({ date: d.date, kind: 'cold', level: 'danger', text: `Down to ${d.min} °C: layers, a warm room, and check on people sleeping outside.` });
    else if (d.min <= 0) out.push({ date: d.date, kind: 'cold', level: 'take care', text: `Frost, down to ${d.min} °C: icy paths, and people sleeping outside need shelter.` });
    if (d.rain >= 50) out.push({ date: d.date, kind: 'rain', level: 'danger', text: `${d.rain} mm of rain: floods are possible; never walk or drive through flood water.` });
    else if (d.rain >= 25) out.push({ date: d.date, kind: 'rain', level: 'take care', text: `${d.rain} mm of rain: heavy at times; watch for surface water.` });
  }
  return out;
}

// ——— Disaster alerts ———
export const ALERT_KINDS = { EQ: 'Earthquake', TC: 'Tropical cyclone', FL: 'Flood', VO: 'Volcano', DR: 'Drought', WF: 'Wildfire' } as const;
export type AlertKind = keyof typeof ALERT_KINDS;
export interface Alert { id: string; kind: AlertKind; title: string; level: 'green' | 'orange' | 'red'; lat: number; lng: number; at: string; url: string | null; country: string | null; source: 'GDACS' | 'USGS'; magnitude: number | null }
const LEVELS = ['green', 'orange', 'red'] as const;
/** "Aruba, , Brazil" → "Aruba, Brazil" (GDACS leaves gaps for territories without a name). */
const tidy = (t: string) => t.replace(/(\s*,)+\s*,/g, ',').replace(/\s+,/g, ',').replace(/,\s*$/, '').replace(/\s+/g, ' ').trim();
const okUrl = (u: unknown) => { try { const x = new URL(String(u)); return x.protocol === 'https:' ? x.toString() : null; } catch { return null; } };
/** GDACS's event list and USGS's week of M4.5+ earthquakes as one list, the worst and newest first. */
export function readAlerts(gdacs: unknown, usgs: unknown, now: number): Alert[] {
  const out: Alert[] = [];
  for (const f of ((gdacs as { features?: unknown[] } | null)?.features ?? []) as { geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> }[]) {
    const p = f.properties ?? {}, [lng, lat] = f.geometry?.coordinates ?? [], kind = String(p.eventtype) as AlertKind;
    const level = String(p.alertlevel ?? '').toLowerCase() as Alert['level'];
    if (!(kind in ALERT_KINDS) || !LEVELS.includes(level) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const at = Date.parse(String(p.todate ?? p.fromdate ?? ''));
    if (!Number.isFinite(at) || now - at > 21 * 24 * H) continue;
    const url = okUrl((p.url as Record<string, unknown> | undefined)?.report);
    out.push({ id: `gdacs-${kind}-${String(p.eventid)}`, kind, title: tidy(String(p.name ?? p.description ?? ALERT_KINDS[kind])).slice(0, 140), level, lat, lng, at: new Date(at).toISOString(), url: url?.includes('gdacs.org') ? url : null, country: typeof p.country === 'string' && tidy(p.country) && tidy(p.country).length <= 40 ? tidy(p.country) : null, source: 'GDACS', magnitude: null });
  }
  for (const f of ((usgs as { features?: unknown[] } | null)?.features ?? []) as { id?: string; geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> }[]) {
    const p = f.properties ?? {}, [lng, lat] = f.geometry?.coordinates ?? [], mag = Number(p.mag), at = Number(p.time);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(mag) || !Number.isFinite(at)) continue;
    const level: Alert['level'] = p.alert === 'red' ? 'red' : p.alert === 'orange' || mag >= 7 ? 'orange' : 'green';
    const url = okUrl(p.url);
    out.push({ id: `usgs-${String(f.id)}`, kind: 'EQ', title: `M${mag.toFixed(1)} ${String(p.place ?? '').slice(0, 120)}`.trim(), level, lat, lng, at: new Date(at).toISOString(), url: url?.includes('usgs.gov') ? url : null, country: null, source: 'USGS', magnitude: Math.round(mag * 10) / 10 });
  }
  // The same earthquake from both: keep GDACS's (it rates the impact) when they're within 100 km and 2 hours.
  const quakes = out.filter((a) => a.source === 'GDACS' && a.kind === 'EQ');
  const kept = out.filter((a) => a.source !== 'USGS' || !quakes.some((g) => km(g, a) < 100 && Math.abs(Date.parse(g.at) - Date.parse(a.at)) < 2 * H));
  return kept.sort((a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level) || Date.parse(b.at) - Date.parse(a.at)).slice(0, 150);
}

// ——— First aid ———
/** The basics, as the Red Cross and Red Crescent teach them (IFRC first-aid guidelines), in short steps. */
export const FIRST_AID: { id: string; title: string; call: boolean; steps: string[] }[] = [
  { id: 'cpr', title: 'Not breathing normally', call: true, steps: ['Call the emergency number and put it on speaker; ask for a defibrillator (AED).', 'Push hard and fast in the middle of the chest: about 5 cm deep, 100 to 120 times a minute.', 'If you’re trained, give 2 rescue breaths after every 30 pushes; if not, keep pushing.', 'Use the AED as soon as it arrives and do what it says. Keep going until help takes over or they breathe normally.'] },
  { id: 'unresponsive', title: 'Unresponsive but breathing', call: true, steps: ['Turn them on their side (the recovery position), head tilted back so the airway stays open.', 'Call the emergency number.', 'Keep checking that they are still breathing; if they stop, start pushing on the chest.'] },
  { id: 'bleeding', title: 'Heavy bleeding', call: true, steps: ['Press firmly on the wound with a clean cloth or your hand, and keep pressing.', 'If blood soaks through, add more cloth on top: don’t lift the first.', 'Call the emergency number. Keep them warm and lying down.'] },
  { id: 'choking', title: 'Choking (adult or child)', call: true, steps: ['If they can cough, tell them to keep coughing.', 'If they can’t breathe, speak or cough: lean them forward and give up to 5 firm blows between the shoulder blades.', 'Then up to 5 abdominal thrusts: from behind, a fist above the belly button, pull in and up. Repeat.', 'If they stop responding, call the emergency number and start pushing on the chest.'] },
  { id: 'burns', title: 'Burns', call: false, steps: ['Cool the burn under cool running water for 20 minutes.', 'Take off rings, watches and clothing near it, unless stuck to the skin.', 'Cover it loosely with cling film or a clean, non-fluffy cloth. No ice, creams or butter.', 'Get medical help for large or deep burns, burns on the face, hands or genitals, and burns on children.'] },
  { id: 'bone', title: 'Broken bones', call: false, steps: ['Keep the injured part still, supported as you found it. Don’t try to straighten it.', 'A cold pack wrapped in cloth eases pain and swelling.', 'Get medical help; call the emergency number if the bone shows, or for the neck, back or hip.'] },
  { id: 'heat', title: 'Heatstroke', call: true, steps: ['Move them somewhere cool and shaded.', 'Cool them fast: wet skin and fan them, cool packs at the neck and armpits.', 'Small sips of water if they’re fully awake.', 'Call the emergency number if they’re confused, stop sweating or collapse.'] },
  { id: 'cold', title: 'Hypothermia', call: true, steps: ['Get them somewhere warm and dry; replace wet clothes with dry ones.', 'Warm the body’s middle first, with blankets or skin to skin. No hot baths, and don’t rub their arms and legs.', 'Warm sweet drinks if they’re fully awake (no alcohol).', 'Call the emergency number if they’re drowsy or confused.'] },
  { id: 'shock', title: 'Shock (after an injury)', call: true, steps: ['Lay them down and raise their legs if they aren’t hurt there.', 'Keep them warm with a coat or blanket; loosen tight clothing.', 'Call the emergency number. Nothing to eat or drink.'] },
];
