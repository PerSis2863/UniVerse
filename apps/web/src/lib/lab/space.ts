// Hyperion's space flight (M490), pure, in kilometres and seconds: orbits by their six elements and as position and
// velocity (and back), Kepler's equation, propagation round the Earth with its equatorial bulge (J2) by RK4, ground
// tracks under the turning Earth, Hohmann and bi-elliptic transfers and plane changes, Lambert's problem (the orbit
// joining two positions in a given time, by universal variables), and the rocket equation with staging.

export const MU = 398600.4418, RE = 6378.137, J2 = 1.08262668e-3, WE = 7.2921159e-5, G0 = 9.80665e-3;
export type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const sc = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const TAU = 2 * Math.PI;
const mod = (x: number) => ((x % TAU) + TAU) % TAU;

/** Classical elements: semi-major axis (km), eccentricity, inclination, right ascension of the ascending node,
 * argument of periapsis, true anomaly (radians). */
export interface Elements { a: number; e: number; i: number; raan: number; argp: number; nu: number }
/** Elements → position and velocity in the Earth-centred inertial frame (as MATLAB's keplerian2ijk). */
export function toState(el: Elements, mu = MU): { r: V3; v: V3 } {
  const p = el.a * (1 - el.e * el.e), rr = p / (1 + el.e * Math.cos(el.nu));
  const rp: V3 = [rr * Math.cos(el.nu), rr * Math.sin(el.nu), 0], vp: V3 = [-Math.sqrt(mu / p) * Math.sin(el.nu), Math.sqrt(mu / p) * (el.e + Math.cos(el.nu)), 0];
  const cO = Math.cos(el.raan), sO = Math.sin(el.raan), cw = Math.cos(el.argp), sw = Math.sin(el.argp), ci = Math.cos(el.i), si = Math.sin(el.i);
  const R = [[cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci, sO * si], [sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci, -cO * si], [sw * si, cw * si, ci]];
  const rot = (x: V3): V3 => [R[0][0] * x[0] + R[0][1] * x[1], R[1][0] * x[0] + R[1][1] * x[1], R[2][0] * x[0] + R[2][1] * x[1]];
  return { r: rot(rp), v: rot(vp) };
}
/** Position and velocity → elements (as MATLAB's ijk2keplerian). For circular or equatorial orbits the undefined angles
 * are set to 0 and the rest measured from the node or the x axis. */
export function toElements(r: V3, v: V3, mu = MU): Elements {
  const h = cross(r, v), n: V3 = [-h[1], h[0], 0], rn = norm(r), vn = norm(v);
  const ev = sc(add(sc(r, vn * vn - mu / rn), sc(v, -dot(r, v))), 1 / mu), e = norm(ev);
  const energy = (vn * vn) / 2 - mu / rn, a = -mu / (2 * energy), i = Math.acos(Math.max(-1, Math.min(1, h[2] / norm(h)))), nn = norm(n);
  let raan = nn > 1e-10 ? Math.acos(Math.max(-1, Math.min(1, n[0] / nn))) : 0;
  if (n[1] < 0) raan = TAU - raan;
  let argp = 0, nu: number;
  if (e > 1e-10) {
    argp = nn > 1e-10 ? Math.acos(Math.max(-1, Math.min(1, dot(n, ev) / (nn * e)))) : Math.atan2(ev[1], ev[0]);
    if (nn > 1e-10 && ev[2] < 0) argp = TAU - argp;
    nu = Math.acos(Math.max(-1, Math.min(1, dot(ev, r) / (e * rn))));
    if (dot(r, v) < 0) nu = TAU - nu;
  } else if (nn > 1e-10) { nu = Math.acos(Math.max(-1, Math.min(1, dot(n, r) / (nn * rn)))); if (r[2] < 0) nu = TAU - nu; }
  else { nu = mod(Math.atan2(r[1], r[0])); }
  return { a, e, i, raan: mod(raan), argp: mod(argp), nu: mod(nu) };
}
/** Kepler's equation M = E − e sin E, solved by Newton for the eccentric anomaly. */
export function keplerE(M: number, e: number) {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 50; k++) { const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-14) break; }
  return E;
}
export const period = (a: number, mu = MU) => TAU * Math.sqrt((a * a * a) / mu);
/** Where an orbit is after t seconds by Kepler alone (no bulge): its true anomaly. */
export function nuAfter(el: Elements, t: number, mu = MU) {
  const E0 = 2 * Math.atan(Math.sqrt((1 - el.e) / (1 + el.e)) * Math.tan(el.nu / 2)), M0 = E0 - el.e * Math.sin(E0);
  const E = keplerE(mod(M0 + Math.sqrt(mu / el.a ** 3) * t), el.e);
  return mod(2 * Math.atan(Math.sqrt((1 + el.e) / (1 - el.e)) * Math.tan(E / 2)));
}

