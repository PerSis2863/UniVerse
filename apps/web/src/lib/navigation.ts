// M260: live turn-by-turn navigation on Travel's map, the parts that are plain logic (tested in navigation.test.ts):
// where you are along the route (snapped to it), how far and how long is left, the next turn and the one after,
// whether you have left the route (time to find a new one), what to say and when, and the turn's arrow. The
// position comes from the phone (navigator.geolocation) and stays in the browser: nothing here talks to a server.

import { distance, haversine, type Mode, type Pt, type Route } from './map-tools';

export type NavStep = { along: number; type: string; mod: string; name: string; text: string; sec: number; exit?: number };
/** A route ready to follow: its line with the metres along it at every point, and its turns placed on the line. */
export type Plan = { path: [number, number][]; cum: number[]; total: number; steps: NavStep[]; sec: number };
export type Snap = { along: number; off: number; at: [number, number] };

const RAD = Math.PI / 180;
/** The compass bearing from one point to another, 0–360 (north 0, east 90). */
export function bearingOf(a: [number, number], b: [number, number]) {
  const y = Math.sin((b[0] - a[0]) * RAD) * Math.cos(b[1] * RAD);
  const x = Math.cos(a[1] * RAD) * Math.sin(b[1] * RAD) - Math.sin(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.cos((b[0] - a[0]) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
const metresBetween = (a: [number, number], b: [number, number]) => haversine({ lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] }) * 1000;

/** The nearest point of the line to `p`, in metres along it and off it. `after`: the metres along already passed
 *  (going back costs as much as being that far off, so a route that comes back past itself keeps you on the right part). */
export function snapTo(plan: Pick<Plan, 'path' | 'cum'>, p: Pt, after = -Infinity): Snap {
  const kx = 111_320 * Math.cos(p.lat * RAD), ky = 110_540, { path, cum } = plan;
  let best: Snap = { along: 0, off: Infinity, at: path[0] }, score = Infinity;
  for (let i = 1; i < path.length; i++) {
    const ax = (path[i - 1][0] - p.lon) * kx, ay = (path[i - 1][1] - p.lat) * ky, dx = (path[i][0] - path[i - 1][0]) * kx, dy = (path[i][1] - path[i - 1][1]) * ky;
    const l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    const off = Math.hypot(ax + dx * t, ay + dy * t), along = cum[i - 1] + (cum[i] - cum[i - 1]) * t, s = off + Math.max(0, after - along);
    if (s < score) { score = s; best = { along, off, at: [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t] }; }
  }
  return best;
}

/** The point `along` metres along the line. */
export function pointAt(plan: Pick<Plan, 'path' | 'cum'>, along: number): [number, number] {
  const { path, cum } = plan;
  if (along <= 0) return path[0];
  if (along >= cum[cum.length - 1]) return path[path.length - 1];
  let lo = 1, hi = cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < along) lo = mid + 1; else hi = mid; }
  const span = cum[lo] - cum[lo - 1], t = span ? (along - cum[lo - 1]) / span : 0;
  return [path[lo - 1][0] + (path[lo][0] - path[lo - 1][0]) * t, path[lo - 1][1] + (path[lo][1] - path[lo - 1][1]) * t];
}
/** Which way the route runs at `along` (looking a little ahead, so corners turn smoothly rather than snap). */
export const headingAt = (plan: Plan, along: number, ahead = 20) => bearingOf(pointAt(plan, Math.max(0, Math.min(along, plan.total - ahead))), pointAt(plan, along + ahead));

