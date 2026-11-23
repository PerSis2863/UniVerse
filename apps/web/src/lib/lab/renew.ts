// Hyperion's sun and wind farms (M434, the owner: "the sun's position through the day", "turbines shading each other
// in a wind farm"): the sun's place in the sky (NOAA's solar position equations), clear-sky sunshine on a tilted panel
// through the day, and the Jensen (Park) wake model: each turbine slows the wind behind it in a widening cone, the
// overlaps added as the root of the sum of squares. Our own code from the published formulas.

import { pvCurve, windPower, type Module, type Turbine } from './energy';

const rad = Math.PI / 180, deg = 180 / Math.PI;
/** The Julian day of a calendar date and UTC hour. */
export function julianDay(y: number, m: number, d: number, hourUtc: number) {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045 + (hourUtc - 12) / 24;
}
/** The sun at a place (degrees north, degrees east) on a date at a local clock hour in time zone tz (hours from UTC):
 * elevation above the horizon and azimuth (clockwise from north), both in degrees; the declination and the equation of
 * time (minutes) too. */
export function sunPosition(lat: number, lon: number, date: [number, number, number], hour: number, tz = 0) {
  const T = (julianDay(date[0], date[1], date[2], hour - tz) - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360) + 360) % 360, M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * rad) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * rad) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * rad) * 0.000289;
  const om = 125.04 - 1934.136 * T, lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(om * rad);
  const eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(om * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad));
  const y = Math.tan((eps * rad) / 2) ** 2;
  const eot = 4 * deg * (y * Math.sin(2 * L0 * rad) - 2 * e * Math.sin(M * rad) + 4 * e * y * Math.sin(M * rad) * Math.cos(2 * L0 * rad) - 0.5 * y * y * Math.sin(4 * L0 * rad) - 1.25 * e * e * Math.sin(2 * M * rad));
  const tst = hour * 60 + eot + 4 * lon - 60 * tz, ha = (tst / 4 - 180) * rad, phi = lat * rad;
  const cz = Math.max(-1, Math.min(1, Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha)));
  const az = (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) * deg + 180 + 360) % 360;
  return { elevation: 90 - Math.acos(cz) * deg, azimuth: az, declination: decl * deg, eqTime: eot };
}
/** Clear-sky sunshine (W/m²) with the sun at that elevation: direct (Meinel's air-mass rule with Kasten–Young's air
 * mass), diffuse (a tenth of it) and on the ground. */
export function clearSky(elevation: number) {
  if (elevation <= 0) return { dni: 0, dhi: 0, ghi: 0 };
  const z = 90 - elevation, am = 1 / (Math.cos(z * rad) + 0.50572 * (96.07995 - z) ** -1.6364), dni = 1353 * 0.7 ** (am ** 0.678), dhi = 0.1 * dni;
  return { dni, dhi, ghi: dni * Math.cos(z * rad) + dhi };
}
/** Sunshine on a panel tilted `tilt` degrees, facing `facing` degrees (clockwise from north): direct on its face,
 * the sky it sees and the ground it sees (albedo 0.2). */
export function onPanel(elevation: number, azimuth: number, tilt: number, facing: number, albedo = 0.2) {
  const s = clearSky(elevation), z = (90 - elevation) * rad, b = tilt * rad;
  const cosI = Math.cos(z) * Math.cos(b) + Math.sin(z) * Math.sin(b) * Math.cos((azimuth - facing) * rad);
  return Math.max(0, s.dni * Math.max(0, cosI) + (s.dhi * (1 + Math.cos(b))) / 2 + (s.ghi * albedo * (1 - Math.cos(b))) / 2);
}
/** A module through a clear day: every `step` hours its sunshine, cell temperature (NOCT 45 °C) and power at its
 * maximum power point, and the day's energy (Wh). */
export function pvDay(m: Module, lat: number, lon: number, date: [number, number, number], o: { tilt?: number; facing?: number; tz?: number; air?: number; step?: number } = {}) {
  const step = o.step ?? 0.25, tilt = o.tilt ?? Math.abs(lat), facing = o.facing ?? (lat >= 0 ? 180 : 0), air = o.air ?? 25;
  const hours: number[] = [], elev: number[] = [], sun: number[] = [], power: number[] = [];
  for (let h = 0; h <= 24 + 1e-9; h += step) {
    const p = sunPosition(lat, lon, date, h, o.tz ?? 0), g = onPanel(p.elevation, p.azimuth, tilt, facing);
    hours.push(h); elev.push(p.elevation); sun.push(g);
    power.push(g > 1 ? pvCurve(m, g, air + ((45 - 20) / 800) * g, 60).pmax : 0);
  }
  const wh = power.reduce((s, p, i) => s + (i ? ((p + power[i - 1]) / 2) * step : 0), 0);
  return { hours, elev, sun, power, wh };
}

