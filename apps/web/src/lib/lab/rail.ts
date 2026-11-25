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
/** The line as this train sees it every ds metres: positions, limits, the limit held over its length, gradient (‰,
 * with curves). */
function lineFor(t: Train, r: Route, ds: number) {
  const L = routeLength(r), n = Math.round(L / ds) + 1, S = Array.from({ length: n }, (_, i) => Math.min(L, i * ds));
  const lim = S.map((s) => Math.min(t.vmax, sectionAt(r, s).limit)), gradeOf = S.map((s) => { const x = sectionAt(r, s); return x.grade + curveRes(x.radius); });
  // The train's front clears a lower limit only when its tail has: a limit holds back over the train's length.
  const limTail = lim.map((_, i) => { let v = lim[i]; for (let j = i; j >= Math.max(0, i - Math.round(t.length / ds)); j--) v = Math.min(v, lim[j]); return v; });
  return { L, n, S, lim, gradeOf, limTail };
}
export function railRun(t: Train, r: Route, o: { coast?: number; ds?: number } = {}): RailRun {
  const ds = o.ds ?? 5, { L, n, S, lim, gradeOf, limTail } = lineFor(t, r, ds), coast = Math.max(0, Math.min(0.3, o.coast ?? 0)), m = t.mass * 1000, me = m * t.rot;
  void L;
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

// ——— Several trains on one line (M491b) ———
export interface LineTrain { train: Train; depart: number }
export interface TrainTrace { name: string; depart: number; t: number[]; s: number[]; v: number[]; power: number[]; arrive: number; held: number; alone: number }
export interface LineRun { trains: TrainTrace[]; blocks: number[]; signals: 'fixed' | 'moving'; dt: number }
/** Runs trains one after another along the same track (they can't pass), each leaving the first station at its time
 * and stopping at every station. Signalling: fixed blocks (a train may run only up to the entrance of the first block
 * ahead with any part of another train in it, braking to stop there) or moving block (up to the tail of the train ahead
 * less a margin). Steps of `dt` seconds. Each train's `held` is the time it ran slower than it would alone (its
 * signals were the tighter limit), `alone` its time on an empty line. `power` is what it draws from the line (W, at the
 * pantograph: traction / η; braking given back as negative). */
export function railLine(r: Route, trains: LineTrain[], o: { signals?: 'fixed' | 'moving'; block?: number; overlap?: number; margin?: number; dt?: number; until?: number; supply?: (s: number[], p: number[]) => number[] } = {}): LineRun {
  const dt = o.dt ?? 0.5, ds = 5, signals = o.signals ?? 'fixed', block = o.block ?? 1500, overlap = o.overlap ?? 100, margin = o.margin ?? 50;
  const L = routeLength(r), blocks = Array.from({ length: Math.ceil(L / block) + 1 }, (_, i) => Math.min(L, i * block));
  const lines = trains.map((x) => lineFor(x.train, r, ds)), stations = [...r.stations].sort((a, b) => a - b);
  const st = trains.map(() => ({ s: 0, v: 0, dwell: 0, next: 1, started: false, done: false, arrive: NaN, held: 0, volt: 1 }));
  // Its time on an empty line, by the same steps (so a train nobody holds up shows no delay).
  const seen = new Map<Train, number>();
  const alone = (x: LineTrain) => {
    if (trains.length === 1 && !o.supply) return NaN;
    if (!seen.has(x.train)) seen.set(x.train, railLine(r, [{ train: x.train, depart: 0 }], { ...o, supply: undefined, until: undefined }).trains[0].arrive);
    return seen.get(x.train)!;
  };
  const out: TrainTrace[] = trains.map((x) => ({ name: x.train.name, depart: x.depart, t: [], s: [], v: [], power: [], arrive: NaN, held: 0, alone: alone(x) }));
  const until = o.until ?? Math.max(...trains.map((x) => x.depart)) + 6 * Math.max(...trains.map((x) => { const w = railRun(x.train, r).time; return Number.isFinite(w) ? w : 3600; }));
  const at = (k: number, s: number) => Math.min(lines[k].n - 1, Math.max(0, Math.round(s / ds)));
  for (let time = 0; time <= until; time += dt) {
    if (st.every((x) => x.done)) break;
    // The line's voltage at each train (M491c): a share of full power where it sags.
    if (o.supply) { const v = o.supply(st.map((x) => x.s), out.map((x) => (x.power.length ? x.power[x.power.length - 1] : 0))); v.forEach((u, k) => { st[k].volt = u; }); }
    for (let k = 0; k < trains.length; k++) {
      const x = st[k], tr = trains[k].train, ln = lines[k], m = tr.mass * 1000, me = m * tr.rot;
      let P = 0;
      if (!x.done && time >= trains[k].depart) {
        // How far it may go: the next station, and the signals for the train ahead.
        let auth = stations[x.next] ?? L;
        const ahead = k > 0 ? st[k - 1] : null;
        if (ahead && !ahead.done) {
          const tail = ahead.s - trains[k - 1].train.length;
          if (signals === 'moving') auth = Math.min(auth, tail - margin);
          else { const b = blocks.findLast((y) => y <= tail - overlap) ?? 0; auth = Math.min(auth, Math.max(b, x.s <= b ? b : x.s)); }
        }
        if (!x.started) { if (auth - x.s < 1 && x.next < stations.length) { record(); continue; } x.started = true; }
        if (x.dwell > 0) { x.dwell -= dt; } else {
          const i = at(k, x.s), g = ln.gradeOf[i], a = ((tractive(tr, x.v) * x.volt) - resistance(tr, x.v) - (m * G * g) / 1000) / me;
          const toAuth = Math.max(0, auth - x.s), stopV = Math.sqrt(2 * tr.brake * toAuth), alone = Math.min(ln.limTail[Math.min(ln.n - 1, i + 1)], Math.sqrt(2 * tr.brake * Math.max(0, (stations[x.next] ?? L) - x.s)));
          const ceil = Math.min(ln.limTail[Math.min(ln.n - 1, i + 1)], stopV);
          // Never braking harder than it can (a little past service braking): a signal it can't stop for is passed at most to it.
          const nv = Math.max(0, Math.min(x.v + a * dt, ceil), x.v - (tr.brake + 0.5) * dt);
          if (stopV < alone - 0.5 && nv < alone - 0.5) x.held += dt;
          const F = me * ((nv - x.v) / dt) + resistance(tr, (nv + x.v) / 2) + (m * G * g) / 1000, vm = (nv + x.v) / 2;
          P = F > 0 ? (F * vm) / tr.eta : F * vm * tr.eta * tr.regen;
          x.s = Math.min(auth, x.s + vm * dt); x.v = nv;
          // At a station: stop there and wait; at the end: done.
          const stop = stations[x.next];
          if (stop !== undefined && x.s >= stop - 0.5) {
            x.s = stop; x.v = 0;
            if (x.next === stations.length - 1 || stop >= L - 0.5) { x.done = true; x.arrive = time; } else { x.dwell = r.dwell; x.next++; }
          } else if (x.s >= L - 0.5) { x.done = true; x.arrive = time; }
        }
      }
      record();
      function record() { const o2 = out[k]; o2.t.push(time); o2.s.push(x.s); o2.v.push(x.v); o2.power.push(P); }
    }
  }
  out.forEach((o2, k) => { o2.arrive = st[k].arrive; o2.held = st[k].held; if (Number.isNaN(o2.alone)) o2.alone = o2.arrive - o2.depart; });
  return { trains: out, blocks, signals, dt };
}

// ——— The power supply (M491c) ———
// A DC line: substations along it (each a voltage behind a resistance, through diodes, so they can't take power back),
// the contact line and rails between (ohms per km, there and back), and the trains as loads of the power they draw
// (or give back braking). Solved each step as a chain of nodes by position (tridiagonal), the trains' current P / V
// iterated to agree. A train's current is limited at what its power needs at the line's lowest voltage; below its
// nominal voltage it gets that share of its power, under the lowest it trips; braking that would push the line past its
// highest is burnt in the train's resistors.
export interface Supply {
  vnom: number; v0: number; vmin: number; vmax: number; rs: number; rline: number; subs: number[];
  /** A 25 kV AC line (M491d): each substation's transformer reactance (Ω), the line's reactance (Ω/km), the trains'
   * power factor drawing power, and the neutral section's length (m) midway between substations. */
  ac?: { xs: number; xline: number; pf: number; neutral: number; screen?: number; bonded?: boolean };
  /** DC rails' leakage to earth (Ω·km, M491k): 10 new track, 1–3 old or wet; the rails' own resistance is 0.4 of rline. */
  leak?: number;
  /** M491l: the two tracks' rails tied together every few hundred metres (cross-bonded), sharing the return current;
   * and the ground's own resistance along the line (Ω/km), which the stray current must flow through (on AC lines too,
   * M491m: Carson's 0.0493 Ω/km at 50 Hz, `CARSON_50HZ`). */
  crossBond?: boolean;
  earth?: number;
  /** M491n: the soil's resistivity (Ω·m) on AC lines: how deep the ground's return current runs. */
  soil?: number;
  /** Storage on the line (M491g, DC): units at positions (m), each able to take or give `power` (W) and hold
   * `energy` (J); it charges when the line is above `vcharge` (a braking train lifting it) and supports below
   * `vsupport`, each way at `eta`. Batteries or supercapacitors in lineside cabinets. */
  storage?: Storage;
}
export interface Storage { at: number[]; power: number; energy: number; vcharge: number; vsupport: number; eta: number }
/** Lineside storage for a DC supply: 1 MW and 10 kWh a unit (a metro's supercapacitor cabinet), charging a little above
 * the no-load voltage and giving back a little below it (as soon as a train nearby draws power). */
export const storageFor = (sup: Supply, at: number[], power = 1e6, kwh = 10): Storage => (sup.ac
  // AC (M491i): the grid takes braking back, so storage shaves the peaks: it refills while the line is near its no-load
  // voltage (lightly loaded) and gives when it sags under 92% of nominal.
  ? { at, power, energy: kwh * 3.6e6, vcharge: sup.v0 - 0.02 * sup.vnom, vsupport: 0.92 * sup.vnom, eta: 0.95 }
  : { at, power, energy: kwh * 3.6e6, vcharge: sup.v0 + 0.02 * sup.vnom, vsupport: sup.v0 - 0.04 * sup.vnom, eta: 0.95 });
/** Typical DC lines: 750 V (metro, third rail) and 3 kV (main line), substations every 2 km and 15 km. */
export const SUPPLIES: Record<string, (L: number) => Supply> = {
  metro: (L) => ({ vnom: 750, v0: 825, vmin: 500, vmax: 950, rs: 0.02, rline: 0.03, subs: spaced(L, 2000) }),
  intercity: (L) => ({ vnom: 3000, v0: 3400, vmin: 2000, vmax: 3900, rs: 0.08, rline: 0.04, subs: spaced(L, 15000) }),
  // 25 kV 50 Hz (EN 50163: 27.5 kV no-load and highest held, 17.5 kV lowest), feeder stations every 50 km, each a
  // 20 MVA transformer (10%: about 3.1 Ω, mostly reactance). Rail return (booster transformers add a little more):
  // ~0.17 + j0.42 Ω/km; autotransformers (2 × 25 kV) feed at 50 kV, so a train sees about a third of that.
  ac25: (L) => ({ vnom: 25000, v0: 27500, vmin: 17500, vmax: 29000, rs: 0.3, rline: 0.17, subs: spaced(L, 50000), ac: { xs: 3.1, xline: 0.42, pf: 0.95, neutral: 200, screen: 0.5 } }),
  ac25bt: (L) => ({ vnom: 25000, v0: 27500, vmin: 17500, vmax: 29000, rs: 0.3, rline: 0.21, subs: spaced(L, 50000), ac: { xs: 3.1, xline: 0.6, pf: 0.95, neutral: 200, screen: 0.15 } }),
  ac25at: (L) => ({ vnom: 25000, v0: 27500, vmin: 17500, vmax: 29000, rs: 0.3, rline: 0.06, subs: spaced(L, 50000), ac: { xs: 3.1, xline: 0.15, pf: 0.95, neutral: 200, screen: 0.1 } }),
};
/** Substations every `every` metres from the start, the last at the end. */
export function spaced(L: number, every: number) { const n = Math.max(1, Math.round(L / every)); return Array.from({ length: n + 1 }, (_, i) => (L * i) / n); }
export interface SupplyLog { t: number[]; volts: number[][]; minVolt: number[]; subPower: number[][]; lossKw: number[]; fromSubsKwh: number; lossKwh: number; regenUsedKwh: number; regenWastedKwh: number; tripped: number; neutral: number; stuck: number; soc: number[][]; storedKwh: number; returnedKwh: number; emf: number[]; maxEmf: number; maxRail: number; strayAs: number }
/** One moment: the voltage at each train and what each substation gives, for trains at `s` drawing `p` (W). */
export function solveSupply(sup: Supply, s: number[], p: number[], soc: number[] = [], cable?: Cable) {
  if (sup.ac) return sup.storage ? acWithStorage(sup, s, p, soc, cable) : solveAc(sup, s, p, cable);
  type Node = { x: number; sub: boolean; k: number; store?: boolean };
  const st = sup.storage, units = st?.at ?? [];
  const nodes: Node[] = [...sup.subs.map((x, k) => ({ x, sub: true, k })), ...s.map((x, k) => ({ x, sub: false, k })), ...units.map((x, k) => ({ x, sub: false, k, store: true }))].sort((a, b) => a.x - b.x || (a.sub ? -1 : 1));
  const n = nodes.length, V = new Array<number>(n).fill(sup.v0), on = sup.subs.map(() => true), chop = s.map(() => false), GC = 1e3;
  // Storage (M491g): above vcharge (while not full) a conductance GS to vcharge, below vsupport (while not empty) one to
  // vsupport, in the linear solve like a substation; past its power, a fixed current. `mode` is chosen from the last
  // pass's voltage, as the chopper and the diodes are: 0 off, 1 charging, 2 charging at full power, −1 and −2 giving.
  const GS = 20, mode = units.map(() => 0), capOf = (v: number) => (st ? st.power / Math.max(v, 0.5 * sup.vnom) : 0);
  const storeI = (k: number, v: number) => {
    if (!st || !mode[k]) return 0;
    const cap = capOf(v), ref = mode[k] > 0 ? st.vcharge : st.vsupport;
    return Math.abs(mode[k]) === 2 ? Math.sign(mode[k]) * cap : GS * (v - ref);
  };
  const modeOf = (k: number, v: number) => {
    if (!st) return 0;
    const cap = capOf(v), full = (soc[k] ?? 0.5) >= 1, empty = (soc[k] ?? 0.5) <= 0;
    if (v > st.vcharge && !full) return GS * (v - st.vcharge) > cap ? 2 : 1;
    if (v < st.vsupport && !empty) return GS * (st.vsupport - v) > cap ? -2 : -1;
    return 0;
  };
  const G = nodes.slice(1).map((nd, i) => 1 / Math.max(1e-6, (sup.rline * (nd.x - nodes[i].x)) / 1000));
  for (let it = 0; it < (units.length ? 200 : 40); it++) {
    // Kirchhoff at each node: Σ G(V − Vn) + (substation: (V − v0)/rs) + (train: I) = 0, the train's I = P / V.
    const a = new Array<number>(n).fill(0), b = new Array<number>(n).fill(0), c = new Array<number>(n).fill(0), d = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      if (i > 0) { a[i] = -G[i - 1]; b[i] += G[i - 1]; }
      if (i < n - 1) { c[i] = -G[i]; b[i] += G[i]; }
      const nd = nodes[i];
      if (nd.store) {
        const md = mode[nd.k];
        if (Math.abs(md) === 1) { b[i] += GS; d[i] += GS * (md > 0 ? st!.vcharge : st!.vsupport); } else if (md) d[i] -= Math.sign(md) * capOf(V[i]);
        continue;
      }
      if (nd.sub) { if (on[nd.k]) { b[i] += 1 / sup.rs; d[i] += sup.v0 / sup.rs; } else b[i] += 1e-9; }
      // A train's current is limited (its most power at the lowest voltage): without it, loads past what the line can
      // carry have no answer and the voltage collapses.
      else {
        d[i] -= p[nd.k] / Math.max(V[i], p[nd.k] > 0 ? sup.vmin : 1);
        // A braking train's resistors (a chopper) take whatever would lift the line past vmax: a stiff path to vmax.
        if (chop[nd.k]) { b[i] += GC; d[i] += GC * sup.vmax; }
      }
    }
    // Thomas algorithm.
    for (let i = 1; i < n; i++) { const w = a[i] / b[i - 1]; b[i] -= w * c[i - 1]; d[i] -= w * d[i - 1]; }
    const nv = new Array<number>(n);
    nv[n - 1] = d[n - 1] / b[n - 1];
    for (let i = n - 2; i >= 0; i--) nv[i] = (d[i] - c[i] * nv[i + 1]) / b[i];
    let change = 0;
    for (let i = 0; i < n; i++) { change = Math.max(change, Math.abs(nv[i] - V[i])); V[i] = 0.5 * V[i] + 0.5 * Math.max(1, nv[i]); }
    // A substation's diodes block when the line is above its voltage; braking that pushes a train past vmax is cut.
    nodes.forEach((nd, i) => { if (nd.store) mode[nd.k] = modeOf(nd.k, V[i]); else if (nd.sub) on[nd.k] = V[i] < sup.v0 + 1e-6; else if (p[nd.k] < 0) chop[nd.k] = V[i] > sup.vmax; });
    if (change < 1e-3 && it > 3) break;
  }
  const volts = s.map(() => 0), subP = sup.subs.map(() => 0), storePower = units.map(() => 0);
  let loss = 0;
  const given = p.slice();
  nodes.forEach((nd, i) => {
    if (nd.store) storePower[nd.k] = storeI(nd.k, V[i]) * V[i];
    else if (nd.sub) subP[nd.k] = on[nd.k] ? (sup.v0 * Math.max(0, sup.v0 - V[i])) / sup.rs : 0;
    else { volts[nd.k] = V[i]; if (chop[nd.k]) given[nd.k] = Math.min(0, p[nd.k] + GC * Math.max(0, V[i] - sup.vmax) * V[i]); }
    if (i < n - 1) loss += G[i] * (V[i] - V[i + 1]) ** 2;
  });
  const dc = dcStray(sup, s, s.map((_, k) => (given[k] > 0 ? given[k] / Math.max(volts[k], 1) : 0)));
  return { volts, subPower: subP, loss, given, storePower, emf: 0, rail: dc.rail, stray: dc.stray };
}
/** A supply for `railLine`: returns the step function it calls and the log it fills. */
export function supplyFor(sup: Supply, dt: number, cable?: Cable) {
  const log: SupplyLog = { t: [], volts: [], minVolt: [], subPower: [], lossKw: [], fromSubsKwh: 0, lossKwh: 0, regenUsedKwh: 0, regenWastedKwh: 0, tripped: 0, neutral: 0, stuck: 0, soc: [], storedKwh: 0, returnedKwh: 0, emf: [], maxEmf: 0, maxRail: 0, strayAs: 0 };
  let time = 0;
  const gap: number[] = [], soc = (sup.storage?.at ?? []).map(() => 0.5);
  const step = (s: number[], p: number[]) => {
    const r = solveSupply(sup, s, p, soc, cable), j = 3.6e6;
    // Storage: charging fills it at eta, giving empties it at 1 / eta.
    if (sup.storage) {
      const st = sup.storage;
      r.storePower.forEach((w, k) => {
        if (w > 0) { soc[k] = Math.min(1, soc[k] + (w * st.eta * dt) / st.energy); log.storedKwh += (w * dt) / j; }
        else { soc[k] = Math.max(0, soc[k] + (w * dt) / st.eta / st.energy); log.returnedKwh += (-w * dt) / j; }
      });
      log.soc.push(soc.slice());
    }
    log.emf.push(r.emf); log.maxEmf = Math.max(log.maxEmf, r.emf); log.maxRail = Math.max(log.maxRail, ...r.rail); log.strayAs += r.stray * dt;
    const back = p.reduce((q, x) => q + Math.max(0, -x), 0), givenBack = r.given.reduce((q, x) => q + Math.max(0, -x), 0);
    log.t.push(time); log.volts.push(r.volts); log.subPower.push(r.subPower.map((x) => x / 1000)); log.lossKw.push(r.loss / 1000);
    const running = r.volts.filter((_, k) => p[k] !== 0);
    log.minVolt.push(running.length ? Math.min(...running) : sup.v0);
    log.fromSubsKwh += (r.subPower.reduce((q, x) => q + x, 0) * dt) / j; log.lossKwh += (r.loss * dt) / j;
    log.regenUsedKwh += (givenBack * dt) / j; log.regenWastedKwh += ((back - givenBack) * dt) / j;
    time += dt;
    return r.volts.map((v, k) => {
      if (v < sup.vmin && p[k] > 0) { log.tripped += dt; return 0; }
      // An AC train coasts through each neutral section (the two sides are different phases): power off there.
      // One stopped in it would be stuck (a real one needs rescuing): after 30 s it's let through and counted.
      if (sup.ac && neutralAt(sup, s[k])) { gap[k] = (gap[k] ?? 0) + dt; if (gap[k] <= 30) { log.neutral += dt; return 0; } if (gap[k] - dt <= 30) log.stuck++; } else gap[k] = 0;
      return Math.min(1, v / sup.vnom);
    });
  };
  return { step, log };
}

