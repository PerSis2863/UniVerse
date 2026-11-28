// Hyperion's data-centre cooling (M574, "Cooling system equipment developers"): the three ways to take a rack's heat
// away compared (air through the servers and room coolers, single-phase liquid in cold plates with a coolant
// distribution unit, two-phase: a refrigerant boiling on the chips), each with its fans, pumps, chiller, cooling tower
// and water, the hottest chip and whether the rack density works at all; a chiller's power at part load and condenser
// temperature; pumps and fans by the affinity laws under three control strategies; the cooling loop through time as
// the compute load changes, with a PI controller on pump speed, a pump failing (with or without a spare) and the
// heat exchanger fouling; fouling read back from measured temperatures (UA from the log-mean temperature difference)
// to tell when to clean it; and the year's PUE and WUE from hourly weather. Our own lumped models from the standard
// relations (ε-NTU, Carnot fractions, ASHRAE's air limits). Pure.

import { carnotCOP, mechanicalShare } from './dc-power';

/** The wet-bulb temperature (°C) from dry bulb (°C) and relative humidity (%), Stull's 2011 fit (±0.3 K, 5–99%). */
export const wetBulb = (T: number, RH: number) =>
  T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) + Math.atan(T + RH) - Math.atan(RH - 1.676331) + 0.00391838 * RH ** 1.5 * Math.atan(0.023101 * RH) - 4.686035;

export type Arch = 'air' | 'liquid' | 'twophase';
export interface CoolIn { it: number; rack: number; chip: number; dry: number; wet: number; fws: number; tower: number; cycles: number }
export interface CoolOut { arch: Arch; fans: number; pumps: number; chiller: number; tower: number; cooling: number; ppue: number; chipMax: number; feasible: boolean; flow: number; flowUnit: string; water: number; wue: number; liquidShare: number }
/** One architecture at one hour: power in kW (it), the rack in kW, a chip in W; air in °C. Air: supply 24 °C on
 * chilled water at 14 °C, 12 K across the servers, 600 Pa at 55% fan efficiency, a chip 0.05 K/W above the air
 * leaving it; workable up to 50 kW a rack and a chip under 90 °C. Single-phase: 80% of the heat into cold plates on a
 * secondary loop 3 K over the facility water (fws) with 10 K rise, 250 + 150 kPa of pumping at 60%, a chip 0.02 K/W
 * over the coolant; the rest by air. Two-phase: 85% into a refrigerant boiling 6 K over the facility water (latent
 * heat 160 kJ/kg, leaving 70% vapour), a chip 0.012 K/W over it. The chiller makes up what the tower (wet bulb + 4 K)
 * can't; the tower's fans take 0.8% of the heat rejected, it evaporates that heat at 2.43 MJ/kg, `cycles` cycles of
 * concentration. */
