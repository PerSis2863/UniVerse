import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import type { Lab } from './interp';
import { mat, num, str, toMat, type Value } from './values';
import { table } from './table';
import * as sp from './space';

// Hyperion's space flight in the language (M490), in MATLAB's units (metres, m/s, degrees, seconds): keplerian2ijk and
// ijk2keplerian (MATLAB's names and argument order), orbitPropagate, hohmannTransfer, biEllipticTransfer, lambertSolve,
// rocketDeltaV, sunSyncInclination, nodalPrecession. The maths (space.ts) works in kilometres.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: ArrayLike<number>) => mat(1, v.length, v);
const col = (v: ArrayLike<number>) => mat(v.length, 1, v);
const D = Math.PI / 180;
const n1 = (v: Value | undefined, what: string) => { const x = toMat(v ?? num(NaN), what).d[0]; if (!Number.isFinite(x)) throw new LabError(`${what} must be a number.`); return x; };
const v3 = (v: Value | undefined, what: string): sp.V3 => { const d = toMat(v ?? mat(0, 0), what).d; if (d.length !== 3) throw new LabError(`${what} needs three numbers (metres or m/s).`); return [d[0] / 1000, d[1] / 1000, d[2] / 1000]; };
const opts = (a: Value[], from: number) => { const o = new Map<string, Value>(); for (let i = from; i < a.length; i += 2) { if (a[i]?.k !== 'str') throw new LabError('Options come as name, value pairs.'); o.set((a[i] as { v: string }).v.toLowerCase(), a[i + 1] ?? num(NaN)); } return o; };