// ——— 25 kV AC (M491d) ———
// Each substation feeds its own stretch, out to the neutral sections midway to its neighbours (they are on different
// phases of the grid, so never joined): every stretch is a tree from its substation, solved by sweeping back (each
// span carries the currents of the trains beyond it) and forward (each train's voltage is the last one's less the
// span's impedance times its current), the trains' currents conj(S / V) iterated to agree. Voltages are phasors: the
// line's reactance and the trains' power factor matter more than its resistance. The grid takes braking back, so it is
// burnt only if it would lift a train past the highest voltage.
type Cx = [number, number];
const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cabs = (a: Cx) => Math.hypot(a[0], a[1]);
/** Midpoints between substations: where the neutral sections are. */
const neutrals = (sup: Supply) => sup.subs.slice(1).map((x, k) => (x + sup.subs[k]) / 2);
export const neutralAt = (sup: Supply, s: number) => !!sup.ac && neutrals(sup).some((m) => Math.abs(s - m) < sup.ac!.neutral / 2);
// ——— Interference from AC lines (M491g) ———
// A 25 kV line's current, returning partly through the ground, induces a voltage along any metal running beside it
// (telephone and signalling cables, pipes). Carson's mutual impedance between the overhead line and a cable `sep` metres
// away, over earth of resistivity ρ (Ω·m), per km at f Hz: π²·f·10⁻⁴ + j·4π·f·10⁻⁴·ln(De / sep), De = 658·√(ρ / f). The
// rails, a return conductor with booster transformers or autotransformers carry current back and cancel part of it:
// the screening factor (rail return ~0.5, BT ~0.15, AT ~0.1, typical figures). A cable runs a feeding section, from
// neutral section to neutral section (it is cut there too); its EMF is |Zm·k·Σ I_train·distance from the substation|.
// Limits (ITU-T's Directives): 60 V in normal running, 430 V while a fault lasts.
export const EMF_LIMIT = 60, EMF_FAULT_LIMIT = 430;
export interface Cable { sep: number; rho: number }
export function mutualZ(c: Cable, f = 50): Cx { return [Math.PI ** 2 * f * 1e-4, 4 * Math.PI * f * 1e-4 * Math.log((658 * Math.sqrt(c.rho / f)) / Math.max(0.1, c.sep))]; }
/** The largest EMF (V) a fault at a feeding section's far end induces in the cable: the fault current there from the
 * no-load voltage through the transformer and the line, times Zm, the screening and the length. Per substation and side. */