export function cooling(arch: Arch, c: CoolIn): CoolOut {
  const W = c.it * 1000, chip = c.chip;
  let liquid = 0, fans = 0, pumps = 0, chipMax = 0, flow = 0, flowUnit = 'm³/s', supply = 14, feasible = true;
  const airPart = (heat: number) => { const q = heat / (1.2 * 1005 * 12); fans += (q * 600) / 0.55; return q; };
  if (arch === 'air') {
    flow = airPart(W); chipMax = 24 + 12 + chip * 0.05; feasible = c.rack <= 50 && chipMax <= 90;
  } else if (arch === 'liquid') {
    liquid = 0.8; airPart(W * 0.2); const sec = c.fws + 3;
    const m = (W * liquid) / (4180 * 10); flow = (m / 997) * 60000; flowUnit = 'L/min';
    pumps = ((m / 997) * 250e3 + (m / 997) * 150e3) / 0.6;
    chipMax = sec + 5 + chip * 0.02; supply = c.fws; feasible = chipMax <= 90;
  } else {
    liquid = 0.85; airPart(W * 0.15); const tsat = c.fws + 6;
    const m = (W * liquid) / (160e3 * 0.7); flow = (m / 1200) * 60000; flowUnit = 'L/min';
    pumps = ((m / 1200) * 100e3 + ((W * liquid) / (4180 * 10) / 997) * 150e3) / 0.6;
    chipMax = tsat + chip * 0.012; supply = c.fws; feasible = chipMax <= 90;
  }
  const heat = W + fans + pumps, share = mechanicalShare(supply, c.wet, c.tower), chiller = (heat * share) / carnotCOP(supply, c.wet, c.tower + 2, 0.5);
  const rejected = heat + chiller, tower = 0.008 * rejected, water = ((rejected / 2.43e6) * 3600 * c.cycles) / (c.cycles - 1); // L/h
  const cool = fans + pumps + chiller + tower;
  return { arch, fans: fans / 1000, pumps: pumps / 1000, chiller: chiller / 1000, tower: tower / 1000, cooling: cool / 1000, ppue: (W + cool) / W, chipMax, feasible, flow, flowUnit, water, wue: water / c.it, liquidShare: liquid };
}
/** The three architectures over a series of hours (dry and wet bulb arrays): the averages, and the worst hour's chip. */
export function compare(c: Omit<CoolIn, 'dry' | 'wet'>, dry: number[], wet: number[]) {
  return (['air', 'liquid', 'twophase'] as Arch[]).map((a) => {
    const hrs = dry.map((d, i) => cooling(a, { ...c, dry: d, wet: wet[i] })), n = hrs.length, avg = (k: keyof CoolOut) => hrs.reduce((s, h) => s + (h[k] as number), 0) / n;
    return { ...hrs[0], fans: avg('fans'), pumps: avg('pumps'), chiller: avg('chiller'), tower: avg('tower'), cooling: avg('cooling'), ppue: avg('ppue'), water: avg('water'), wue: avg('wue'), chipMax: Math.max(...hrs.map((h) => h.chipMax)), feasible: hrs.every((h) => h.feasible), chillerHours: hrs.filter((h) => h.chiller > 0).length };
  });
}

/** A chiller's electrical power (kW) and COP at part load PLR (0.1–1) and condenser water tc (°C): its rated COP
 * scaled by Carnot's ratio to the rating point (leaving chilled water tchw, condenser 30 °C), times a variable-speed
 * part-load curve 0.2 + 0.2·PLR + 0.6·PLR² of full-load input. */
export function chiller(cap: number, cop: number, plr: number, tc: number, tchw = 14) {
  const carnot = (t: number) => (tchw - 2 + 273.15) / Math.max(1, t + 3 - (tchw - 2));
  const full = cap / (cop * (carnot(tc) / carnot(30))), p = Math.max(0.1, Math.min(1, plr)), power = full * (0.2 + 0.2 * p + 0.6 * p * p);
  return { power, cop: (cap * p) / power };
}

export type Strategy = 'constant' | 'variable' | 'dpreset';
/** A pump's (or fan's) power at flow q of qmax, full power pfull, in a system whose head is `stat` static plus the rest
 * as k·q²: constant speed throttles the rest by a bypass (full power, all the time); variable speed holds a fixed
 * pressure at the far end (head ≥ 40% of full), so P ∝ q·(0.4 + 0.6 (q/qmax)²); differential-pressure reset follows the
 * system curve itself, P ∝ q·(stat + (1 − stat)(q/qmax)²). Affinity laws with a constant efficiency. */
export function pumpPower(q: number, qmax: number, pfull: number, s: Strategy, stat = 0.2) {
  const x = Math.max(0, Math.min(1, q / qmax));
  if (s === 'constant') return pfull;
  const head = s === 'variable' ? Math.max(0.4, stat) + (1 - Math.max(0.4, stat)) * x * x : stat + (1 - stat) * x * x;
  return pfull * x * head;
}

export interface Loop { it: number[]; fws: number[]; R0: number; C: number; M: number; UA: number; mmax: number; set: number; kp: number; ki: number; pumps: number; spare: number; failAt: number; fouling: number; pfull: number; nmin: number; fixed: boolean; tmax: number }
/** The rack loop through time t (s): chips (heat capacity C, J/K) above the coolant (mass M, kg) by R = R0·(0.5 + 0.5
 * (m0/m)^0.8) (convection worsens as the flow falls), the coolant cooled through the CDU at ε = 1 − e^(−UA/(m cp)) to
 * the facility water fws. Pump speed n (nmin to 1) by a PI on the coolant temperature (or fixed at 1), flow n · the
 * running pumps' share of mmax; at failAt one pump stops (a spare takes over if there is one); fouling takes that share
 * of UA away linearly over the run. Pump power ∝ n³. RK4 at 0.5 s. */