/** Gravity with the Earth's bulge (J2) when asked. */
export function gravity(r: V3, j2 = true, mu = MU): V3 {
  const rn = norm(r), g = sc(r, -mu / rn ** 3);
  if (!j2) return g;
  const k = (1.5 * J2 * mu * RE * RE) / rn ** 5, z2 = (5 * r[2] * r[2]) / (rn * rn);
  return add(g, [k * r[0] * (z2 - 1), k * r[1] * (z2 - 1), k * r[2] * (z2 - 3)]);
}
// ——— The Sun and the Moon (M490b) ———
export const MU_SUN = 1.32712440018e11, MU_MOON = 4902.800066, AU = 149597870.7, JD2000 = 2451545;
const DEG = Math.PI / 180;
/** The Julian date of a calendar date and time in UTC (as MATLAB's juliandate; the Gregorian calendar). */
export function julianDate(Y: number, M: number, D: number, h = 0, m = 0, s = 0) {
  const y = M <= 2 ? Y - 1 : Y, mo = M <= 2 ? M + 12 : M, A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (mo + 1)) + D + B - 1524.5 + (h + m / 60 + s / 3600) / 24;
}
/** The Earth's rotation angle at a Julian date (rad): Greenwich mean sidereal time, so ground tracks fall at their real
 * longitudes. */