export function faultEmf(sup: Supply, c: Cable) {
  if (!sup.ac) return [];
  const mids = neutrals(sup), zm = cabs(mutualZ(c)), k = sup.ac.screen ?? 0.5, out: { sub: number; side: -1 | 1; length: number; current: number; emf: number }[] = [];
  sup.subs.forEach((x0, i) => {
    for (const side of [-1, 1] as const) {
      const end = side === -1 ? (i > 0 ? mids[i - 1] : x0) : i < mids.length ? mids[i] : x0, len = Math.abs(end - x0) / 1000;
      if (len <= 0) continue;
      const fz = feedZ(sup), z = cabs([sup.rs + fz.r * len, sup.ac!.xs + fz.x * len]), I = sup.v0 / z;
      out.push({ sub: i, side, length: len * 1000, current: I, emf: zm * k * I * len });
    }
  });
  return out;
}
// Rail-to-earth voltage on AC lines (M491i): the part of a train's current that returns through the ground (the same
// screening share) leaves the rails along their length; for long rails leaking to earth that is a line of impedance
// z (Ω/km) and leakage resistance r_e (Ω·km): a current I put in at one point lifts the rails there by I·Z0 / 2,
// Z0 = √(|z|·r_e), dying away as e^(−d·√(|z| / r_e)). Rails 0.15 + j0.55 Ω/km on ballast leaking about 5 Ω·km (typical
// figures). EN 50122-1 allows 60 V where people can touch the rails for long.
export const RAIL_Z = Math.hypot(0.15, 0.55), RAIL_RE = 5, RAIL_LIMIT = 60, CARSON_50HZ = 0.0493;
/** Carson's depth of the ground's return current (m) at 50 Hz, and the rails-to-earth reactance it gives (Ω/km). */
export const carsonDepth = (rho: number, f = 50) => 658 * Math.sqrt(rho / f);
// The rails' equivalent radius (~0.146 m) set so 100 Ω·m gives their usual 0.55 Ω/km.
const RAIL_GMR = carsonDepth(100) / Math.exp(0.55 / 0.0628);
export const railReactance = (rho: number) => 0.0628 * Math.log(carsonDepth(rho) / RAIL_GMR);
/** The AC line's own feeding impedance per km (M491o): the contact wire with the rails and the ground coming back. The
 * share of the current returning through the ground (the screening factor) runs at Carson's depth, so the soil changes
 * the loop's reactance by k·0.0628·ln(depth(ρ) / depth(100 Ω·m)) Ω/km (the presets are for 100 Ω·m), and the ground's
 * own resistance (`earth`, Carson's 0.0493 Ω/km at 50 Hz) adds k times that. Unset: the presets' figures. */
