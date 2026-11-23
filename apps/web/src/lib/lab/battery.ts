// Hyperion's battery ageing and temperature (M433, the owner: "battery ageing and temperature effects"): a cell's
// resistance and capacity at its temperature (Arrhenius), the heat it makes and how it warms (one lumped mass cooled
// to the air), and how it wears: capacity lost to cycling (Wang et al.'s throughput model, J. Power Sources 196, 2011)
// and to time on the shelf (a square-root-of-time model), with the resistance growing as it ages. Our own code.

import { ocv, type Cell } from './energy';

export const R_GAS = 8.314462618;
const TREF = 298.15;
/** A cell's body: mass (kg), specific heat (J/kg·K) and cooling to the air (W/K): a 21700-size cell by default. */
export interface Thermal { mass: number; cp: number; hA: number }
export const DEFAULT_THERMAL: Thermal = { mass: 0.07, cp: 1000, hA: 0.05 };
/** How strongly the resistance rises in the cold (J/mol): about twice at 0 °C what it is at 25 °C. */
const EA_RES = 19_000;
export const arrhenius = (tempC: number, ea: number) => Math.exp((ea / R_GAS) * (1 / (tempC + 273.15) - 1 / TREF));

/** The cell at a temperature (°C): resistances by Arrhenius, a little capacity lost in the cold (0.4% a degree below
 * 25 °C, at most half). */
export function cellAt(c: Cell, tempC: number): Cell {
  const f = arrhenius(tempC, EA_RES);
  return { capacity: c.capacity * Math.max(0.5, 1 - 0.004 * Math.max(0, 25 - tempC)), r0: c.r0 * f, r1: c.r1 * f, c1: c.c1 / f };
}

/** The cell under a current (A, + discharging) every dt seconds, warming as it works: terminal voltage, state of
 * charge, temperature (°C) and the heat made (W: I²·R0 plus the RC branch's loss). */
export function simulateThermal(cell: Cell, current: number[], dt: number, soc0 = 1, t0 = 25, ambient = 25, th: Thermal = DEFAULT_THERMAL) {
  let z = soc0, v1 = 0, T = t0;
  const v: number[] = [], soc: number[] = [], temp: number[] = [], heat: number[] = [];
  for (const I of current) {
    const c = cellAt(cell, T), a = Math.exp(-dt / (c.r1 * c.c1)), q = I * I * c.r0 + (v1 * v1) / c.r1;
    v.push(ocv(z) - I * c.r0 - v1); soc.push(z); temp.push(T); heat.push(q);
    z = Math.max(0, Math.min(1, z - (I * dt) / (3600 * c.capacity)));
    v1 = a * v1 + c.r1 * (1 - a) * I;
    T += (dt * (q - th.hA * (T - ambient))) / (th.mass * th.cp);
  }
  return { v, soc, temp, heat };
}

/** Wang et al.'s pre-factor B against the C-rate (their 0.5C, 2C, 6C, 10C fits), straight lines between. */
const B_FIT: [number, number][] = [[0.5, 31630], [2, 21681], [6, 12934], [10, 15512]];
function bOf(c: number) {
  if (c <= B_FIT[0][0]) return B_FIT[0][1];
  for (let i = 1; i < B_FIT.length; i++) if (c <= B_FIT[i][0]) { const [c0, b0] = B_FIT[i - 1], [c1, b1] = B_FIT[i]; return b0 + ((b1 - b0) * (c - c0)) / (c1 - c0); }
  return B_FIT[B_FIT.length - 1][1];
}
/** Capacity lost to cycling (a share, 0–1): B·exp(−(31700 − 370.3·C)/(R·T))·Ah^0.55, Ah the throughput (cycles × depth ×
 * capacity) of their 2.2 Ah cell: the same cycles wear any cell by the same share. */
export function cycleLoss(cycles: number, dod: number, cRate: number, tempC: number) {
  const ah = Math.max(0, cycles * dod * 2.2), T = tempC + 273.15;
  return Math.min(1, (bOf(cRate) * Math.exp(-(31700 - 370.3 * cRate) / (R_GAS * T)) * ah ** 0.55) / 100);
}
/** Capacity lost on the shelf (a share): 0.15% × √days at 25 °C and half charge (≈ 2.9% in a year), faster when warm
 * (50 kJ/mol) and when kept full (× 0.6 + 0.8·state of charge). */
export function calendarLoss(years: number, tempC: number, soc = 0.5) {
  return Math.min(1, (0.15 / 100) * arrhenius(tempC, -50_000) * Math.sqrt(Math.max(0, years) * 365) * (0.6 + 0.8 * Math.max(0, Math.min(1, soc))));
}
export interface AgeUse { cycles: number; dod: number; cRate: number; tempC: number; years: number; storageSoc: number }
export const DEFAULT_USE: AgeUse = { cycles: 0, dod: 0.8, cRate: 1, tempC: 25, years: 0, storageSoc: 0.5 };
/** The cell after that use: capacity lost (cycling plus time), state of health, the resistance grown (twice the share
 * of capacity lost, a common rule) and the aged cell. */
export function ageCell(cell: Cell, use: AgeUse) {
  const cyc = cycleLoss(use.cycles, use.dod, use.cRate, use.tempC), cal = calendarLoss(use.years, use.tempC, use.storageSoc);
  const loss = Math.min(1, cyc + cal), soh = 1 - loss, grow = 1 + 2 * loss;
  return { cycleLoss: cyc, calendarLoss: cal, loss, soh, resistanceGrowth: grow, cell: { capacity: cell.capacity * soh, r0: cell.r0 * grow, r1: cell.r1 * grow, c1: cell.c1 } as Cell };
}
/** Cycles until the state of health falls to `end` (80% by default), with `perDay` cycles a day adding shelf time. */
export function cycleLife(cell: Cell, use: Omit<AgeUse, 'cycles' | 'years'>, perDay = 1, end = 0.8) {
  const soh = (n: number) => ageCell(cell, { ...use, cycles: n, years: n / (365 * perDay) }).soh;
  let lo = 0, hi = 1000;
  while (soh(hi) > end && hi < 1e7) hi *= 2;
  if (soh(hi) > end) return Infinity;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (soh(m) > end) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