export const gmst = (jd: number) => mod((280.46061837 + 360.98564736629 * (jd - JD2000)) * DEG);
const obliquity = (jd: number) => (23.439291 - 0.0130042 * ((jd - JD2000) / 36525)) * DEG;
const fromEcliptic = (lon: number, lat: number, r: number, jd: number): V3 => {
  const e = obliquity(jd), x = r * Math.cos(lat) * Math.cos(lon), y = r * Math.cos(lat) * Math.sin(lon), z = r * Math.sin(lat);
  return [x, y * Math.cos(e) - z * Math.sin(e), y * Math.sin(e) + z * Math.cos(e)];
};
/** Where the Sun is (km, Earth-centred equatorial) at a Julian date: the Astronomical Almanac's short formula, ~0.01°. */
export function sunPosition(jd: number): V3 {
  const n = jd - JD2000, L = (280.46 + 0.9856474 * n) * DEG, g = (357.528 + 0.9856003 * n) * DEG;
  const lam = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG, R = (1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g)) * AU;
  return fromEcliptic(lam, 0, R, jd);
}
/** Where the Moon is (km) at a Julian date: Montenbruck and Gill's low-precision series (a few minutes of arc, ~500 km). */
export function moonPosition(jd: number): V3 {
  const T = (jd - JD2000) / 36525, d = (x: number) => x * DEG, sin = Math.sin, cos = Math.cos;
  const L0 = d(218.31617 + 481267.88088 * T - 1.3972 * T), l = d(134.96292 + 477198.86753 * T), lp = d(357.52543 + 35999.04944 * T), F = d(93.27283 + 483202.01873 * T), D = d(297.85027 + 445267.11135 * T);
  const dl = 22640 * sin(l) + 769 * sin(2 * l) - 4586 * sin(l - 2 * D) + 2370 * sin(2 * D) - 668 * sin(lp) - 412 * sin(2 * F) - 212 * sin(2 * l - 2 * D) - 206 * sin(l + lp - 2 * D) + 192 * sin(l + 2 * D) - 165 * sin(lp - 2 * D) + 148 * sin(l - lp) - 125 * sin(D) - 110 * sin(l + lp) - 55 * sin(2 * F - 2 * D);
  const lon = L0 + d(dl / 3600), S = F + d((dl + 412 * sin(2 * F) + 541 * sin(lp)) / 3600), h = F - 2 * D;
  const lat = d((18520 * sin(S) - 526 * sin(h) + 44 * sin(l + h) - 31 * sin(-l + h) - 25 * sin(-2 * l + F) - 23 * sin(lp + h) + 21 * sin(-l + F) + 11 * sin(-lp + h)) / 3600);
  const r = 385000 - 20905 * cos(l) - 3699 * cos(2 * D - l) - 2956 * cos(2 * D) - 570 * cos(2 * l) + 246 * cos(2 * l - 2 * D) - 205 * cos(lp - 2 * D) - 171 * cos(l + 2 * D) - 152 * cos(l + lp - 2 * D);
  return fromEcliptic(lon, lat, r, jd);
}
/** A third body's pull on a satellite at r, relative to the Earth (which that body pulls too): μ((s − r)/|s − r|³ − s/|s|³). */
export function thirdBody(r: V3, s: V3, mu: number): V3 {
  const d: V3 = [s[0] - r[0], s[1] - r[1], s[2] - r[2]], dn = norm(d) ** 3, sn = norm(s) ** 3;
  return [mu * (d[0] / dn - s[0] / sn), mu * (d[1] / dn - s[1] / sn), mu * (d[2] / dn - s[2] / sn)];
}

// ——— Air drag (M490c) ———
// Vallado's exponential atmosphere (Fundamentals of Astrodynamics, table 8-4): base height (km), density there (kg/m³)
// and scale height (km), for average solar activity. Real density swings several times with the Sun's 11-year cycle.
const ATM: [number, number, number][] = [[0, 1.225, 7.249], [25, 3.899e-2, 6.349], [30, 1.774e-2, 6.682], [40, 3.972e-3, 7.554], [50, 1.057e-3, 8.382], [60, 3.206e-4, 7.714], [70, 8.77e-5, 6.549], [80, 1.905e-5, 5.799], [90, 3.396e-6, 5.382], [100, 5.297e-7, 5.877], [110, 9.661e-8, 7.263], [120, 2.438e-8, 9.473], [130, 8.484e-9, 12.636], [140, 3.845e-9, 16.149], [150, 2.07e-9, 22.523], [180, 5.464e-10, 29.74], [200, 2.789e-10, 37.105], [250, 7.248e-11, 45.546], [300, 2.418e-11, 53.628], [350, 9.518e-12, 53.298], [400, 3.725e-12, 58.515], [450, 1.585e-12, 60.828], [500, 6.967e-13, 63.822], [600, 1.454e-13, 71.835], [700, 3.614e-14, 88.667], [800, 1.17e-14, 124.64], [900, 5.245e-15, 181.05], [1000, 3.019e-15, 268]];
// The Sun's cycle (M490d): the thermosphere heats and swells with the Sun's ultraviolet, measured by the 10.7 cm radio
// flux F10.7 (solar flux units; about 70 at a quiet minimum, 150 on average, 200–250 at an active maximum). Jacchia's
// exospheric temperature T∞ ≈ 1.15·(379 + 3.24·F) (the 1.15 averages day and night); above 150 km each layer's scale
// height is stretched by √(T∞(F)/T∞(150)), a fit that gives MSIS's swing at 400 km (about 3× thinner at minimum, 2.5×
// thicker at maximum). Below 150 km the table holds whatever the flux.
export const F107_AVG = 150;
const tInf = (F: number) => 1.15 * (379 + 3.24 * F);
const bases = new Map<number, number[]>();
function baseDensities(F: number) {
  let b = bases.get(F);
  if (b) return b;
  const k = Math.sqrt(tInf(F) / tInf(F107_AVG));
  // The table's own bases, each moved by what the stretched layers below it change: exactly the table at k = 1.
  b = [ATM[0][1]];
  let shift = 0;
  for (let i = 1; i < ATM.length; i++) {
    const [h0, , H] = ATM[i - 1];
    if (h0 >= 150) shift += ((ATM[i][0] - h0) / H) * (1 - 1 / k);
    b.push(ATM[i][1] * Math.exp(shift));
  }
  if (bases.size > 64) bases.clear();
  bases.set(F, b);
  return b;
}
/** The air's density (kg/m³) at a height (km), for a solar flux F10.7 (150, average, by default). */
export function airDensity(h: number, F = F107_AVG) {
  if (!(h >= 0)) return ATM[0][1];
  const i = ATM.findLastIndex((x) => x[0] <= h), [h0, , H] = ATM[i];
  return baseDensities(F)[i] * Math.exp(-(h - h0) / (h0 >= 150 ? H * Math.sqrt(tInf(F) / tInf(F107_AVG)) : H));
}
/** The smoothed solar flux F10.7 about a date (a year with its fraction): an 11-year cycle from a minimum of 70 to a
 * maximum of 180, anchored on cycle 25's minimum (December 2019). Real cycles differ in height and length. */