export function feedZ(sup: Supply): { r: number; x: number } {
  const ac = sup.ac!, k = ac.screen ?? 0.5;
  return { r: sup.rline + k * (sup.earth ?? 0), x: ac.xline + (sup.soil ? k * 0.0628 * Math.log(carsonDepth(sup.soil) / carsonDepth(100)) : 0) };
}
export function railVolts(sup: Supply, s: number[], amps: number[]) {
  // Cross-bonded (M491l): both tracks' rails in parallel, half the impedance and half the leakage resistance: the same
  // decay, half the voltage.
  // The ground's own impedance (M491m, `earth` Ω/km, Carson's ~0.05 at 50 Hz): as on DC, the rails and the ground are
  // two conductors joined by the leakage: Z0 = |z_r|·√(r_e / |z_r + r_g|), decaying as √(|z_r + r_g| / r_e).
  // The soil (M491n, `soil` Ω·m): the current returning through the ground runs at Carson's depth 658·√(ρ/f) m, so the
  // rails-to-earth loop's reactance is 0.0628·ln(depth / 0.146 m) Ω/km at 50 Hz (0.55 at 100 Ω·m): wet ground (low ρ)
  // keeps it shallower, less reactance; dry rock deeper, more.
  const xs = sup.soil ? railReactance(sup.soil) : 0.55, zr = Math.hypot(0.15, xs), zt = Math.hypot(0.15 + (sup.earth ?? 0), xs);
  const k = sup.ac?.screen ?? 0.5, z0 = (zr * Math.sqrt(RAIL_RE / zt)) / (sup.crossBond ? 2 : 1), g = Math.sqrt(zt / RAIL_RE) / 1000;
  // Bonded to earth at each substation (M491k): an image current there holds the rails at 0 at the bond nearest
  // each train (the one feeding it).
  const bond = (x: number) => sup.subs.reduce((b, y) => (Math.abs(y - x) < Math.abs(b - x) ? y : b), sup.subs[0]);
  return s.map((x) => s.reduce((v, y, j) => {
    const b = bond(y), img = sup.ac?.bonded ? Math.exp(-g * Math.abs(x - b) - g * Math.abs(b - y)) : 0;
    return v + (z0 / 2) * k * amps[j] * Math.abs(Math.exp(-g * Math.abs(x - y)) - img);
  }, 0));
}
// DC stray current (M491k): the current returning along the rails to the substation feeding a train drops I·r·d
// over d km, so floating rails sit at +I·r·d/2 under the train and −I·r·d/2 at the substation, and leak
// I·r·d² / (8·R_leak) into the ground on the way: that current eats the rails, pipes and reinforcement where it
// leaves them (Faraday: about 9.1 kg of iron per ampere-year). EN 50122-2 keeps it small by insulating the rails.
// M491l: cross-bonded tracks put both tracks' rails in parallel (half the resistance, half the leakage resistance):
// half the rail voltage, the same stray current. With the ground's own resistance r_g (Ω/km) the rails and the ground
// are two conductors joined by the leakage: the rails' voltage u'' = γ²u, γ = √((r + r_g)/R), with all of I in the
// rails at both ends, so u = r·I·tanh(γd/2)/γ under the train and the stray current r·I/(r + r_g)·(1 − sech(γd/2)):
// the short-section forms above when γd is small, and never more than r/(r + r_g) of I however poor the insulation.
export function dcStray(sup: Supply, s: number[], amps: number[]) {
  const two = sup.crossBond ? 2 : 1, rr = (0.4 * sup.rline) / two, R = (sup.leak ?? 10) / two, rg = sup.earth;
  const d = s.map((x) => Math.min(...sup.subs.map((y) => Math.abs(y - x))) / 1000);
  if (rg === undefined) return { rail: amps.map((I, k) => (I * rr * d[k]) / 2), stray: amps.reduce((q, I, k) => q + (I * rr * d[k] * d[k]) / (8 * R), 0) };
  const gm = Math.sqrt((rr + rg) / R);
  return {
    rail: amps.map((I, k) => (gm * d[k] > 1e-9 ? (rr * I * Math.tanh((gm * d[k]) / 2)) / gm : (I * rr * d[k]) / 2)),
    stray: amps.reduce((q, I, k) => q + ((rr * I) / (rr + rg)) * (1 - 1 / Math.cosh((gm * d[k]) / 2)), 0),
  };
}
export const IRON_KG_PER_AYEAR = 9.13;
/** AC with storage units: each unit a load at its place (+ charging, − giving), its power from the voltage there, the
 * line solved again until they agree (8 passes, half steps). The units draw at unity power factor. */