/** A route made ready to follow: its turns placed on its line (in order, never going back). */
export function planOf(route: Route): Plan {
  const path = route.path, cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + metresBetween(path[i - 1], path[i]));
  const total = cum[cum.length - 1], line = { path, cum };
  let prev = 0, byKm = 0;
  const steps: NavStep[] = route.steps.map((s) => {
    const along = s.type === 'depart' ? 0 : s.type === 'arrive' ? total : s.at ? Math.max(prev, snapTo(line, { lon: s.at[0], lat: s.at[1] }, prev).along) : Math.min(total, Math.max(prev, byKm * (total / Math.max(1, route.km * 1000))));
    byKm += s.km * 1000; prev = along;
    return { along, type: s.type, mod: s.mod, name: s.name, text: s.text, sec: s.sec, ...(s.exit ? { exit: s.exit } : {}) };
  });
  // A route without turns still starts and ends.
  if (!steps.length || steps[0].type !== 'depart') steps.unshift({ along: 0, type: 'depart', mod: '', name: '', text: 'Head off', sec: route.minutes * 60 });
  if (steps[steps.length - 1].type !== 'arrive') steps.push({ along: total, type: 'arrive', mod: '', name: '', text: 'You have arrived', sec: 0 });
  return { path, cum, total, steps, sec: steps.reduce((t, s) => t + s.sec, 0) || route.minutes * 60 };
}

export type Progress = { cur: number; next: number; toNext: number; leftM: number; leftSec: number };
/** Where you are in the route: the stretch you're on, the next turn and the metres to it, and what's left (in
 *  metres, and in seconds at the router's pace: the part of this stretch still ahead plus every stretch after it). */
export function progressAt(plan: Plan, along: number): Progress {
  const { steps } = plan;
  let cur = 0;
  for (let i = 0; i < steps.length - 1; i++) if (steps[i].along <= along + 2) cur = i;
  const next = Math.min(cur + 1, steps.length - 1), toNext = Math.max(0, steps[next].along - along), span = steps[next].along - steps[cur].along;
  const leftSec = steps[cur].sec * (span > 0 ? Math.min(1, toNext / span) : 0) + steps.slice(cur + 1).reduce((t, s) => t + s.sec, 0);
  return { cur, next, toNext, leftM: Math.max(0, plan.total - along), leftSec };
}

/** Off the route: further from it than the phone could be wrong about (its accuracy, up to 50 m) allows. */
export const isOff = (off: number, accuracy: number | null, mode: Mode) => off > (mode === 'car' ? 45 : 30) + Math.min(50, Math.max(0, accuracy ?? 0)) * 0.6;
/** Arrived: this close to the end (and on the route). */
export const hasArrived = (p: Progress, off: number, mode: Mode) => p.leftM < (mode === 'car' ? 30 : 15) && off < 60;

// When to speak, in metres before the turn: once early, once again just before it (driving: three times, as the road is faster).
const CUES: Record<Mode, [string, number][]> = { foot: [['early', 120], ['now', 20]], bike: [['early', 220], ['now', 35]], car: [['early', 800], ['soon', 250], ['now', 70]] };
export type Cue = { key: string; kind: 'go' | 'early' | 'now' };
/** What to say now, if anything, and its key (each is said once): "go" (how far the road runs, on a new long stretch),
 *  "early" or "soon" ("In 200 metres, turn left…") and "now" ("Turn left…"). */
