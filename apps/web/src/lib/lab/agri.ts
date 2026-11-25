// Hyperion's agriculture and energy production extras (M505, the owner's list, group 7 and MathWorks' industries):
// reference evapotranspiration by FAO-56's Penman–Monteith (Allen et al. 1998), the daily root-zone water balance with
// crop coefficients and irrigation when the readily available water is used up (FAO-56 chapter 8), a crop growing on
// degree-days and intercepted light (radiation-use efficiency) slowed by water stress, the economic dispatch of power
// stations with quadratic costs (equal incremental cost, by bisection on λ), and the levelised cost of energy. Pure.

const RAD = Math.PI / 180;
/** Saturation vapour pressure (kPa) at T °C. */
export const es = (T: number) => 0.6108 * Math.exp((17.27 * T) / (T + 237.3));

/** Extraterrestrial radiation (MJ/m²/day) and daylight hours at a latitude on a day of the year. */
export function extraterrestrial(lat: number, doy: number) {
  const phi = lat * RAD, dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365), d = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(d))));
  const ra = ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.sin(ws));
  return { ra, daylight: (24 / Math.PI) * ws };
}
export interface Weather { tmin: number; tmax: number; rhmin?: number; rhmax?: number; rhmean?: number; wind: number; rs?: number; sunshine?: number; elev: number; lat: number; doy: number }
/** FAO-56 equation 6 (mm/day): the grass reference ET0 from a day's weather; radiation measured (rs) or from sunshine
 * hours by Ångström (0.25 + 0.5 n/N) Ra. */
export function et0(w: Weather) {
  const tmean = (w.tmin + w.tmax) / 2, P = 101.3 * ((293 - 0.0065 * w.elev) / 293) ** 5.26, gamma = 0.000665 * P;
  const delta = (4098 * es(tmean)) / (tmean + 237.3) ** 2, esat = (es(w.tmax) + es(w.tmin)) / 2;
  const ea = w.rhmin !== undefined && w.rhmax !== undefined ? (es(w.tmin) * (w.rhmax / 100) + es(w.tmax) * (w.rhmin / 100)) / 2 : (esat * (w.rhmean ?? 60)) / 100;
  const { ra, daylight } = extraterrestrial(w.lat, w.doy), rs = w.rs ?? (0.25 + (0.5 * (w.sunshine ?? daylight / 2)) / daylight) * ra;
  const rso = (0.75 + 2e-5 * w.elev) * ra, rns = 0.77 * rs, sigma = 4.903e-9;
  const rnl = sigma * (((w.tmax + 273.16) ** 4 + (w.tmin + 273.16) ** 4) / 2) * (0.34 - 0.14 * Math.sqrt(ea)) * (1.35 * Math.min(1, rs / rso) - 0.35), rn = rns - rnl;
  const v = (0.408 * delta * rn + gamma * (900 / (tmean + 273)) * w.wind * (esat - ea)) / (delta + gamma * (1 + 0.34 * w.wind));
  return { et0: v, rn, rs, ra, ea, es: esat, delta, gamma };
}

/** FAO-56's single crop coefficient through the season: Kc ini, mid and end over stages of [initial, development,
 * mid, late] days. */
export function kcCurve(kc: [number, number, number], stages: [number, number, number, number]) {
  const [ini, dev, mid, late] = stages, out: number[] = [];
  for (let d = 0; d < ini + dev + mid + late; d++) {
    if (d < ini) out.push(kc[0]);
    else if (d < ini + dev) out.push(kc[0] + ((kc[1] - kc[0]) * (d - ini + 1)) / dev);
    else if (d < ini + dev + mid) out.push(kc[1]);
    else out.push(kc[1] + ((kc[2] - kc[1]) * (d - ini - dev - mid + 1)) / late);
  }
  return out;
}
/** The root-zone depletion day by day (mm): rain in, crop water use out (reduced by Ks once more than the readily
 * available water p·TAW is gone); with irrigation on, the zone is filled back to field capacity whenever the depletion
 * passes RAW. Rain beyond what the soil can hold drains away. */
