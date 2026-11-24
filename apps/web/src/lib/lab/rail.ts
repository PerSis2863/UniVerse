// Hyperion's railways (M491), pure: a train (mass, rotating-mass factor, the Davis resistance A + Bv + Cv², the most
// tractive effort and the power behind it, service braking) driven along a route of sections (length, gradient,
// curve radius, speed limit) with stations to stop at. The fastest run is the lower of a forward pass (full power up to
// each limit) and backward braking curves from every stop and lower limit; an energy-saving style cruises a little under
// the limits and coasts into each brake, trading seconds for kilowatt-hours. Also the energy used and given back, and
// how close trains can follow under fixed-block signalling or moving block.

export const G = 9.81;
export interface Train {
  name: string;
  /** Mass (t), rotating-mass factor, length (m). */
  mass: number; rot: number; length: number;
  /** Davis resistance: A (N), B (N per m/s), C (N per (m/s)²). */
  A: number; B: number; C: number;
  /** Most tractive effort (N), power at the wheels (W), top speed (m/s), service braking (m/s²), drive efficiency and the
   * share of braking given back to the line. */
  f0: number; power: number; vmax: number; brake: number; eta: number; regen: number;
}
export const TRAINS: Record<string, Train> = {
  metro: { name: 'metro', mass: 200, rot: 1.08, length: 100, A: 3000, B: 60, C: 4, f0: 260e3, power: 2.4e6, vmax: 80 / 3.6, brake: 1.0, eta: 0.85, regen: 0.6 },
  intercity: { name: 'intercity', mass: 400, rot: 1.06, length: 200, A: 6500, B: 130, C: 6, f0: 300e3, power: 6e6, vmax: 200 / 3.6, brake: 0.7, eta: 0.85, regen: 0.5 },
  freight: { name: 'freight', mass: 2000, rot: 1.04, length: 600, A: 25000, B: 300, C: 10, f0: 400e3, power: 4e6, vmax: 100 / 3.6, brake: 0.35, eta: 0.85, regen: 0.2 },
};
export const resistance = (t: Train, v: number) => t.A + t.B * v + t.C * v * v;
export const tractive = (t: Train, v: number) => Math.min(t.f0, t.power / Math.max(v, 0.1));
/** Curve resistance by Röckl (‰ of the weight): 650 / (R − 55) for R ≥ 300 m, 500 / (R − 30) below. */
export const curveRes = (R: number) => (!R || R <= 0 ? 0 : R >= 300 ? 650 / (R - 55) : 500 / Math.max(R - 30, 1));

export interface Section { length: number; grade: number; radius: number; limit: number }
export interface Route { name: string; sections: Section[]; stations: number[]; dwell: number }
const kmh = (x: number) => x / 3.6;
/** A metro line (stations every ~1 km), an intercity line (100 km, hills and curves, two stops), a mountain line. */
export const ROUTES: Record<string, () => Route> = {
  metro: () => ({ name: 'metro', dwell: 30, stations: [0, 900, 2100, 3000, 4300, 5200], sections: [{ length: 1500, grade: 0, radius: 0, limit: kmh(80) }, { length: 600, grade: 20, radius: 400, limit: kmh(60) }, { length: 1600, grade: -10, radius: 0, limit: kmh(80) }, { length: 1500, grade: 5, radius: 0, limit: kmh(80) }] }),
  intercity: () => ({ name: 'intercity', dwell: 120, stations: [0, 42000, 100000], sections: [{ length: 3000, grade: 0, radius: 0, limit: kmh(100) }, { length: 20000, grade: 4, radius: 0, limit: kmh(200) }, { length: 8000, grade: -6, radius: 1500, limit: kmh(160) }, { length: 11000, grade: 0, radius: 0, limit: kmh(200) }, { length: 30000, grade: 2, radius: 0, limit: kmh(200) }, { length: 6000, grade: 10, radius: 900, limit: kmh(120) }, { length: 19000, grade: -3, radius: 0, limit: kmh(200) }, { length: 3000, grade: 0, radius: 0, limit: kmh(100) }] }),
  mountain: () => ({ name: 'mountain', dwell: 60, stations: [0, 18000], sections: [{ length: 2000, grade: 0, radius: 0, limit: kmh(100) }, { length: 6000, grade: 25, radius: 350, limit: kmh(70) }, { length: 4000, grade: 25, radius: 250, limit: kmh(60) }, { length: 6000, grade: 0, radius: 0, limit: kmh(100) }] }),
};
export const routeLength = (r: Route) => r.sections.reduce((s, x) => s + x.length, 0);
/** The section at distance s. */
export function sectionAt(r: Route, s: number): Section {
  let at = 0;
  for (const x of r.sections) { if (s < at + x.length) return x; at += x.length; }
  return r.sections[r.sections.length - 1];
}

