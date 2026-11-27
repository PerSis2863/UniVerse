// Hyperion's discrete-event simulation (M479): entities arrive, wait in queues, are served by stations with one or
// more servers, and move on by routing probabilities, all driven by an event list ordered by time. Statistics per
// station (utilisation, time-weighted queue length, waits, throughput) and for the whole system, a timeline of queue
// lengths and a record of the first entities' journeys for drawing. Seeded, so a run can be repeated. Erlang's formulas
// for M/M/c check it. Our own code from the textbook method (next-event time advance).

export type Dist = { kind: 'exp'; mean: number } | { kind: 'const'; value: number } | { kind: 'uniform'; lo: number; hi: number } | { kind: 'normal'; mean: number; sd: number } | { kind: 'erlang'; mean: number; k: number };
export interface Station { name: string; servers: number; service: Dist; capacity?: number }
export interface Model { arrival: Dist; stations: Station[]; route?: number[][]; first?: number }
export interface StationStats { name: string; served: number; balked: number; utilisation: number; meanQueue: number; maxQueue: number; meanWait: number; maxWait: number; meanService: number }
export interface Journey { id: number; arrive: number; leave: number | null; steps: { station: number; queued: number; start: number; end: number }[] }
export interface Result {
  time: number; arrived: number; finished: number; meanInSystem: number; meanWip: number; throughput: number;
  stations: StationStats[]; timeline: { t: number; q: number[]; busy: number[] }[]; journeys: Journey[]; waits: number[];
}

/** A seeded random number generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function sample(d: Dist, r: () => number): number {
  switch (d.kind) {
    case 'exp': return -d.mean * Math.log(1 - r());
    case 'const': return d.value;
    case 'uniform': return d.lo + (d.hi - d.lo) * r();
    case 'erlang': { let s = 0; for (let i = 0; i < d.k; i++) s += -Math.log(1 - r()); return (s * d.mean) / d.k; }
    case 'normal': { let x = 0; do { x = d.mean + d.sd * Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); } while (x < 0); return x; }
  }
}
export const meanOf = (d: Dist) => (d.kind === 'exp' || d.kind === 'normal' || d.kind === 'erlang' ? d.mean : d.kind === 'const' ? d.value : (d.lo + d.hi) / 2);

/** A binary heap of events by time (ties in the order they were scheduled). */
class Events<T> {
  private h: { t: number; n: number; v: T }[] = [];
  private n = 0;
  get size() { return this.h.length; }
  push(t: number, v: T) {
    const h = this.h, e = { t, n: this.n++, v };
    h.push(e);
    for (let i = h.length - 1; i > 0;) { const p = (i - 1) >> 1; if (h[p].t < e.t || (h[p].t === e.t && h[p].n < e.n)) break; h[i] = h[p]; h[p] = e; i = p; }
  }
  pop() {
    const h = this.h, top = h[0], last = h.pop()!;
    if (h.length) {
      h[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        const less = (a: number, b: number) => h[a].t < h[b].t || (h[a].t === h[b].t && h[a].n < h[b].n);
        if (l < h.length && less(l, m)) m = l;
        if (r < h.length && less(r, m)) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]]; i = m;
      }
    }
    return top;
  }
}