export function solarFlux(year: number) {
  return 70 + 110 * Math.sin((Math.PI * (year - 2019.95)) / 11) ** 2;
}
/** Drag's pull (km/s²) on a satellite at r (km) moving at v (km/s) with ballistic coefficient `bc` = Cd·A/m (m²/kg),
 * through air turning with the Earth. ½ρ·bc·|w|·w with w in m/s, given back in km/s². */
export function dragAccel(r: V3, v: V3, bc: number, F = F107_AVG): V3 {
  const w: V3 = [v[0] + WE * r[1], v[1] - WE * r[0], v[2]], rho = airDensity(norm(r) - RE, F), k = -0.5 * rho * bc * 1000 * norm(w);
  return sc(w, k);
}
/** About how long (days) a circular orbit h km up lasts before it reaches 120 km (it then falls within a day): the
 * semi-major axis shrinks by ρ·bc·√(μa) each second. Infinity past 100 years. `flux` is a fixed F10.7, or a start
 * year (a number above 1900) to follow the Sun's cycle from then on. */
export function decayTime(h: number, bc: number, flux: number = F107_AVG) {
  let a = RE + h, t = 0;
  const F = () => (flux > 1900 ? solarFlux(flux + t / 86400 / 365.25) : flux);
  while (a - RE > 120) {
    const rate = airDensity(a - RE, F()) * bc * Math.sqrt(MU * a) * 1000, step = Math.min(86400 * 5, Math.max(60, 0.5 / Math.max(rate, 1e-12)));
    a -= rate * step; t += step;
    if (t > 100 * 365.25 * 86400) return Infinity;
  }
  return t / 86400;
}

export interface OrbitRun { t: number[]; r: V3[]; v: V3[]; lat: number[]; lon: number[]; alt: number[]; raan: number[]; crashed: boolean }
/** Propagates position and velocity for T seconds (RK4, step dt), with the ground track (the Earth turning under it).
 * With a start date `jd0` (Julian) the Earth's rotation angle comes from it (unless `gst0` is given), and `sun` and
 * `moon` add their pull, found where they are at each moment. */