function acWithStorage(sup: Supply, s: number[], p: number[], soc: number[], cable?: Cable) {
  const st = sup.storage!, n = s.length, all = [...s, ...st.at];
  let up = st.at.map(() => 0), r = solveAc(sup, all, [...p, ...up], cable, n);
  for (let it = 0; it < 8; it++) {
    const want = st.at.map((_, k) => {
      const v = r.volts[n + k], full = (soc[k] ?? 0.5) >= 1, empty = (soc[k] ?? 0.5) <= 0;
      if (v < st.vsupport && !empty) return -Math.min(st.power, 0.002 * st.power * (st.vsupport - v));
      if (v > st.vcharge && !full) return Math.min(0.3 * st.power, 0.002 * st.power * (v - st.vcharge));
      return 0;
    });
    up = up.map((x, k) => 0.5 * x + 0.5 * want[k]);
    r = solveAc(sup, all, [...p, ...up], cable, n);
  }
  return { ...r, volts: r.volts.slice(0, n), given: r.given.slice(0, n), storePower: up, rail: r.rail.slice(0, n) };
}
function solveAc(sup: Supply, s: number[], p: number[], cable: Cable = { sep: 30, rho: 100 }, trainsOnly = s.length) {
  const ac = sup.ac!, mids = neutrals(sup), n = s.length, tanPhi = Math.tan(Math.acos(Math.max(0.3, Math.min(1, ac.pf))));
  const feeder = s.map((x) => mids.filter((m) => m <= x).length), fz = feedZ(sup), zl: Cx = [fz.r / 1000, fz.x / 1000], zt: Cx = [sup.rs, ac.xs];
  let V: Cx[] = s.map(() => [sup.v0, 0]);
  const given = p.slice(), I: Cx[] = s.map(() => [0, 0]), subI: Cx[] = sup.subs.map(() => [0, 0]);
  let loss = 0;
  for (let it = 0; it < 60; it++) {
    // Each train's current: S = P + jQ (lagging when drawing, unity when braking), I = conj(S / V), limited at what its
    // power needs at the lowest voltage.
    for (let i = 0; i < n; i++) {
      const P = given[i], Q = P > 0 && i < trainsOnly ? P * tanPhi : 0, v = V[i], m2 = v[0] * v[0] + v[1] * v[1] || 1;
      let c: Cx = [(P * v[0] + Q * v[1]) / m2, (P * v[1] - Q * v[0]) / m2];
      const cap = Math.hypot(P, Q) / sup.vmin, k = cabs(c);
      if (k > cap) c = [(c[0] * cap) / k, (c[1] * cap) / k];
      I[i] = c;
    }
    const nv: Cx[] = V.map((x) => [x[0], x[1]]);
    loss = 0;
    sup.subs.forEach((x0, k) => {
      const mine = s.map((_, i) => i).filter((i) => feeder[i] === k), tot: Cx = mine.reduce<Cx>((q, i) => [q[0] + I[i][0], q[1] + I[i][1]], [0, 0]);
      subI[k] = tot;
      const zd = cmul(zt, tot), bus: Cx = [sup.v0 - zd[0], -zd[1]];
      loss += sup.rs * (tot[0] ** 2 + tot[1] ** 2);
      for (const side of [-1, 1]) {
        const out = mine.filter((i) => (s[i] - x0) * side > 0 || (side === 1 && s[i] === x0)).sort((a, b) => Math.abs(s[a] - x0) - Math.abs(s[b] - x0));
        let carry: Cx = out.reduce<Cx>((q, i) => [q[0] + I[i][0], q[1] + I[i][1]], [0, 0]), v: Cx = bus, at = x0;
        for (const i of out) {
          const d = cmul(zl, carry), len = Math.abs(s[i] - at);
          v = [v[0] - d[0] * len, v[1] - d[1] * len]; loss += (fz.r / 1000) * len * (carry[0] ** 2 + carry[1] ** 2);
          nv[i] = v; carry = [carry[0] - I[i][0], carry[1] - I[i][1]]; at = s[i];
        }
      }
    });
    let change = 0;
    V = V.map((x, i) => { change = Math.max(change, cabs([nv[i][0] - x[0], nv[i][1] - x[1]])); return [0.5 * x[0] + 0.5 * nv[i][0], 0.5 * x[1] + 0.5 * nv[i][1]]; });
    // Braking that would lift a train past the highest voltage is cut back (the rest burnt on board).
    s.forEach((_, i) => { if (given[i] < 0 && cabs(V[i]) > sup.vmax) given[i] *= 0.9; });
    if (change < 1e-2 && it > 3) break;
  }
  // The EMF in a cable beside each side of each substation's feeding section: the largest of them.
  const zm = mutualZ(cable), k = ac.screen ?? 0.5;
  let emf = 0;
  sup.subs.forEach((x0, j) => {
    for (const side of [-1, 1]) {
      const sum = s.reduce<Cx>((q, x, i) => (feeder[i] === j && (x - x0) * side > 0 ? [q[0] + I[i][0] * Math.abs(x - x0) / 1000, q[1] + I[i][1] * Math.abs(x - x0) / 1000] : q), [0, 0]);
      emf = Math.max(emf, k * cabs(cmul(zm, sum)));
    }
  });
  // A substation's power from the grid: Re(E·conj(I)); negative while braking trains feed back more than others draw.
  return { volts: V.map(cabs), subPower: subI.map((c) => sup.v0 * c[0]), loss, given, storePower: [] as number[], emf, rail: railVolts(sup, s, I.map(cabs)), stray: 0 };
}