type Ev = { kind: 'arrive' } | { kind: 'done'; station: number; entity: number };
/** Runs the model for `until` time units (or `maxArrivals` entities), from empty. */
export function simulate(model: Model, until: number, seed = 1, opts: { maxArrivals?: number; warmup?: number; keepJourneys?: number } = {}): Result {
  const S = model.stations.length;
  if (!S) throw new Error('Add at least one station.');
  for (const s of model.stations) if (!(s.servers >= 1 && Number.isInteger(s.servers))) throw new Error(`${s.name} needs a whole number of servers (1 or more).`);
  if (!(until > 0)) throw new Error('Run for a time above 0.');
  const route = model.route ?? model.stations.map((_, i) => model.stations.map((__, j) => (j === i + 1 ? 1 : 0)));
  route.forEach((row, i) => { const sum = row.reduce((a, b) => a + b, 0); if (row.length !== S || row.some((p) => p < 0) || sum > 1 + 1e-9) throw new Error(`Routing from ${model.stations[i].name}: one probability per station, none negative, adding to at most 1 (the rest leave).`); });
  const r = rng(seed), maxA = opts.maxArrivals ?? 200_000, warm = opts.warmup ?? 0, keepJ = opts.keepJourneys ?? 60;
  const ev = new Events<Ev>();
  const queues: number[][] = model.stations.map(() => []), busy = new Array(S).fill(0);
  const ent: { arrive: number; queuedAt: number; j?: Journey }[] = [];
  const st = model.stations.map((s) => ({ name: s.name, served: 0, balked: 0, busyArea: 0, qArea: 0, maxQueue: 0, waitSum: 0, waits: 0, maxWait: 0, svcSum: 0 }));
  const timeline: Result['timeline'] = [], journeys: Journey[] = [], waits: number[] = [];
  let now = 0, last = 0, arrived = 0, finished = 0, sysSum = 0, sysCount = 0, wip = 0, wipArea = 0, lastSnap = -Infinity;
  const snapEvery = until / 600;
  const advance = (t: number) => {
    const from = Math.max(last, warm), to = Math.max(t, warm);
    if (to > from) { const dt = to - from; st.forEach((s, i) => { s.busyArea += busy[i] * dt; s.qArea += queues[i].length * dt; }); wipArea += wip * dt; }
    last = t;
  };
  const snap = (force = false) => { if (force || now - lastSnap >= snapEvery) { lastSnap = now; timeline.push({ t: now, q: queues.map((q) => q.length), busy: [...busy] }); } };
  const startService = (i: number, e: number) => {
    busy[i]++;
    const d = sample(model.stations[i].service, r), w = now - ent[e].queuedAt;
    if (now >= warm) { const s = st[i]; s.waitSum += w; s.waits++; s.maxWait = Math.max(s.maxWait, w); s.svcSum += d; waits.push(w); }
    ent[e].j?.steps.push({ station: i, queued: ent[e].queuedAt, start: now, end: now + d });
    ev.push(now + d, { kind: 'done', station: i, entity: e });
  };
  const enter = (i: number, e: number) => {
    ent[e].queuedAt = now;
    const cap = model.stations[i].capacity;
    if (busy[i] < model.stations[i].servers) { startService(i, e); return; }
    if (cap !== undefined && queues[i].length >= cap) { st[i].balked++; leave(e); return; }
    queues[i].push(e);
    st[i].maxQueue = Math.max(st[i].maxQueue, queues[i].length);
  };
  const leave = (e: number) => {
    wip--; finished++;
    if (ent[e].arrive >= warm) { sysSum += now - ent[e].arrive; sysCount++; }
    if (ent[e].j) ent[e].j.leave = now;
  };
  ev.push(sample(model.arrival, r), { kind: 'arrive' });
  while (ev.size) {
    const { t, v } = ev.pop();
    if (t > until) break;
    advance(t); now = t;
    if (v.kind === 'arrive') {
      const e = ent.length;
      ent.push({ arrive: now, queuedAt: now });
      if (journeys.length < keepJ) { const j: Journey = { id: e + 1, arrive: now, leave: null, steps: [] }; journeys.push(j); ent[e].j = j; }
      arrived++; wip++;
      enter(model.first ?? 0, e);
      if (arrived < maxA) ev.push(now + sample(model.arrival, r), { kind: 'arrive' });
    } else {
      const i = v.station;
      busy[i]--;
      if (now >= warm) st[i].served++;
      const nextE = queues[i].shift();
      if (nextE !== undefined) startService(i, nextE);
      // Where the entity goes next.
      let u = r(), to = -1;
      for (let j = 0; j < S; j++) { u -= route[i][j]; if (u < 0) { to = j; break; } }
      if (to >= 0) enter(to, v.entity); else leave(v.entity);
    }
    snap();
  }
  advance(until); now = until; snap(true);
  const span = Math.max(1e-12, until - warm);
  return {
    time: until, arrived, finished, meanInSystem: sysCount ? sysSum / sysCount : NaN, meanWip: wipArea / span, throughput: sysCount / span,
    stations: st.map((s, i) => ({ name: s.name, served: s.served, balked: s.balked, utilisation: s.busyArea / span / model.stations[i].servers, meanQueue: s.qArea / span, maxQueue: s.maxQueue, meanWait: s.waits ? s.waitSum / s.waits : NaN, maxWait: s.maxWait, meanService: s.waits ? s.svcSum / s.waits : NaN })),
    timeline, journeys, waits,
  };
}

/** Erlang's M/M/c results for arrivals at rate λ and service at rate μ per server. */
export function mmc(lambda: number, mu: number, c: number) {
  const a = lambda / mu, rho = a / c;
  if (!(rho < 1)) return { rho, p0: 0, pWait: 1, lq: Infinity, wq: Infinity, w: Infinity, l: Infinity };
  let sum = 0, term = 1;
  for (let k = 0; k < c; k++) { if (k) term *= a / k; sum += term; }
  const last = (term * a) / c / (1 - rho); // a^c / c! / (1 − ρ)
  const p0 = 1 / (sum + last), pWait = last * p0, lq = (pWait * rho) / (1 - rho), wq = lq / lambda;
  return { rho, p0, pWait, lq, wq, w: wq + 1 / mu, l: lq + a };
}