def('keplerian2ijk', (a) => {
  if (a.length < 6) throw new LabError('keplerian2ijk takes the semi-major axis (m), eccentricity, inclination, RAAN, argument of periapsis and true anomaly (degrees).');
  const A = n1(a[0], 'The semi-major axis') / 1000, e = n1(a[1], 'The eccentricity');
  if (!(A > 0) || !(e >= 0 && e < 1)) throw new LabError('An orbit here is an ellipse: semi-major axis above 0, eccentricity 0 to under 1.');
  const s = sp.toState({ a: A, e, i: n1(a[2], 'The inclination') * D, raan: n1(a[3], 'The RAAN') * D, argp: n1(a[4], 'The argument of periapsis') * D, nu: n1(a[5], 'The true anomaly') * D });
  return [col(s.r.map((x) => x * 1000)), col(s.v.map((x) => x * 1000))];
});
def('ijk2keplerian', (a) => {
  const el = sp.toElements(v3(a[0], 'The position'), v3(a[1], 'The velocity'));
  return [num(el.a * 1000), num(el.e), num(el.i / D), num(el.raan / D), num(el.argp / D), num(el.nu / D)];
});
def('orbitPropagate', (a, nout, lab) => {
  if (a.length < 3) throw new LabError("orbitPropagate needs the position (m), velocity (m/s) and the time (s): orbitPropagate(r, v, 86400, 'J2', 1).");
  const r = v3(a[0], 'The position'), v = v3(a[1], 'The velocity'), T = n1(a[2], 'The time'), o = opts(a, 3);
  if (!(T > 0 && T <= 30 * 86400)) throw new LabError('orbitPropagate runs up to 30 days.');
  const dt = o.get('step') ? n1(o.get('step'), 'The step') : 10;
  if (!(dt >= 0.1 && dt <= 600) || T / dt > 2e6) throw new LabError("'Step' is 0.1 to 600 s, and at most two million steps.");
  const run = sp.propagate(r, v, T, { j2: o.get('j2') ? !!toMat(o.get('j2')!).d[0] : true, dt });
  const c = (k: 0 | 1 | 2, of: sp.V3[]) => col(of.map((p) => p[k] * 1000));
  if (nout > 0) return [table([['Time', col(run.t)], ['X', c(0, run.r)], ['Y', c(1, run.r)], ['Z', c(2, run.r)], ['Vx', c(0, run.v)], ['Vy', c(1, run.v)], ['Vz', c(2, run.v)], ['Lat', col(run.lat.map((x) => x / D))], ['Lon', col(run.lon.map((x) => x / D))], ['Alt', col(run.alt.map((x) => x * 1000))]]), num(run.crashed ? 1 : 0)];
  call(lab, 'subplot', num(1), num(2), num(1));
  call(lab, 'plot3', row(run.r.map((p) => p[0])), row(run.r.map((p) => p[1])), row(run.r.map((p) => p[2])), str('LineWidth'), num(1.5)); call(lab, 'hold', str('on'));
  const N = 24, xs: number[] = [], ys: number[] = [], zs: number[] = [];
  for (let k = 0; k <= N; k++) for (let j = 0; j <= N; j++) { const th = (TAU * j) / N, ph = Math.PI * (k / N - 0.5); xs.push(sp.RE * Math.cos(ph) * Math.cos(th)); ys.push(sp.RE * Math.cos(ph) * Math.sin(th)); zs.push(sp.RE * Math.sin(ph)); }
  const grid = (d: number[]) => mat(N + 1, N + 1, Float64Array.from({ length: d.length }, (_, q) => d[(q % (N + 1)) * (N + 1) + Math.floor(q / (N + 1))]));
  call(lab, 'mesh', grid(xs), grid(ys), grid(zs)); call(lab, 'hold', str('off')); call(lab, 'axis', str('equal')); call(lab, 'title', str(run.crashed ? 'It fell back to Earth' : 'The orbit (km)'));
  call(lab, 'subplot', num(1), num(2), num(2));
  // Breaks where the track wraps from +180° to −180°.
  const lon: number[] = [], lat: number[] = [];
  run.lon.forEach((x, k) => { if (k && Math.abs(x - run.lon[k - 1]) > Math.PI) { lon.push(NaN); lat.push(NaN); } lon.push(x / D); lat.push(run.lat[k] / D); });
  call(lab, 'plot', row(lon), row(lat), str('.'), str('MarkerSize'), num(3)); call(lab, 'axis', row([-180, 180, -90, 90])); call(lab, 'grid', str('on'));
  call(lab, 'xlabel', str('longitude (°)')); call(lab, 'ylabel', str('latitude (°)')); call(lab, 'title', str('Ground track'));
  return [];
});
const TAU = 2 * Math.PI;
def('hohmannTransfer', (a) => {
  const r1 = n1(a[0], 'The first radius') / 1000, r2 = n1(a[1], 'The second radius') / 1000;
  if (!(r1 > 0 && r2 > 0)) throw new LabError('The radii are from the Earth\'s centre, in metres, above 0.');
  const h = sp.hohmann(r1, r2);
  return [num(h.dv1 * 1000), num(h.dv2 * 1000), num(h.time), num(h.total * 1000)];
});
def('biEllipticTransfer', (a) => {
  const r1 = n1(a[0], 'The first radius') / 1000, r2 = n1(a[1], 'The second radius') / 1000, rb = n1(a[2], 'The middle radius') / 1000;
  if (!(r1 > 0 && r2 > 0 && rb >= Math.max(r1, r2))) throw new LabError('The middle radius must be at least the larger of the two.');
  const b = sp.biElliptic(r1, r2, rb);
  return [row(b.dv.map((x) => x * 1000)), num(b.time), num(b.total * 1000)];
});
def('lambertSolve', (a) => {
  if (a.length < 3) throw new LabError('lambertSolve takes two positions (m) and the time between them (s).');
  const tof = n1(a[2], 'The time');
  if (!(tof > 0)) throw new LabError('The time must be above 0.');
  const long = a[3]?.k === 'str' ? (a[3] as { v: string }).v.toLowerCase() === 'longway' : false;
  const r = sp.lambert(v3(a[0], 'The first position'), v3(a[1], 'The second position'), tof, long);
  if (!r) throw new LabError('No transfer joins those positions in that time (or they are exactly opposite: the plane is undefined).');
  return [col(r.v1.map((x) => x * 1000)), col(r.v2.map((x) => x * 1000))];
});
def('rocketDeltaV', (a) => {
  const m = toMat(a[0] ?? mat(0, 0), 'The stages');
  if (m.c !== 3 || m.r < 1) throw new LabError('The stages are rows [wet mass, dry mass, Isp] (kg, kg, s), the first stage first.');
  const st = Array.from({ length: m.r }, (_, i): [number, number, number] => [m.d[i], m.d[i + m.r], m.d[i + 2 * m.r]]);
  if (st.some(([w, d, isp]) => !(w > d && d > 0 && isp > 0))) throw new LabError('Each stage needs its wet mass above its dry mass, both above 0, and an Isp above 0.');
  const r = sp.rocket(st, a[1] ? n1(a[1], 'The payload') : 0);
  return [num(r.total * 1000), row(r.each.map((x) => x * 1000))];
});
def('sunSyncInclination', (a) => [num(sp.sunSyncInclination(n1(a[0], 'The height') / 1000) / D)]);
def('nodalPrecession', (a) => [num(sp.nodalDrift(n1(a[0], 'The semi-major axis') / 1000, a[1] ? n1(a[1], 'The eccentricity') : 0, (a[2] ? n1(a[2], 'The inclination') : 0) * D) / D)]);