export interface RailRun { stalled: number; s: number[]; v: number[]; t: number[]; limit: number[]; grade: number[]; mode: ('power' | 'cruise' | 'coast' | 'brake' | 'stop')[]; time: number; energyKwh: number; regenKwh: number; arrivals: number[] }
/** Runs the train along the route, 5 m at a time. `coast` (0–0.3) is the driving style: 0 the fastest, more cruises that
 * share under each limit and coasts into every brake, from cruise down to (1 − 2·coast) of it. `stalled` is where a
 * slope too steep for the train stopped it (NaN when it gets through; the time is then Infinity). */
export function railRun(t: Train, r: Route, o: { coast?: number; ds?: number } = {}): RailRun {
  const ds = o.ds ?? 5, L = routeLength(r), n = Math.round(L / ds) + 1, coast = Math.max(0, Math.min(0.3, o.coast ?? 0)), m = t.mass * 1000, me = m * t.rot;
  const S = Array.from({ length: n }, (_, i) => Math.min(L, i * ds));
  const lim = S.map((s) => Math.min(t.vmax, sectionAt(r, s).limit)), gradeOf = S.map((s) => { const x = sectionAt(r, s); return x.grade + curveRes(x.radius); });
  // The train's front clears a lower limit only when its tail has: a limit holds back over the train's length.
  const limTail = lim.map((_, i) => { let v = lim[i]; for (let j = i; j >= Math.max(0, i - Math.round(t.length / ds)); j--) v = Math.min(v, lim[j]); return v; });
  const stops = new Set(r.stations.map((s) => Math.round(s / ds)));
  const cap = limTail.map((v) => v * (1 - coast));
  // Backward: braking curves (service braking, the slope helping or not) from every stop and every lower limit ahead.
  const brakeV = new Array<number>(n).fill(Infinity);
  for (let i = n - 1; i >= 0; i--) {
    if (stops.has(i) || i === n - 1) { brakeV[i] = 0; continue; }
    const next = Math.min(brakeV[i + 1], cap[i + 1]), dec = t.brake + (G * gradeOf[i]) / 1000;
    brakeV[i] = Math.sqrt(next * next + 2 * Math.max(0.05, dec) * ds);
  }
  // Backward: coasting curves into each brake (only resistance and slope slow it), when the style asks.
  const coastV = new Array<number>(n).fill(Infinity);
  if (coast > 0) for (let i = n - 2; i >= 0; i--) {
    if (stops.has(i)) continue;
    // Coasting ends where the brake curve has come down to (1 − 2·coast) of the cruise: the style sets how far it coasts.
    const floor = (1 - 2 * coast) * cap[i + 1], next = Math.min(coastV[i + 1], brakeV[i + 1] >= floor ? brakeV[i + 1] : Infinity);
    if (!Number.isFinite(next)) continue;
    const dec = (resistance(t, next) + (m * G * gradeOf[i]) / 1000) / me;
    coastV[i] = dec > 0.005 ? Math.sqrt(next * next + 2 * dec * ds) : Infinity;
  }
  // Forward: full power to whichever is lowest.
  const v = new Array<number>(n).fill(0), mode: RailRun['mode'] = new Array(n).fill('stop');
  // A driver coasts only once the train has got up to its cruising speed since the last stop.
  let cruised = false, stalled = NaN;
  for (let i = 0; i < n - 1; i++) {
    if (v[i] >= cap[i] - 0.5) cruised = true;
    const vi = v[i], a = (tractive(t, vi) - resistance(t, vi) - (m * G * gradeOf[i]) / 1000) / me;
    const free = Math.sqrt(Math.max(0, vi * vi + 2 * a * ds)), ceiling = Math.min(cap[i + 1], brakeV[i + 1]);
    let nv = Math.min(free, ceiling), md: RailRun['mode'][number] = free <= ceiling ? 'power' : cap[i + 1] <= brakeV[i + 1] ? 'cruise' : 'brake';
    if (coast > 0 && cruised && coastV[i + 1] < nv && coastV[i + 1] <= brakeV[i + 1] + 1e-9 && vi > 1) {
      // Coasting: what resistance and the slope leave.
      const ca = -(resistance(t, vi) + (m * G * gradeOf[i]) / 1000) / me;
      nv = Math.min(ceiling, Math.sqrt(Math.max(0, vi * vi + 2 * ca * ds)));
      md = 'coast';
    }
    if (stops.has(i + 1)) { nv = 0; cruised = false; }
    // Stalled: the slope and resistance beat the most it can pull (a hill too steep for this train).
    if (nv < 0.05 && !stops.has(i + 1) && !stops.has(i)) { stalled = S[i]; for (let j = i + 1; j < n; j++) { v[j] = 0; mode[j] = 'stop'; } break; }
    v[i + 1] = nv; mode[i] = vi === 0 && nv === 0 ? 'stop' : md;
  }
  // Time, energy at the line (traction / η; braking × η × the share given back).
  const T = [0], arrivals: number[] = [];
  let e = 0, back = 0;
  const last = Number.isNaN(stalled) ? n - 1 : Math.round(stalled / ds);
  for (let i = 0; i < n - 1; i++) {
    if (i >= last) { T.push(T[i]); continue; }
    const vm = (v[i] + v[i + 1]) / 2, dt = vm > 0.01 ? ds / vm : 0, a = (v[i + 1] ** 2 - v[i] ** 2) / (2 * ds);
    const F = me * a + resistance(t, vm) + (m * G * gradeOf[i]) / 1000;
    if (mode[i] !== 'coast' && F > 0) e += (F * ds) / t.eta;
    if (F < 0) back += -F * ds * t.eta * t.regen;
    let tt = T[i] + dt;
    if (stops.has(i + 1) && i + 1 < n - 1) { arrivals.push(tt); tt += r.dwell; }
    T.push(tt);
  }
  if (Number.isNaN(stalled)) arrivals.push(T[n - 1]);
  return { stalled, s: S, v, t: T, limit: lim, grade: gradeOf, mode, time: Number.isNaN(stalled) ? T[n - 1] : Infinity, energyKwh: (e - back) / 3.6e6, regenKwh: back / 3.6e6, arrivals };
}

/** How close trains can follow at speed v (m/s): fixed blocks (the train ahead must have cleared `blocks` blocks of
 * `block` metres and the overlap; the follower sees the signal `sight` m ahead) or moving block (its braking distance
 * plus a margin behind the train ahead). Headway in seconds and trains an hour. */
export function headway(t: Train, v: number, o: { block?: number; blocks?: number; overlap?: number; reaction?: number; moving?: boolean; margin?: number } = {}) {
  const brakeDist = (v * v) / (2 * t.brake), react = o.reaction ?? 10;
  const gap = o.moving ? brakeDist + (o.margin ?? 50) : Math.max((o.blocks ?? 3) * (o.block ?? 1500), brakeDist + (o.block ?? 1500)) + (o.overlap ?? 200);
  const h = (gap + t.length) / Math.max(v, 1) + react;
  return { headway: h, perHour: 3600 / h, gap, brakeDist };
}
