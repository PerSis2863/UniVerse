// Hyperion's data-centre power (M571, the owner's MathWorks list, "Hyperscalers and data center developers"): the
// electricity an accelerator, a server, a rack and a whole campus draws, from the work it is doing. A chip draws its
// idle power plus a share of the rest by how busy it is; a server adds its processors, memory and fans (fans by the
// cube of their speed, faster when the air in is warm) behind a power supply whose losses grow with load; an AI
// training job swings its chips together between computing and exchanging results, with dips to idle at checkpoints,
// so a whole hall's power moves in steps of tens of megawatts. The facility adds the UPS and distribution losses and
// the cooling (a chiller's COP as a share of Carnot's, free cooling when the air outside is cold enough), so PUE comes
// out hour by hour; a campus built in phases and filling up over months gives the gigawatt-scale demand year by year.
// Our own models from the standard textbook relations; the numbers are typical, not any maker's. Pure.

export interface Chip { idle: number; tdp: number; exp: number }
/** Typical accelerators and processors (W): the idle draw and the most it draws (thermal design power). */
export const CHIPS: Record<string, Chip> = {
  gpu700: { idle: 90, tdp: 700, exp: 1 }, gpu1000: { idle: 140, tdp: 1000, exp: 1 }, gpu1200: { idle: 160, tdp: 1200, exp: 1 },
  tpu: { idle: 60, tdp: 350, exp: 1 }, cpu: { idle: 55, tdp: 350, exp: 0.8 },
};
/** A chip's power (W) at utilisation u (0 to 1). */
export const chipPower = (u: number, c: Chip) => c.idle + (c.tdp - c.idle) * Math.max(0, Math.min(1, u)) ** c.exp;

export interface Server { chips: number; chip: Chip; cpus: number; base: number; fans: number; psu: number }
/** A power supply's losses (W) at output P on a supply rated R: no-load, linear and resistive parts (about 96% at half
 * load, 89% at a tenth: a modern high-efficiency unit). */
export const psuLoss = (P: number, R: number) => { const x = P / R; return R * (0.01 + 0.02 * x + 0.015 * x * x); };
/** A server's wall power (W) at accelerator utilisation u and inlet air tin (°C), and its parts. The processors run at
 * a third of the accelerators' load plus a tenth; the fans at the speed the heat and the inlet ask for (cube law). */
export function serverPower(s: Server, u: number, tin = 25) {
  const acc = s.chips * chipPower(u, s.chip), cpu = s.cpus * chipPower(0.1 + u / 3, CHIPS.cpu), heat = acc + cpu + s.base;
  const full = s.chips * s.chip.tdp + s.cpus * CHIPS.cpu.tdp + s.base;
  const speed = Math.max(0.3, Math.min(1, (0.3 + 0.7 * (heat / full)) * (1 + 0.04 * Math.max(0, tin - 25))));
  const fans = s.fans * speed ** 3, dc = heat + fans, loss = psuLoss(dc, s.psu);
  return { wall: dc + loss, accelerators: acc, cpus: cpu, base: s.base, fans, psu: loss, fanSpeed: speed };
}

export interface Workload { kind: 'training' | 'inference'; period: number; compute: number; high: number; low: number; checkpointEvery: number; checkpointFor: number; start: number; ramp: number; seed: number }
export const WORKLOAD: Workload = { kind: 'training', period: 2, compute: 0.7, high: 0.95, low: 0.35, checkpointEvery: 600, checkpointFor: 20, start: 0, ramp: 0, seed: 1 };
/** Utilisation over time t (s). Training: every chip in step, `compute` of each `period` at `high` and the rest at
 * `low` (exchanging gradients), idle for `checkpointFor` s every `checkpointEvery` s, starting at `start` and ramping
 * over `ramp` s. Inference: a daily wave (busiest at 14:00) with fast noise of requests. */
export function workload(t: number[], w: Workload): number[] {
  let s = w.seed >>> 0 || 1;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  return t.map((ti) => {
    if (w.kind === 'inference') {
      const day = 0.55 + 0.3 * Math.cos((2 * Math.PI * (ti / 3600 - 14)) / 24);
      return Math.max(0.05, Math.min(1, day + 0.08 * (rand() - 0.5)));
    }
    if (ti < w.start) return 0;
    const on = ti - w.start, ramp = w.ramp > 0 ? Math.min(1, on / w.ramp) : 1;
    if (w.checkpointEvery > 0 && on % w.checkpointEvery > w.checkpointEvery - w.checkpointFor) return 0.02;
    const phase = (on % w.period) / w.period;
    return ramp * (phase < w.compute ? w.high : w.low);
  });
}

/** A chiller's COP: `eta` of Carnot's between an evaporator 5 K under the supply and a condenser `approach` K over the
 * outside air (°C), at most 12. */