export function loop(t: number[], L: Loop) {
  const cp = 3800, m0 = L.mmax, Tc: number[] = [], Tl: number[] = [], speed: number[] = [], power: number[] = [], removed: number[] = [];
  let tc = L.fws[0] + 10, tl = L.fws[0] + 5, integ = 0.8, n = L.fixed ? 1 : 0.8;
  // start in steady state at the first load
  for (let k = 0; k < 4000; k++) step(0.5, 0, 0, true);
  function capacity(time: number) { const run = time >= L.failAt ? (L.spare > 0 ? L.pumps : L.pumps - 1) : L.pumps; return Math.max(0, run / L.pumps); }
  function step(h: number, time: number, i: number, settle = false) {
    const P = L.it[i], fw = L.fws[i];
    const ua = L.UA * (1 - (settle ? 0 : L.fouling * (time - t[0]) / Math.max(1e-9, t[t.length - 1] - t[0])));
    const m = Math.max(1e-6, n * L.mmax * (settle ? 1 : capacity(time)));
    const R = L.R0 * (0.5 + 0.5 * (m0 / m) ** 0.8), eps = 1 - Math.exp(-ua / (m * cp));
    const f = (x: number[]) => [(P - (x[0] - x[1]) / R) / L.C, ((x[0] - x[1]) / R - eps * m * cp * (x[1] - fw)) / (L.M * cp)];
    const y = [tc, tl], k1 = f(y), k2 = f(y.map((v, j) => v + (h / 2) * k1[j])), k3 = f(y.map((v, j) => v + (h / 2) * k2[j])), k4 = f(y.map((v, j) => v + h * k3[j]));
    [tc, tl] = y.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    if (!L.fixed) { const e = tl - L.set; integ = Math.max(L.nmin, Math.min(1, integ + L.ki * e * h)); n = Math.max(L.nmin, Math.min(1, L.kp * e + integ)); }
    return { q: eps * m * cp * (tl - fw), pump: L.pfull * n ** 3 * (settle ? 1 : capacity(time) > 0 ? 1 : 0) };
  }
  let clock = t[0], last = { q: 0, pump: 0 };
  for (let j = 0; j < t.length; j++) {
    while (clock < t[j] - 1e-9) { const h = Math.min(0.5, t[j] - clock); last = step(h, clock, j - 1); clock += h; }
    if (j === 0) last = step(1e-6, clock, 0);
    Tc.push(tc); Tl.push(tl); speed.push(n); power.push(last.pump); removed.push(last.q);
  }
  const over = Tc.reduce((s, v, i) => s + (i && v > L.tmax ? t[i] - t[i - 1] : 0), 0);
  return { Tc, Tl, speed, power, removed, peak: Math.max(...Tc), secondsOver: over };
}

/** A heat exchanger's UA (W/K) from its four temperatures and the hot side's flow (kg/s, cp 4180), counterflow LMTD. */
export function hxUA(thi: number, tho: number, tci: number, tco: number, mh: number, cp = 4180) {
  const Q = mh * cp * (thi - tho), a = thi - tco, b = tho - tci, lmtd = Math.abs(a - b) < 1e-9 ? a : (a - b) / Math.log(a / b);
  return Q / lmtd;
}
/** Fouling from a UA history: 1/UA rises linearly as deposits build up (a fouling resistance), so fit it by least
 * squares against time and say when UA falls to `clean` share of the first (fitted) value. */
export function foulingTrend(t: number[], ua: number[], clean = 0.8) {
  const y = ua.map((v) => 1 / v), n = t.length, mt = t.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (t[i] - mt) * (y[i] - my); sxx += (t[i] - mt) ** 2; }
  const slope = sxy / sxx, b = my - slope * mt, r0 = b + slope * t[0], target = r0 / clean;
  return { rate: slope, ua0: 1 / r0, uaNow: 1 / (b + slope * t[n - 1]), cleanAt: slope > 0 ? (target - b) / slope : Infinity, fitted: t.map((x) => 1 / (b + slope * x)) };
}
