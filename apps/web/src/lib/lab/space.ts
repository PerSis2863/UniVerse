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
export interface OrbitRun { t: number[]; r: V3[]; v: V3[]; lat: number[]; lon: number[]; alt: number[]; raan: number[]; crashed: boolean }
/** Propagates position and velocity for T seconds (RK4, step dt), with the ground track (the Earth turning under it). */
export function propagate(r0: V3, v0: V3, T: number, o: { j2?: boolean; dt?: number; points?: number; gst0?: number } = {}): OrbitRun {
  // The step shrunk a little so the last one lands exactly at T.
  const n = Math.max(1, Math.ceil(T / (o.dt ?? 10))), dt = T / n, every = Math.max(1, Math.floor(n / (o.points ?? 2000))), j2 = o.j2 ?? true;
  let r = r0, v = v0, crashed = false;
  const out: OrbitRun = { t: [], r: [], v: [], lat: [], lon: [], alt: [], raan: [], crashed: false };
  const f = (x: V3, y: V3): [V3, V3] => [y, gravity(x, j2)];
  for (let k = 0; k <= n; k++) {
    const t = k * dt;
    if (k % every === 0 || k === n) {
      const rn = norm(r), lat = Math.asin(r[2] / rn), lon = Math.atan2(r[1], r[0]) - ((o.gst0 ?? 0) + WE * t);
      out.t.push(t); out.r.push(r); out.v.push(v); out.lat.push(lat); out.lon.push(Math.atan2(Math.sin(lon), Math.cos(lon))); out.alt.push(rn - RE); out.raan.push(toElements(r, v).raan);
    }
    if (k === n) break;
    if (norm(r) < RE) { crashed = true; break; }
    const [a1, b1] = f(r, v), [a2, b2] = f(add(r, sc(a1, dt / 2)), add(v, sc(b1, dt / 2))), [a3, b3] = f(add(r, sc(a2, dt / 2)), add(v, sc(b2, dt / 2))), [a4, b4] = f(add(r, sc(a3, dt)), add(v, sc(b3, dt)));
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