// ——— Wind farms ———
/** The share of a rotor (radius R) inside a wake (radius Rw) whose centre is r away. */
export function overlap(R: number, Rw: number, r: number) {
  if (r >= R + Rw) return 0;
  if (r <= Math.abs(Rw - R)) return Rw >= R ? 1 : (Rw * Rw) / (R * R);
  const a = Math.acos((r * r + R * R - Rw * Rw) / (2 * r * R)), b = Math.acos((r * r + Rw * Rw - R * R) / (2 * r * Rw));
  return (R * R * (a - Math.sin(2 * a) / 2) + Rw * Rw * (b - Math.sin(2 * b) / 2)) / (Math.PI * R * R);
}
/** A turbine's thrust coefficient at wind v, from the power it takes: Cp = 4a(1 − a)² gives a, then Ct = 4a(1 − a). */
export function thrust(t: Turbine, v: number) {
  const P = windPower(t, v);
  if (!(P > 0)) return 0;
  const cp = Math.min(16 / 27, P / (0.5 * t.rho * Math.PI * (t.diameter / 2) ** 2 * v ** 3));
  let lo = 0, hi = 1 / 3;
  for (let k = 0; k < 60; k++) { const a = (lo + hi) / 2; if (4 * a * (1 - a) ** 2 < cp) lo = a; else hi = a; }
  const a = (lo + hi) / 2;
  return 4 * a * (1 - a);
}
/** Every turbine's wind and power with the wind from `dir` degrees (where it comes from, clockwise from north) at
 * speed v; positions in metres (x east, y north); wake decay k (0.075 on land, 0.04 at sea). */
export function windFarm(t: Turbine, xy: [number, number][], v: number, dir: number, k = 0.075) {
  const R = t.diameter / 2, dx = -Math.sin(dir * rad), dy = -Math.cos(dir * rad), n = xy.length;
  const order = xy.map((_, i) => i).sort((i, j) => xy[i][0] * dx + xy[i][1] * dy - (xy[j][0] * dx + xy[j][1] * dy));
  const speed = new Array(n).fill(v), ct = new Array(n).fill(0), sq = new Array(n).fill(0);
  for (const i of order) {
    speed[i] = v * (1 - Math.sqrt(sq[i]));
    ct[i] = thrust(t, speed[i]);
    for (const j of order) {
      const ex = xy[j][0] - xy[i][0], ey = xy[j][1] - xy[i][1], x = ex * dx + ey * dy;
      if (x <= 0) continue;
      const r = Math.abs(ex * dy - ey * dx), Rw = R + k * x, share = overlap(R, Rw, r);
      if (!share) continue;
      // The deficit at the wake's own speed, so it scales with the turbine's wind, not the free stream's.
      const d = (1 - Math.sqrt(1 - ct[i])) * (R / Rw) ** 2 * share * (speed[i] / v);
      sq[j] += d * d;
    }
  }
  const power = speed.map((s) => windPower(t, s)), free = windPower(t, v) * n;
  return { speed, power, ct, efficiency: free > 0 ? power.reduce((a, b) => a + b, 0) / free : 1 };
}
/** A year's energy (MWh) for the farm over Weibull winds (k, c) blowing from the given directions with the given
 * shares, and the share the wakes cost. */
export function windFarmYear(t: Turbine, xy: [number, number][], k: number, c: number, dirs: number[], weights: number[], decay = 0.075) {
  const w = weights.map((x) => Math.max(0, x)), sw = w.reduce((a, b) => a + b, 0) || 1, dv = 0.5;
  let mean = 0, free = 0;
  for (let v = dv / 2; v < 30; v += dv) {
    const pv = (k / c) * (v / c) ** (k - 1) * Math.exp(-((v / c) ** k)) * dv;
    free += pv * windPower(t, v) * xy.length;
    dirs.forEach((d, i) => { if (w[i]) mean += pv * (w[i] / sw) * windFarm(t, xy, v, d, decay).power.reduce((a, b) => a + b, 0); });
  }
  return { aepMWh: (mean * 8760) / 1e6, wakeLoss: free > 0 ? 1 - mean / free : 0 };
}
