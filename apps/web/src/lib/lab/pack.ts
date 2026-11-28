// Hyperion's battery systems, part 4 (M573; MathWorks' battery pack design: Battery Builder's cells, parallel
// assemblies, modules and packs, cooling plates with their fluid path, cell-to-cell temperature, ageing per cell and
// injected faults; the ARC thermal-runaway test). Written fresh.
//
// A pack is s groups in series, each of p cells in parallel, every cell its own EcmCell with a spread of capacity, R0
// and starting SOC (drawn from a seeded generator so a run repeats). In a parallel group the cells share one voltage,
// so their currents split by their open-circuit voltages and resistances each step. Every cell is a lumped thermal
// mass: it makes I²R0 + the RC pairs' loss, gives heat to a cooling plate whose coolant runs past the cells in order
// (warming as it goes), to its neighbours by conduction and to the air; resistances follow temperature (Arrhenius).
// Each cell also holds an exothermic decomposition (a single-step Arrhenius reaction, Semenov's model of thermal
// runaway): negligible below about 150 °C, self-sustaining above it, spreading to neighbours. Faults: added
// resistance, an internal short (a resistor across the cell) or a heater (abuse), from a time.

import { lookup, type EcmCell } from './cellfit';
import { arrhenius, cycleLoss, R_GAS } from './battery';

export interface CellThermal { mass: number; cp: number; hCool: number; hAir: number; kNeighbour: number }
/** A 21700-size cell on a plate: 70 g, 1000 J/kg·K, 0.4 W/K to the coolant, 0.02 W/K to air, 0.3 W/K to each neighbour. */
export const CELL_THERMAL: CellThermal = { mass: 0.07, cp: 1000, hCool: 0.4, hAir: 0.02, kNeighbour: 0.3 };
/** The decomposition: rate A·e^(−Ea/RT)·(1 − α) (1/s), heat H (J/kg); ~0.02 °C/min of self-heating at about 150 °C, ~700 K
 * of adiabatic rise when it runs away. */
export interface Runaway { A: number; Ea: number; H: number }
export const NMC_RUNAWAY: Runaway = { A: 1.6e12, Ea: 150_000, H: 7e5 };
export interface Coolant { inlet: number; flow: number; cp: number } // °C, kg/s, J/kg·K
export const GLYCOL: Coolant = { inlet: 25, flow: 0.01, cp: 3400 };

export interface PackFault { cell: number; kind: 'resistance' | 'short' | 'heater'; at: number; value: number }
export interface PackSpec {
  cell: EcmCell; series: number; parallel: number;
  spread: { capacity: number; r0: number; soc: number }; // one-sigma shares
  seed: number; thermal: CellThermal; runaway: Runaway; coolant: Coolant | null; ambient: number;
  faults: PackFault[]; t0?: number;
}
export const packSpec = (cell: EcmCell, series: number, parallel: number, o: Partial<PackSpec> = {}): PackSpec => ({
  cell, series, parallel, spread: { capacity: 0.02, r0: 0.05, soc: 0.01 }, seed: 1, thermal: CELL_THERMAL, runaway: NMC_RUNAWAY,
  coolant: GLYCOL, ambient: 25, faults: [], ...o,
});

/** A seeded normal generator (Park–Miller, Box–Muller). */
function gauss(seed: number) {
  let s = Math.max(1, Math.floor(seed) % 2147483647);
  const u = () => (s = (s * 48271) % 2147483647) / 2147483647;
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
}

export interface PackRun {
  t: number[]; v: number[]; // pack voltage (V), sampled
  cellV: number[][]; cellI: number[][]; soc: number[][]; temp: number[][]; // [cell][sample]
  coolantOut: number[]; capacity: number[]; r0: number[]; // per cell, as drawn
  maxTemp: number; runaway: number[]; // cells that ran away (above 200 °C)
  throughput: number[]; // Ah through each cell
  stopped?: string;
}