export function cueAt(mode: Mode, p: Progress, said: ReadonlySet<string>): Cue | null {
  const marks = CUES[mode];
  let hit: string | null = null;
  for (const [k, m] of marks) if (p.toNext <= m) hit = k;
  if (!hit) return said.has(`${p.cur}:go`) ? null : { key: `${p.cur}:go`, kind: 'go' };
  const key = `${p.next}:${hit}`;
  return said.has(key) ? null : { key, kind: hit === 'now' ? 'now' : 'early' };
}
/** A distance said aloud: "40 metres", "250 metres", "1.5 kilometres". */
export function sayDistance(m: number) {
  if (m >= 950) { const k = Math.round(m / 100) / 10; return `${k} kilometre${k === 1 ? '' : 's'}`; }
  return `${m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50} metres`;
}
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
/** The words of a cue. */
export function cueText(plan: Plan, p: Progress, kind: Cue['kind']): string {
  const cur = plan.steps[p.cur], next = plan.steps[p.next], then = plan.steps[p.next + 1];
  if (kind === 'go') {
    const lead = cur.type === 'depart' ? cur.text : cur.name ? `Continue on ${cur.name}` : 'Continue';
    return `${lead} for ${sayDistance(p.toNext)}${next.type === 'arrive' ? '' : `, then ${lower(next.text)}`}`;
  }
  if (next.type === 'arrive') return kind === 'now' ? 'You have arrived at your destination' : `Your destination is in ${sayDistance(p.toNext)}`;
  if (next.type === 'stop') return kind === 'now' ? 'You have reached your stop' : `Your stop is in ${sayDistance(p.toNext)}`;
  if (kind === 'early') return `In ${sayDistance(p.toNext)}, ${lower(next.text)}`;
  return then && then.type !== 'arrive' && then.along - next.along < 80 ? `${next.text}, then ${lower(then.text)}` : next.text;
}

/** How close the camera follows: walking close in; driving further out the faster you go, and in again before a turn. */
export function followZoom(mode: Mode, speed: number | null, toNext: number) {
  if (mode === 'foot') return 17.6;
  if (mode === 'bike') return 17.1;
  const v = Math.max(0, speed ?? 10);
  return Math.max(15.2, 17 - Math.max(0, v - 8) * 0.08) + (toNext < 250 ? 0.4 : 0);
}
/** The shortest way round from one bearing to another, `t` of the way (0–1). */
export function turnToward(a: number, b: number, t: number) {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

/** The arrow for a turn: its angle from straight ahead (left negative), or one of the special signs. */
export type TurnSign = { angle: number } | { sign: 'uturn' | 'roundabout' | 'arrive' | 'depart' | 'stop' };
export function turnSign(type: string, mod: string): TurnSign {
  if (type === 'arrive') return { sign: 'arrive' };
  if (type === 'stop') return { sign: 'stop' };
  if (type === 'depart') return { sign: 'depart' };
  if (type === 'roundabout' || type === 'rotary' || type === 'exit roundabout' || type === 'exit rotary') return { sign: 'roundabout' };
  if (mod === 'uturn') return { sign: 'uturn' };
  const side = mod.includes('left') ? -1 : mod.includes('right') ? 1 : 0;
  return { angle: side * (mod.startsWith('slight') ? 45 : mod.startsWith('sharp') ? 135 : side ? 90 : 0) };
}

/** "350 m" on the banner, counting down in tens (fives close in). */
export const bannerDistance = (m: number) => (m < 1000 ? `${m < 100 ? Math.max(0, Math.round(m / 5) * 5) : Math.round(m / 10) * 10} m` : distance(m / 1000));
/** The arrival time and how long is left, as the bottom bar shows them. */
export function eta(now: number, leftSec: number) {
  const at = new Date(now + leftSec * 1000), min = Math.max(1, Math.round(leftSec / 60));
  return { at, min };
}

/** M260: where a route's time bubble goes: the point of its line furthest from the other routes (so each bubble
 *  sits on its own line), or the middle when there are none. */
export function bubbleSpot(path: [number, number][], others: [number, number][][]): [number, number] {
  if (!others.length) return path[Math.floor(path.length / 2)];
  const step = Math.max(1, Math.floor(path.length / 60)), rest = others.flatMap((o) => o.filter((_, i) => i % Math.max(1, Math.floor(o.length / 200)) === 0));
  let best = path[Math.floor(path.length / 2)], far = -1;
  for (let i = step; i < path.length - step; i += step) {
    let near = Infinity;
    for (const q of rest) near = Math.min(near, Math.hypot(q[0] - path[i][0], q[1] - path[i][1]));
    if (near > far) { far = near; best = path[i]; }
  }
  return best;
}