// ——— Single track both ways, with a timetable (M491e) ———
// One track between stations; every station is a passing loop with `tracks` tracks (2: a train each way). A train may
// leave a station only at or after its timetabled time, only into an empty section (no train either way in it: an
// absolute block), and only when the next station has a free track for it (taken when it leaves, so two trains never
// meet head-on between stations). First come, first served; when two ask at once the earlier timetable goes first.
// The timetable is each train's run alone, padded by `pad` (5% recovery time is usual) plus the dwells.
// Single track (M491e), with passing loops between stations, trains that don't stop everywhere, branch trains joining
// or leaving at a junction station, and a dispatcher (M491f).
/** `skip`: stations (forward indices) it runs through; `from` / `to`: the stations (forward indices) it starts and ends
 * at, for a train joining from or leaving to a branch at a junction; `priority` weighs its delay for the dispatcher. */
export interface SingleTrain { train: Train; dir: 1 | -1; depart: number; late?: number; skip?: number[]; from?: number; to?: number; priority?: number }
/** `nodes` are the forward positions of the places it passes (stations and loops) in its own order, `stops` whether it
 * stops at each; `plan` and `actual` hold a time for each: when it left the first, then when it reached each next one. */
export interface SingleTrace { name: string; dir: 1 | -1; depart: number; t: number[]; s: number[]; nodes: number[]; stops: boolean[]; plan: number[]; actual: number[]; waits: { at: number; seconds: number; for: 'meet' | 'follow' | 'dispatch' }[]; arrive: number; delay: number; priority: number }
export interface Conflict { section: number; a: number; b: number; from: number; to: number; meet: boolean }
export type Dispatch = 'fcfs' | 'priority' | 'best';
export interface SingleRun { trains: SingleTrace[]; stations: number[]; loops: number[]; nodes: number[]; conflicts: Conflict[]; deadlock: number; totalDelay: number; dispatch: Dispatch; firstCome: number }
/** The route as a train running the other way sees it: sections reversed, slopes turned over. */
export function reversed(r: Route): Route {
  const L = routeLength(r);
  return { ...r, sections: [...r.sections].reverse().map((x) => ({ ...x, grade: -x.grade })), stations: r.stations.map((s) => L - s).sort((a, b) => a - b) };
}
/** `loopLength` (m, M491j): how long a train each passing loop holds; a longer one can't wait there (stations hold any). */
interface SingleOpts { tracks?: number; pad?: number; dt?: number; loops?: number[]; dispatch?: Dispatch; loopLength?: number }
/** The weighted delay a dispatcher minimises: Σ priority × minutes late (early counts 0); a lock-up costs far more. */
const weighed = (run: { trains: SingleTrace[]; deadlock: number }) => (Number.isFinite(run.deadlock) ? 1e9 : run.trains.reduce((s, x) => s + x.priority * Math.max(0, Number.isFinite(x.delay) ? x.delay : 1e6), 0));
/** Runs the trains; `o.dispatch`: first come first served (the earliest timetable asks first, nobody is held back),
 * by priority (a train is held at a station when a more important one facing it would otherwise wait for it), or the
 * best order found by trying every swap of two trains' ranks until none cuts the weighted delay. */