/** The pack under a current (A, + discharging) every dt s, from an average SOC. At most ~2,000 samples kept. */
export function packSim(sp: PackSpec, current: ArrayLike<number>, dt: number, soc0 = 1): PackRun {
  const { series: S, parallel: P, cell: c } = sp, N = S * P, g = gauss(sp.seed), np = c.r.length;
  if (!(S >= 1 && P >= 1 && N <= 2000)) throw new Error('A pack has 1–2,000 cells.');
  const cap = Array.from({ length: N }, () => c.capacity * Math.max(0.5, 1 + sp.spread.capacity * g()));
  const rf = Array.from({ length: N }, () => Math.max(0.3, 1 + sp.spread.r0 * g()));
  const z = Array.from({ length: N }, () => Math.min(1, Math.max(0, soc0 + sp.spread.soc * g())));
  const vrc = Array.from({ length: N }, () => new Array(np).fill(0));
  const T = new Array(N).fill(sp.t0 ?? sp.ambient), alpha = new Array(N).fill(0), through = new Array(N).fill(0);
  const every = Math.max(1, Math.ceil(current.length / 2000));
  const run: PackRun = { t: [], v: [], cellV: Array.from({ length: N }, () => []), cellI: Array.from({ length: N }, () => []), soc: Array.from({ length: N }, () => []), temp: Array.from({ length: N }, () => []), coolantOut: [], capacity: cap, r0: rf.map((f) => f * lookup(c.soc, c.r0, soc0)), maxTemp: T[0], runaway: [], throughput: through };
  const th = sp.thermal, mc = th.mass * th.cp, rx = sp.runaway;
  const I = new Array(N).fill(0), V = new Array(N).fill(0);
  for (let k = 0; k < current.length; k++) {
    const t = k * dt, active = sp.faults.filter((f) => t >= f.at);
    // Each cell's resistance at its SOC and temperature, plus an added-resistance fault.
    const r0 = Array.from({ length: N }, (_, i) => rf[i] * lookup(c.soc, c.r0, z[i]) * arrhenius(T[i], 19_000) + active.filter((f) => f.cell === i && f.kind === 'resistance').reduce((s, f) => s + f.value, 0));
    const ocv = z.map((zi, i) => lookup(c.soc, c.ocv, zi) - vrc[i].reduce((s, v) => s + v, 0));
    // An internal short draws its own current inside the cell (it discharges it and heats it).
    const shortR = Array.from({ length: N }, (_, i) => { const f = active.find((x) => x.cell === i && x.kind === 'short'); return f ? Math.max(1e-4, f.value) : Infinity; });
    let pack = 0;
    for (let gI = 0; gI < S; gI++) {
      // The group's voltage: Σ (ocv − V)/r0 = I, each cell's short loading it too (a Thévenin cell with the short across).
      let a = 0, b = 0;
      for (let j = 0; j < P; j++) {
        const i = gI * P + j, rs = shortR[i], e = Number.isFinite(rs) ? (ocv[i] * rs) / (rs + r0[i]) : ocv[i], r = Number.isFinite(rs) ? (r0[i] * rs) / (rs + r0[i]) : r0[i];
        a += e / r; b += 1 / r;
      }
      const vg = (a - current[k]) / b;
      for (let j = 0; j < P; j++) { const i = gI * P + j; I[i] = (ocv[i] - vg) / r0[i]; V[i] = vg; }
      pack += vg;
    }
    if (k % every === 0) {
      run.t.push(t); run.v.push(pack);
      for (let i = 0; i < N; i++) { run.cellV[i].push(V[i]); run.cellI[i].push(I[i]); run.soc[i].push(z[i]); run.temp[i].push(T[i]); }
    }
    // Charge, RC pairs, heat.
    let coolant = sp.coolant?.inlet ?? sp.ambient;
    const heat = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      const own = I[i] + (Number.isFinite(shortR[i]) ? V[i] / shortR[i] : 0); // the cell's own current, its short's included
      z[i] = Math.max(0, Math.min(1, z[i] - (own * dt) / (3600 * cap[i])));
      through[i] += (Math.abs(I[i]) * dt) / 3600;
      for (let p = 0; p < np; p++) {
        const tau = lookup(c.soc, c.tau[p], z[i]), r = lookup(c.soc, c.r[p], z[i]) * rf[i] * arrhenius(T[i], 19_000), e = Math.exp(-dt / tau);
        heat[i] += (vrc[i][p] * vrc[i][p]) / r;
        vrc[i][p] = e * vrc[i][p] + r * (1 - e) * I[i];
      }
      heat[i] += I[i] * I[i] * r0[i] + (Number.isFinite(shortR[i]) ? (V[i] * V[i]) / shortR[i] : 0) + active.filter((f) => f.cell === i && f.kind === 'heater').reduce((s, f) => s + f.value, 0);
    }
    // Temperatures, sub-stepped while a reaction runs fast (at most 1 K a sub-step).
    let left = dt;
    while (left > 1e-9) {
      const rate = T.map((Ti, i) => rx.A * Math.exp(-rx.Ea / (R_GAS * (Ti + 273.15))) * (1 - alpha[i]));
      const dTdt = T.map((Ti, i) => {
        const q = heat[i] + rx.H * th.mass * rate[i] - th.hAir * (Ti - sp.ambient) - (i > 0 ? th.kNeighbour * (Ti - T[i - 1]) : 0) - (i < N - 1 ? th.kNeighbour * (Ti - T[i + 1]) : 0);
        return q / mc;
      });
      const h = Math.min(left, ...dTdt.map((d) => (Math.abs(d) > 1e-12 ? 1 / Math.abs(d) : Infinity)), ...rate.map((r) => (r > 1e-12 ? 0.05 / r : Infinity)));
      for (let i = 0; i < N; i++) { T[i] += h * dTdt[i]; alpha[i] = Math.min(1, alpha[i] + h * rate[i]); }
      // The coolant runs past the cells in order, taking heat and warming (exact for a fixed coolant temperature over h).
      if (sp.coolant) {
        coolant = sp.coolant.inlet;
        for (let i = 0; i < N; i++) {
          const q = th.hCool * (T[i] - coolant), e = Math.exp((-th.hCool * h) / mc);
          T[i] = coolant + (T[i] - coolant) * e;
          coolant += q / (sp.coolant.flow * sp.coolant.cp);
        }
      }
      left -= h;
    }
    if (k % every === 0) run.coolantOut.push(coolant);
    for (let i = 0; i < N; i++) { run.maxTemp = Math.max(run.maxTemp, T[i]); if (T[i] > 200 && !run.runaway.includes(i)) run.runaway.push(i); }
    if (!Number.isFinite(pack)) { run.stopped = "The pack's voltage became infinite."; break; }
  }
  return run;
}