export function carnotCOP(supply: number, ambient: number, approach = 6, eta = 0.5) {
  const te = supply - 5 + 273.15, tc = Math.max(ambient + approach + 273.15, te + 5);
  return Math.min(12, (eta * te) / (tc - te));
}
/** The share of the heat the chiller must move: none when the air (plus the approach) is 2 K under the supply, all of
 * it when it is 2 K over, a blend between (partial free cooling). */
export const mechanicalShare = (supply: number, ambient: number, approach = 6) => Math.max(0, Math.min(1, (ambient + approach - (supply - 2)) / 4));

export interface Facility { rated: number; supply: number; approach: number; eta: number; fanPump: number; ups: number; other: number }
export const FACILITY: Facility = { rated: 100, supply: 20, approach: 6, eta: 0.5, fanPump: 0.04, ups: 1, other: 0.01 };
/** The whole facility's power at IT power P (same units as `rated`) and outside air T (°C): the UPS (double
 * conversion, ~96–97%), distribution (transformers and PDUs), cooling (fans and pumps, plus a chiller when it can't
 * cool for free) and the rest (lights, offices). PUE = total / IT. */
export function facilityPower(P: number, T: number, f: Facility) {
  const x = P / f.rated, ups = f.ups ? f.rated * (0.008 + 0.012 * x + 0.012 * x * x) : 0;
  const dist = 0.003 * f.rated + 0.012 * P, heat = P + ups + dist;
  const chiller = (heat * mechanicalShare(f.supply, T, f.approach)) / carnotCOP(f.supply, T, f.approach, f.eta);
  const cooling = f.fanPump * heat + chiller, other = f.other * f.rated, total = P + ups + dist + cooling + other;
  return { total, it: P, ups, distribution: dist, cooling, chiller, other, pue: P > 0 ? total / P : NaN };
}

/** Outside air (°C) at hour h of the year: a mean, a seasonal swing (warmest in late July) and a daily one (warmest at
 * 15:00). Southern climates give a negative seasonal swing. */
export const climate = (h: number, mean: number, season: number, day: number) =>
  mean + season * Math.cos((2 * Math.PI * (h / 24 - 205)) / 365) + day * Math.cos((2 * Math.PI * ((h % 24) - 15)) / 24);

export interface Campus { phases: [number, number][]; years: number; fill: number; utilisation: number; mean: number; season: number; day: number; facility: Facility }
/** A campus built in phases (rows [year it opens, IT capacity MW]): each fills over `fill` months to `utilisation`;
 * every hour of every year its IT load (with the inference-like daily wave of ±5%) through `facilityPower`. Per year:
 * the IT capacity, peak and mean demand (MW), energy (GWh) and the mean PUE; and the monthly peak and mean demand. */
export function campus(c: Campus) {
  const years: { year: number; capacity: number; peak: number; mean: number; energy: number; pue: number }[] = [];
  const monthPeak: number[] = [], monthMean: number[] = [];
  const cap = c.phases.reduce((s, p) => s + p[1], 0);
  for (let y = 0; y < c.years; y++) {
    let peak = 0, sum = 0, it = 0; const capY = c.phases.filter((p) => p[0] <= y + 1).reduce((s, p) => s + p[1], 0);
    for (let m = 0; m < 12; m++) {
      let mp = 0, ms = 0; const h0 = Math.round((m * 8760) / 12), h1 = Math.round(((m + 1) * 8760) / 12);
      for (let h = h0; h < h1; h++) {
        const months = y * 12 + h / 730;
        let P = 0;
        for (const [open, mw] of c.phases) { const age = months - (open - 1) * 12; if (age > 0) P += mw * c.utilisation * Math.min(1, age / Math.max(1e-9, c.fill)); }
        P *= 1 + 0.05 * Math.cos((2 * Math.PI * ((h % 24) - 14)) / 24);
        const f = facilityPower(P, climate(h, c.mean, c.season, c.day), { ...c.facility, rated: Math.max(cap, 1e-9) });
        const tot = P > 0 ? f.total : 0;
        mp = Math.max(mp, tot); ms += tot; it += P;
      }
      monthPeak.push(mp); monthMean.push(ms / (h1 - h0)); peak = Math.max(peak, mp); sum += ms;
    }
    years.push({ year: y + 1, capacity: capY, peak, mean: sum / 8760, energy: sum / 1000, pue: it > 0 ? sum / it : NaN });
  }
  return { years, monthPeak, monthMean };
}

/** The flow that carries heat P (W) away at a temperature rise dT (K): air in m³/s (ρ 1.2, cp 1005) and water in
 * litres a minute. */
export const heatFlow = (P: number, dT: number) => ({ air: P / (1.2 * 1005 * dT), water: (P / (997 * 4180 * dT)) * 60000 });