export function propagate(r0: V3, v0: V3, T: number, o: { j2?: boolean; dt?: number; points?: number; gst0?: number; jd0?: number; sun?: boolean; moon?: boolean; drag?: number; flux?: number } = {}): OrbitRun {
  // The step shrunk a little so the last one lands exactly at T.
  const n = Math.max(1, Math.ceil(T / (o.dt ?? 10))), dt = T / n, every = Math.max(1, Math.floor(n / (o.points ?? 2000))), j2 = o.j2 ?? true;
  let r = r0, v = v0, crashed = false;
  const out: OrbitRun = { t: [], r: [], v: [], lat: [], lon: [], alt: [], raan: [], crashed: false };
  const jd0 = o.jd0 ?? JD2000, gst0 = o.gst0 ?? (o.jd0 !== undefined ? gmst(o.jd0) : 0);
  // The Sun and Moon move little in a step: found once at its start, middle and end.
  let bodies: [V3, number][][] = [];
  const at = (t: number): [V3, number][] => [...(o.sun ? [[sunPosition(jd0 + t / 86400), MU_SUN] as [V3, number]] : []), ...(o.moon ? [[moonPosition(jd0 + t / 86400), MU_MOON] as [V3, number]] : [])];
  const f = (x: V3, y: V3, which: number): [V3, V3] => { let g = gravity(x, j2); if (o.drag) g = add(g, dragAccel(x, y, o.drag, o.flux)); for (const [s, mu] of bodies[which] ?? []) g = add(g, thirdBody(x, s, mu)); return [y, g]; };
  for (let k = 0; k <= n; k++) {
    const t = k * dt;
    if (k % every === 0 || k === n) {
      const rn = norm(r), lat = Math.asin(r[2] / rn), lon = Math.atan2(r[1], r[0]) - (gst0 + WE * t);
      out.t.push(t); out.r.push(r); out.v.push(v); out.lat.push(lat); out.lon.push(Math.atan2(Math.sin(lon), Math.cos(lon))); out.alt.push(rn - RE); out.raan.push(toElements(r, v).raan);
    }
    if (k === n) break;
    // With drag a satellite is gone once it's 100 km up: it burns up within minutes.
    if (norm(r) < RE + (o.drag ? 100 : 0)) { crashed = true; break; }
    if (o.sun || o.moon) bodies = [at(t), at(t + dt / 2), at(t + dt)];
    const [a1, b1] = f(r, v, 0), [a2, b2] = f(add(r, sc(a1, dt / 2)), add(v, sc(b1, dt / 2)), 1), [a3, b3] = f(add(r, sc(a2, dt / 2)), add(v, sc(b2, dt / 2)), 1), [a4, b4] = f(add(r, sc(a3, dt)), add(v, sc(b3, dt)), 2);
    r = add(r, sc(add(add(a1, sc(a2, 2)), add(sc(a3, 2), a4)), dt / 6));
    v = add(v, sc(add(add(b1, sc(b2, 2)), add(sc(b3, 2), b4)), dt / 6));
  }
  return { ...out, crashed };
}
/** The node's drift a day from J2 (rad/day): −1.5 n J2 (Re/p)² cos i. Sun-synchronous at +0.9856°/day. */
export const nodalDrift = (a: number, e: number, i: number) => -1.5 * Math.sqrt(MU / a ** 3) * J2 * (RE / (a * (1 - e * e))) ** 2 * Math.cos(i) * 86400;
/** The inclination that makes a circular orbit at height h sun-synchronous. */
export function sunSyncInclination(h: number) {
  const a = RE + h, want = (TAU / 365.2422) / 86400 * 86400;
  return Math.acos(want / (-1.5 * Math.sqrt(MU / a ** 3) * J2 * (RE / a) ** 2 * 86400));
}