export function waterBalance(et0d: number[], rain: number[], kc: number[], taw: number, p = 0.5, irrigate = true, efficiency = 1) {
  const raw = p * taw, dr: number[] = [], ks: number[] = [], etc: number[] = [], irr: number[] = [], drain: number[] = [];
  let d = 0;
  for (let t = 0; t < et0d.length; t++) {
    const k = d > raw ? Math.max(0, (taw - d) / (taw - raw)) : 1, use = (kc[t] ?? kc[kc.length - 1]) * et0d[t] * k;
    d = d - (rain[t] ?? 0) + use;
    let dp = 0;
    if (d < 0) { dp = -d; d = 0; }
    let ir = 0;
    if (irrigate && d > raw) { ir = d / efficiency; d = 0; }
    d = Math.min(d, taw);
    dr.push(d); ks.push(k); etc.push(use); irr.push(ir); drain.push(dp);
  }
  return { depletion: dr, ks, etc, irrigation: irr, drainage: drain, raw };
}

/** A crop on degree-days: green cover (LAI) follows an S-curve in thermal time and dies back before `gddMax`; biomass grows by RUE × the
 * light the cover intercepts (half of solar radiation is photosynthetic), times the water-stress factor; yield is the
 * harvest index × biomass. Units: °C, MJ/m²/day, g/MJ, t/ha. */
export function cropGrowth(tmin: number[], tmax: number[], rs: number[], o: { tbase?: number; gddMax?: number; rue?: number; hi?: number; ks?: number[]; kExt?: number; laiMax?: number } = {}) {
  const tb = o.tbase ?? 10, gm = o.gddMax ?? 1600, rue = o.rue ?? 3.0, hi = o.hi ?? 0.5, kExt = o.kExt ?? 0.65, laiMax = o.laiMax ?? 5;
  let gdd = 0, bio = 0;
  const G: number[] = [], L: number[] = [], B: number[] = [];
  for (let t = 0; t < tmin.length; t++) {
    gdd += Math.max(0, (tmin[t] + tmax[t]) / 2 - tb);
    // Cover rises as an S-curve to its peak at 35% of the thermal time, holds, then dies back over the last quarter.
    const f = Math.min(1, gdd / gm), lai = laiMax / (1 + Math.exp(-12 * (f - 0.35))) * (f < 0.75 ? 1 : Math.max(0, 1 - (f - 0.75) / 0.25));
    const intercepted = 1 - Math.exp(-kExt * Math.max(0, lai));
    bio += (rue * 0.5 * rs[t] * intercepted * (o.ks?.[t] ?? 1)) / 100; // g/m² → t/ha
    G.push(gdd); L.push(Math.max(0, lai)); B.push(bio);
  }
  return { gdd: G, lai: L, biomass: B, yield: hi * bio, maturityDay: G.findIndex((g) => g >= gm) };
}

/** Economic dispatch: costs a + bP + cP² (per hour, P in MW) within limits, meeting demand at least cost. Every unit
 * not at a limit runs where its incremental cost b + 2cP equals λ. */
export function dispatch(b: number[], c: number[], pmin: number[], pmax: number[], demand: number) {
  const at = (lam: number) => b.map((bi, i) => Math.min(pmax[i], Math.max(pmin[i], (lam - bi) / (2 * c[i]))));
  const total = (lam: number) => at(lam).reduce((s, v) => s + v, 0);
  if (demand < pmin.reduce((s, v) => s + v, 0) - 1e-9 || demand > pmax.reduce((s, v) => s + v, 0) + 1e-9) return null;
  let lo = Math.min(...b.map((bi, i) => bi + 2 * c[i] * pmin[i])) - 1, hi = Math.max(...b.map((bi, i) => bi + 2 * c[i] * pmax[i])) + 1;
  for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; if (total(m) < demand) lo = m; else hi = m; }
  const lam = (lo + hi) / 2;
  return { p: at(lam), lambda: lam };
}
/** Levelised cost of energy: (capital + the present value of yearly costs) ÷ the present value of yearly energy. */
export function lcoe(capex: number, opex: number, energy: number, rate: number, years: number, degradation = 0) {
  let costPV = capex, energyPV = 0;
  for (let y = 1; y <= years; y++) { const df = (1 + rate) ** -y; costPV += opex * df; energyPV += energy * (1 - degradation) ** (y - 1) * df; }
  return costPV / energyPV;
}