/** Each cell's state of health after `cycles` repeats of the run, from its own swing, current and mean temperature
 * (cycleLoss, battery.ts), and the pack's usable capacity: its weakest series group's (Ah). */
export function packAge(sp: PackSpec, run: PackRun, cycles: number) {
  const N = sp.series * sp.parallel, hours = Math.max(1e-9, (run.t.at(-1) ?? 0) / 3600);
  const soh = Array.from({ length: N }, (_, i) => {
    const s = run.soc[i], swing = Math.max(...s) - Math.min(...s), meanT = run.temp[i].reduce((a, b) => a + b, 0) / Math.max(1, run.temp[i].length);
    const cRate = run.throughput[i] / hours / run.capacity[i];
    return 1 - cycleLoss(cycles, Math.max(0.01, swing), Math.max(0.1, cRate), meanT);
  });
  const groups = Array.from({ length: sp.series }, (_, g) => soh.slice(g * sp.parallel, (g + 1) * sp.parallel).reduce((s, h, j) => s + h * run.capacity[g * sp.parallel + j], 0));
  return { soh, groupCapacity: groups, packCapacity: Math.min(...groups), weakest: groups.indexOf(Math.min(...groups)) };
}

/** An accelerating rate calorimeter's heat–wait–seek test on one cell (adiabatic): heat in 5 K steps, wait, and seek
 * self-heating above 0.02 °C/min; once found, follow it adiabatically. Gives the onset, the peak temperature and rate,
 * and the time from onset to the peak rate. */
export function arcTest(rx: Runaway = NMC_RUNAWAY, th: CellThermal = CELL_THERMAL, o: { start?: number; step?: number; wait?: number; seek?: number } = {}) {
  const mc = th.mass * th.cp, step = o.step ?? 5, wait = o.wait ?? 1200, seek = o.seek ?? 600, limit = 0.02 / 60;
  let T = o.start ?? 50, alpha = 0, t = 0, onset = NaN, tOnset = NaN, peakRate = 0, tPeak = NaN;
  const time: number[] = [], temp: number[] = [];
  const rate = () => rx.A * Math.exp(-rx.Ea / (R_GAS * (T + 273.15))) * (1 - alpha);
  const advance = (secs: number) => {
    let left = secs;
    while (left > 0) {
      const r = rate(), dT = (rx.H * th.mass * r) / mc, h = Math.min(left, dT > 1e-9 ? 0.5 / dT : left, r > 1e-12 ? 0.02 / r : left, 5);
      T += h * dT; alpha = Math.min(1, alpha + h * r); t += h; left -= h;
      if (dT > peakRate) { peakRate = dT; tPeak = t; }
      if (time.length === 0 || t - time[time.length - 1] >= 10 || dT > 0.5) { time.push(t); temp.push(T); }
    }
  };
  while (T < 300) {
    advance(wait);
    const before = T; advance(seek);
    if ((T - before) / seek > limit) { onset = before; tOnset = t - seek; break; }
    T += step;
  }
  // Near onset the adiabatic induction time is hours (RT²/Ea over the self-heating rate): follow until it's spent.
  if (Number.isFinite(onset)) while (alpha < 0.999 && t - tOnset < 72 * 3600) advance(600);
  return { onset, maxTemp: Math.max(...temp), peakRate, timeToPeak: tPeak - tOnset, time, temp };
}