export function railSingle(r: Route, trains: SingleTrain[], o: SingleOpts = {}): SingleRun {
  const mode = o.dispatch ?? 'fcfs', byDepart = trains.map((_, k) => k).sort((a, b) => trains[a].depart - trains[b].depart);
  const rankOf = (order: number[]) => { const rk = new Array<number>(trains.length); order.forEach((k, i) => { rk[k] = i; }); return rk; };
  const fcfs = singleRun(r, trains, o, null), firstCome = weighed(fcfs);
  if (mode === 'fcfs' || trains.length < 2) return { ...fcfs, dispatch: mode, firstCome };
  const pr = (k: number) => trains[k].priority ?? 1;
  let order = [...byDepart].sort((a, b) => pr(b) - pr(a) || trains[a].depart - trains[b].depart), best = singleRun(r, trains, o, rankOf(order)), cost = weighed(best);
  if (mode === 'best') {
    // Local search over the ranks: every swap of two, keeping any that cuts the weighted delay (at most 4 rounds).
    for (let round = 0, better = true; better && round < 4; round++) {
      better = false;
      for (let a = 0; a < order.length; a++) for (let b = a + 1; b < order.length; b++) {
        const next = [...order]; [next[a], next[b]] = [next[b], next[a]];
        const run = singleRun(r, trains, o, rankOf(next)), c = weighed(run);
        if (c < cost - 1e-6) { order = next; best = run; cost = c; better = true; }
      }
    }
  }
  // Never worse than first come, first served (holding trains back can lock the line up where it wouldn't have).
  if (mode === 'best' ? firstCome <= cost : Number.isFinite(best.deadlock) && !Number.isFinite(fcfs.deadlock)) return { ...fcfs, dispatch: mode, firstCome };
  return { ...best, dispatch: mode, firstCome };
}
function singleRun(r: Route, trains: SingleTrain[], o: SingleOpts, rank: number[] | null): Omit<SingleRun, 'dispatch' | 'firstCome'> {
  const dt = o.dt ?? 0.5, pad = o.pad ?? 0.05, tracks = Math.max(1, o.tracks ?? 2), ds = 5, L = routeLength(r), back = reversed(r);
  const stations = [...r.stations].sort((a, b) => a - b), loops = [...new Set(o.loops ?? [])].filter((x) => x > 0 && x < L && !stations.includes(x)).sort((a, b) => a - b);
  const nodes = [...stations, ...loops].sort((a, b) => a - b), N = nodes.length, isStation = nodes.map((x) => stations.includes(x));
  const lines = trains.map((x) => lineFor(x.train, x.dir === 1 ? r : back, ds));
  // Each train's path: forward node indices in its own order, its own distance to each, and where it stops.
  const paths = trains.map((x) => {
    const a = nodes.indexOf(stations[x.from ?? (x.dir === 1 ? 0 : stations.length - 1)]), b = nodes.indexOf(stations[x.to ?? (x.dir === 1 ? stations.length - 1 : 0)]);
    const seq: number[] = [];
    for (let j = a; x.dir === 1 ? j <= b : j >= b; j += x.dir) seq.push(j);
    const skip = new Set((x.skip ?? []).map((q) => nodes.indexOf(stations[q])));
    const stop = seq.map((j, i) => i === 0 || i === seq.length - 1 || (isStation[j] && !skip.has(j)));
    return { seq, at: seq.map((j) => (x.dir === 1 ? nodes[j] : L - nodes[j])), stop };
  });
  // One step towards a stop at `to` (its own distance): the lower of the limit and the brake curve.
  const step = (k: number, x: { s: number; v: number }, to: number) => {
    const tr = trains[k].train, ln = lines[k], m = tr.mass * 1000, me = m * tr.rot, i = Math.min(ln.n - 1, Math.max(0, Math.round(x.s / ds)));
    const a = (tractive(tr, x.v) - resistance(tr, x.v) - (m * G * ln.gradeOf[i]) / 1000) / me;
    const nv = Math.max(0, Math.min(x.v + a * dt, ln.limTail[Math.min(ln.n - 1, i + 1)], Math.sqrt(2 * tr.brake * Math.max(0, to - x.s))), x.v - (tr.brake + 0.5) * dt);
    x.s = Math.min(to, x.s + ((nv + x.v) / 2) * dt); x.v = nv;
    // Crawls the last half metre (the brake curve's square root never quite reaches the stop).
    if (to - x.s < 0.5 || (x.v < 0.05 && to - x.s < 5)) { x.s = to; x.v = 0; return true; }
    return false;
  };
  // The timetable: each train alone (through the places it doesn't stop at), padded, with the dwells.
  const plan = trains.map((x, k) => {
    const { at, stop } = paths[k], times = [x.depart], p = { s: 0 + at[0], v: 0 };
    let run = 0, dwells = 0, i = 1;
    while (i < at.length) {
      let nx = i; while (!stop[nx]) nx++;
      let t = 0;
      for (;;) {
        const done = step(k, p, at[nx]); t += dt;
        while (i < nx && p.s >= at[i]) { times.push(x.depart + (run + t) * (1 + pad) + dwells); i++; }
        if (done || t > 6 * 3600) break;
      }
      run += t; times.push(x.depart + run * (1 + pad) + dwells); i = nx + 1;
      if (i < at.length) dwells += r.dwell;
    }
    return times;
  });
  // Conflicts in the timetable: two trains planned in the same section (between neighbouring places) at overlapping times.
  const span = (k: number, sec: number): [number, number] | null => {
    const { seq, stop } = paths[k], ia = seq.indexOf(trains[k].dir === 1 ? sec : sec + 1);
    if (ia < 0 || ia + 1 >= seq.length) return null;
    return [plan[k][ia] + (ia > 0 && stop[ia] ? r.dwell : 0), plan[k][ia + 1]];
  };
  const conflicts: Conflict[] = [];
  for (let a = 0; a < trains.length; a++) for (let b = a + 1; b < trains.length; b++) for (let sec = 0; sec < N - 1; sec++) {
    const A = span(a, sec), B = span(b, sec);
    if (A && B && A[0] < B[1] && B[0] < A[1]) conflicts.push({ section: sec, a, b, from: Math.max(A[0], B[0]), to: Math.min(A[1], B[1]), meet: trains[a].dir !== trains[b].dir });
  }
  // The run. `i` is the index (in its path) of the last place it reached, `res` how many sections ahead it holds.
  const st = trains.map((x, k) => ({ s: paths[k].at[0], v: 0, i: 0, res: 0, ready: x.depart + (x.late ?? 0), done: false, present: false, waited: 0, why: 'meet' as 'meet' | 'follow' | 'dispatch' }));
  const out: SingleTrace[] = trains.map((x, k) => ({ name: x.train.name, dir: x.dir, depart: x.depart, t: [], s: [], nodes: paths[k].seq.map((j) => nodes[j]), stops: paths[k].stop, plan: plan[k], actual: [], waits: [], arrive: NaN, delay: NaN, priority: x.priority ?? 1 }));
  const owner = new Array<number>(N - 1).fill(-1), holding = new Array<number>(N).fill(0), terminal = (j: number) => j === 0 || j === N - 1;
  const secOf = (k: number, i: number) => Math.min(paths[k].seq[i], paths[k].seq[i + 1]);
  // Trains starting at the line's ends are there from the start; a branch train appears at its junction when due.
  st.forEach((x, k) => { if (terminal(paths[k].seq[0])) { x.present = true; holding[paths[k].seq[0]]++; } });
  const late = (k: number) => { const x = st[k], n = out[k].actual.length; return n ? out[k].actual[n - 1] - plan[k][n - 1] : x.ready - trains[k].depart; };
  // The dispatcher: does a more important train, facing k, reach this section before k would be through it?
  const yields = (k: number, sec: number, time: number, clear: number) => {
    if (!rank) return false;
    for (let q = 0; q < trains.length; q++) {
      if (q === k || st[q].done || rank[q] > rank[k]) continue;
      const { seq } = paths[q], ia = seq.indexOf(trains[q].dir === 1 ? sec : sec + 1), passed = st[q].i + st[q].res;
      if (ia < 0 || ia + 1 >= seq.length || ia < passed) continue;
      // The same way (M491h): only a train behind it, which would catch it up in this section: k waits in the loop and
      // is overtaken (a train standing at the same place is behind too, if it ranks higher).
      if (trains[q].dir === trains[k].dir && (st[q].i > paths[q].seq.indexOf(paths[k].seq[st[k].i]) || paths[q].seq.indexOf(paths[k].seq[st[k].i]) < 0)) continue;
      if (Math.max(time, plan[q][ia] + late(q)) < clear) return true;
    }
    return false;
  };
  // Tries to take the next section after the place at path index e (where its holding ends); true when taken.
  // A train too long for a loop can't stop in it (M491j): it takes the section beyond at the same time or not at all.
  const fits = (k: number, j: number) => isStation[j] || trains[k].train.length <= (o.loopLength ?? Infinity);
  const free = (k: number, e: number, time: number) => {
    const { seq } = paths[k], sec = secOf(k, e), nxt = seq[e + 1], x = st[k], through = !fits(k, nxt) && !paths[k].stop[e + 1];
    const other = owner[sec], room = terminal(nxt) || e + 1 === seq.length - 1 || through || holding[nxt] < tracks;
    if (other >= 0 || !room) { x.why = other >= 0 ? (trains[other].dir === trains[k].dir ? 'follow' : 'meet') : 'meet'; return false; }
    if (yields(k, sec, time, time + plan[k][e + 1] - plan[k][e])) { x.why = 'dispatch'; return false; }
    return true;
  };
  /** Takes the next section after the place at path index e (two when it can't wait in the next): how many it took. */
  const take = (k: number, e: number, time: number) => {
    const { seq, stop } = paths[k], nxt = seq[e + 1];
    if (!free(k, e, time)) return 0;
    if (!fits(k, nxt) && !stop[e + 1]) {
      if (e + 2 >= seq.length || !free(k, e + 1, time)) return 0;
      owner[secOf(k, e)] = k; owner[secOf(k, e + 1)] = k; holding[seq[e]]--; holding[seq[e + 2]]++;
      return 2;
    }
    owner[secOf(k, e)] = k; holding[seq[e]]--; holding[nxt]++;
    return 1;
  };
  const order = trains.map((_, k) => k).sort((a, b) => (rank ? rank[a] - rank[b] : plan[a][0] - plan[b][0]));
  const tails: [number, number][][] = trains.map(() => []);
  let stuckFor = 0, deadlock = NaN;
  const until = Math.max(...plan.map((p) => p[p.length - 1])) * 3 + 7200;
  for (let time = 0; time <= until; time += dt) {
    if (st.every((x) => x.done)) break;
    let moved = false;
    for (const k of order) {
      const x = st[k], { seq, at, stop } = paths[k];
      if (x.done || time < x.ready) continue;
      if (!x.present) { if (holding[seq[0]] < tracks) { x.present = true; holding[seq[0]]++; moved = true; } else { x.waited += dt; continue; } }
      if (x.res === 0) {
        // Standing: leaves no earlier than its timetable.
        const want = Math.max(x.ready, plan[k][x.i] + (x.i > 0 && stop[x.i] ? r.dwell : 0));
        if (time < want) continue;
        const got = take(k, x.i, time);
        if (got) {
          x.res = got; moved = true;
          if (x.waited > dt) out[k].waits.push({ at: nodes[seq[x.i]], seconds: x.waited, for: x.why });
          x.waited = 0;
          if (x.i === 0) out[k].actual.push(time);
        } else x.waited += dt;
      } else {
        // Running towards a place it needn't stop at: asks for the section beyond once within braking distance (+200 m).
        const e = x.i + x.res, tr = trains[k].train;
        if (e < seq.length - 1 && !stop[e] && at[e] - x.s <= (x.v * x.v) / (2 * tr.brake) + 200) { x.res += take(k, e, time); }
      }
    }
    for (let k = 0; k < trains.length; k++) {
      const x = st[k], { seq, at } = paths[k];
      if (x.res > 0) {
        moved = true;
        const e = x.i + x.res, stopped = step(k, x, at[e]);
        // Passing a place: the section behind is free.
        while (x.res > 0 && (x.s >= at[x.i + 1] - 1e-9) && (x.i + 1 < e || stopped)) {
          // The section behind is freed once the train's tail has left it (M491h), or as it stops in the place.
          tails[k].push([secOf(k, x.i), at[x.i + 1] + trains[k].train.length]); x.i++; x.res--; out[k].actual.push(time);
          if (x.res > 0) { /* ran through */ } else if (x.i === seq.length - 1) { x.done = true; out[k].arrive = time; out[k].delay = time - plan[k][seq.length - 1]; holding[seq[x.i]]--; } else x.ready = time + (paths[k].stop[x.i] ? r.dwell : 0);
        }
      }
      tails[k] = tails[k].filter(([sec, end]) => { const gone = x.res === 0 || x.s >= end; if (gone) owner[sec] = -1; return !gone; });
      out[k].t.push(time); out[k].s.push(trains[k].dir === 1 ? x.s : L - x.s);
    }
    // Nothing moving and nobody waiting on the clock: stuck for good.
    const clock = st.some((x, k) => !x.done && x.res === 0 && (time < x.ready || time < plan[k][x.i] + (x.i > 0 && paths[k].stop[x.i] ? r.dwell : 0)));
    stuckFor = moved || clock ? 0 : stuckFor + dt;
    if (stuckFor > 600) { deadlock = time; break; }
  }
  return { trains: out, stations, loops, nodes, conflicts, deadlock, totalDelay: out.reduce((s, x) => s + Math.max(0, Number.isFinite(x.delay) ? x.delay : 0), 0) };
}