// ——— Manoeuvres ———
/** Hohmann transfer between circular orbits of radii r1 and r2 (km): the two burns (km/s) and the time (s). */
export function hohmann(r1: number, r2: number, mu = MU) {
  const at = (r1 + r2) / 2, v1 = Math.sqrt(mu / r1), v2 = Math.sqrt(mu / r2);
  const dv1 = Math.sqrt(mu * (2 / r1 - 1 / at)) - v1, dv2 = v2 - Math.sqrt(mu * (2 / r2 - 1 / at));
  return { dv1, dv2, total: Math.abs(dv1) + Math.abs(dv2), time: period(at, mu) / 2, a: at };
}
/** Bi-elliptic transfer through an intermediate radius rb. */
export function biElliptic(r1: number, r2: number, rb: number, mu = MU) {
  const a1 = (r1 + rb) / 2, a2 = (r2 + rb) / 2, v = (r: number, a: number) => Math.sqrt(mu * (2 / r - 1 / a));
  const dv1 = v(r1, a1) - Math.sqrt(mu / r1), dv2 = v(rb, a2) - v(rb, a1), dv3 = Math.abs(v(r2, a2) - Math.sqrt(mu / r2));
  return { dv: [dv1, dv2, dv3], total: Math.abs(dv1) + Math.abs(dv2) + dv3, time: (period(a1, mu) + period(a2, mu)) / 2 };
}
/** Turning a circular orbit's plane by Δi at speed v: 2 v sin(Δi/2). */
export const planeChange = (v: number, di: number) => 2 * v * Math.sin(di / 2);

/** Lambert's problem by universal variables (Vallado's algorithm): the velocities at r1 and r2 for the transfer taking
 * `tof` seconds, the short way round (or the long way). */
export function lambert(r1: V3, r2: V3, tof: number, longWay = false, mu = MU): { v1: V3; v2: V3 } | null {
  const n1 = norm(r1), n2 = norm(r2), cosd = dot(r1, r2) / (n1 * n2), tm = longWay ? -1 : 1;
  const A = tm * Math.sqrt(n1 * n2 * (1 + cosd));
  if (Math.abs(A) < 1e-12) return null;
  const C = (z: number) => (z > 1e-6 ? (1 - Math.cos(Math.sqrt(z))) / z : z < -1e-6 ? (Math.cosh(Math.sqrt(-z)) - 1) / -z : 0.5 - z / 24);
  const S = (z: number) => (z > 1e-6 ? (Math.sqrt(z) - Math.sin(Math.sqrt(z))) / z ** 1.5 : z < -1e-6 ? (Math.sinh(Math.sqrt(-z)) - Math.sqrt(-z)) / (-z) ** 1.5 : 1 / 6 - z / 120);
  const y = (z: number) => n1 + n2 + (A * (z * S(z) - 1)) / Math.sqrt(C(z));
  const time = (z: number) => { const yy = y(z); if (yy < 0) return -Infinity; return ((yy / C(z)) ** 1.5 * S(z) + A * Math.sqrt(yy)) / Math.sqrt(mu); };
  // Bisection on z: time rises with z.
  let lo = -4 * Math.PI * Math.PI, hi = 4 * Math.PI * Math.PI;
  while (y(lo) < 0) lo += 0.1;
  for (let k = 0; k < 200; k++) { const z = (lo + hi) / 2; if (time(z) < tof) lo = z; else hi = z; if (hi - lo < 1e-12) break; }
  const z = (lo + hi) / 2, yy = y(z), f = 1 - yy / n1, g = A * Math.sqrt(yy / mu), gd = 1 - yy / n2;
  if (!Number.isFinite(f) || Math.abs(time(z) - tof) > 1e-3 * tof) return null;
  return { v1: sc(add(r2, sc(r1, -f)), 1 / g), v2: sc(add(sc(r2, gd), sc(r1, -1)), 1 / g) };
}

/** The rocket equation, staged: each stage [wet mass, dry mass, Isp s] in kg; the payload rides on top. Δv in km/s. */
export function rocket(stages: [number, number, number][], payload: number) {
  let total = 0;
  const each = stages.map((_, k) => {
    const above = stages.slice(k + 1).reduce((s, st) => s + st[0], 0) + payload, [wet, dry, isp] = stages[k];
    const dv = isp * G0 * Math.log((wet + above) / (dry + above));
    total += dv;
    return dv;
  });
  return { each, total };
}
