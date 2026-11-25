import { LabError } from './parse';
import { random } from './builtins';
import { textOf } from './interp';
import { mat, num, str, toMat, type Value } from './values';
import * as gs from './geo';
import { call, def, need, nums, options, optNum, record, row } from './sci-kit';

// Hyperion's geoscience in the language (M498): seismogram, staLta, pickArrival, locateQuake, spDistance,
// localMagnitude; distance, azimuth, reckon, deg2km, km2deg, wgs84Ellipsoid (MATLAB's Mapping Toolbox names; its
// ellipsoid is an object, ours the vector [a e]); mapProject, ll2utm, utm2ll, fractalTerrain, slopeAspect, hillshade
// (our own names: MATLAB uses projcrs objects and gradientm).

const grid = (Z: number[][]) => { const m = mat(Z.length, Z[0]?.length ?? 0); Z.forEach((r, i) => r.forEach((v, j) => { m.d[i + j * Z.length] = v; })); return m; };
const unGrid = (v: Value | undefined, what: string) => { const m = toMat(v ?? num(NaN), what); if (m.r < 3 || m.c < 3) throw new LabError(`${what} is a grid of heights, at least 3 × 3.`); return Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c }, (_, j) => m.d[i + j * m.r])); };
/** Applies f element by element over same-sized (or scalar) arguments. */
function each(args: (Value | undefined)[], what: string[], f: (...x: number[]) => number) {
  const ms = args.map((a, i) => toMat(a ?? num(NaN), what[i])), big = ms.reduce((b, m) => (m.d.length > b.d.length ? m : b), ms[0]);
  if (ms.some((m) => m.d.length !== 1 && m.d.length !== big.d.length)) throw new LabError(`${what.join(', ')} must be the same size (or single numbers).`);
  return mat(big.r, big.c, Array.from(big.d, (_, k) => f(...ms.map((m) => (m.d.length === 1 ? m.d[0] : m.d[k])))));
}

def('seismogram', (a, nout, lab) => {
  const d = need(a[0], 'The distance (km)'), fs = a[1] ? need(a[1], 'The sample rate') : 100, T = a[2] ? need(a[2], 'The length (s)') : Math.max(30, d / 3.5 + 20);
  const o = options(a, 3, ['Vp', 'Vs', 'Origin', 'Noise'], 'seismogram');
  if (!(d >= 0 && fs > 0 && T > 0 && fs * T <= 2e6)) throw new LabError('seismogram(distance km, fs, seconds): at most 2 million samples.');
  const r = gs.seismogram(d, fs, T, random, { vp: optNum(o, 'Vp', 6), vs: optNum(o, 'Vs', 3.5), origin: optNum(o, 'Origin', 5), noise: optNum(o, 'Noise', 0.02) });
  const t = Array.from(r.x, (_, i) => i / fs);
  if (nout > 0) return [row(r.x), row(t), num(r.tp), num(r.ts)];
  call(lab, 'plot', row(t), row(r.x)); call(lab, 'xlabel', str('Time (s)')); call(lab, 'ylabel', str('Ground velocity'));
  call(lab, 'title', str(`${d} km away: P at ${r.tp.toFixed(2)} s, S at ${r.ts.toFixed(2)} s`)); call(lab, 'grid', str('on'));
  return [];
});
def('staLta', (a) => { const x = nums(a[0], 'The trace'), fs = need(a[1], 'The sample rate'); return [row(gs.staLta(x, fs, a[2] ? need(a[2], 'STA (s)') : 0.5, a[3] ? need(a[3], 'LTA (s)') : 10))]; });
def('pickArrival', (a, nout, lab) => {
  const x = nums(a[0], 'The trace'), fs = need(a[1], 'The sample rate'), o = options(a, 2, ['STA', 'LTA', 'On'], 'pickArrival');
  if (!(fs > 0) || x.length < 10) throw new LabError('pickArrival needs a trace and its sample rate.');
  const t = gs.pick(x, fs, { sta: optNum(o, 'STA', 0.5), lta: optNum(o, 'LTA', 10), on: optNum(o, 'On', 4) });
  if (nout > 0) return [num(t)];
  const tt = x.map((_, i) => i / fs), peak = Math.max(...x.map(Math.abs));
  call(lab, 'plot', row(tt), row(x)); call(lab, 'hold', str('on')); call(lab, 'plot', row([t, t]), row([-peak, peak]), str('r--'), str('LineWidth'), num(2)); call(lab, 'hold', str('off'));
  call(lab, 'xlabel', str('Time (s)')); call(lab, 'title', str(Number.isNaN(t) ? 'No arrival found' : `Arrival picked at ${t.toFixed(2)} s`)); call(lab, 'grid', str('on'));
  return [];
});
def('locateQuake', (a, nout, lab) => {
  const S = toMat(a[0] ?? num(NaN), 'The stations'), tp = nums(a[1], 'The arrival times');
  if (S.c !== 2 || S.r < 3 || tp.length !== S.r) throw new LabError('locateQuake needs stations as rows [x y] (km, at least 3) and a P arrival time for each.');
  const o = options(a, 2, ['Vp', 'Depth'], 'locateQuake'), vp = optNum(o, 'Vp', 6), depth = !!optNum(o, 'Depth', 0);
  if (!(vp > 0) || (depth && S.r < 4)) throw new LabError("'Vp' is positive; finding the depth needs at least 4 stations.");
  const st = Array.from({ length: S.r }, (_, i) => [S.d[i], S.d[i + S.r]]), r = gs.locate(st, tp, vp, { depth });
  const out = record([['X', r.x], ['Y', r.y], ['Depth', r.depth], ['OriginTime', r.t0], ['RMS', r.rms], ['Residuals', r.residuals]]);
  if (nout > 0) return [out];
  call(lab, 'plot', row(st.map((s) => s[0])), row(st.map((s) => s[1])), str('^'), str('MarkerSize'), num(10)); call(lab, 'hold', str('on'));
  call(lab, 'plot', num(r.x), num(r.y), str('rp'), str('MarkerSize'), num(16), str('MarkerFaceColor'), str('r'));
  for (const s of st) { const d = Math.hypot(s[0] - r.x, s[1] - r.y), th = Array.from({ length: 73 }, (_, k) => (k * Math.PI) / 36); call(lab, 'plot', row(th.map((q) => r.x + d * Math.cos(q))), row(th.map((q) => r.y + d * Math.sin(q))), str(':')); }
  call(lab, 'hold', str('off')); call(lab, 'axis', str('equal')); call(lab, 'xlabel', str('East (km)')); call(lab, 'ylabel', str('North (km)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Epicentre (${r.x.toFixed(1)}, ${r.y.toFixed(1)}) km, origin ${r.t0.toFixed(2)} s, RMS ${r.rms.toFixed(3)} s`));
  return [];
});
def('spDistance', (a) => [each([a[0], a[1], a[2]].map((v, i) => v ?? num([NaN, 6, 3.5][i])), ['S − P time', 'Vp', 'Vs'], (dt, vp, vs) => gs.spDistance(dt, vp, vs))]);
def('localMagnitude', (a) => [each([a[0], a[1]], ['The amplitude (mm)', 'The distance (km)'], gs.localMagnitude)]);

const RE = gs.EARTH_R;
def('deg2km', (a) => [each([a[0], a[1] ?? num(RE)], ['The degrees', 'The radius'], (d, R) => (d * Math.PI * R) / 180)]);
def('km2deg', (a) => [each([a[0], a[1] ?? num(RE)], ['The kilometres', 'The radius'], (k, R) => (k * 180) / (Math.PI * R))]);
def('wgs84Ellipsoid', () => [row(gs.WGS84)]);
def('distance', (a) => {
  if (a.length < 4) throw new LabError('distance(lat1, lon1, lat2, lon2): the great-circle angle in degrees; with a radius or [a e] the length in its units.');
  const e = a[4] ? nums(a[4], 'The ellipsoid') : null;
  if (e && e.length === 2) { if (!(e[0] > 0 && e[1] >= 0 && e[1] < 1)) throw new LabError('The ellipsoid is [semimajor axis, eccentricity].'); return [each(a.slice(0, 4), ['lat1', 'lon1', 'lat2', 'lon2'], (p, q, r, s) => gs.vincenty(p, q, r, s, e as [number, number]))]; }
  const R = e ? e[0] : NaN;
  return [each(a.slice(0, 4), ['lat1', 'lon1', 'lat2', 'lon2'], (p, q, r, s) => (e ? (gs.arc(p, q, r, s) * Math.PI * R) / 180 : gs.arc(p, q, r, s)))];
});
def('azimuth', (a) => { if (a.length < 4) throw new LabError('azimuth(lat1, lon1, lat2, lon2): the bearing in degrees from north.'); return [each(a.slice(0, 4), ['lat1', 'lon1', 'lat2', 'lon2'], gs.bearing)]; });
def('reckon', (a) => {
  if (a.length < 4) throw new LabError('reckon(lat, lon, arclen, az): where you arrive (arclen in degrees).');
  const lat = each(a.slice(0, 4), ['lat', 'lon', 'arclen', 'az'], (p, q, d, z) => gs.destination(p, q, d, z)[0]), lon = each(a.slice(0, 4), ['lat', 'lon', 'arclen', 'az'], (p, q, d, z) => gs.destination(p, q, d, z)[1]);
  return [lat, lon];
});
def('mapProject', (a) => {
  const lat = toMat(a[0] ?? num(NaN), 'The latitudes'), lon = toMat(a[1] ?? num(NaN), 'The longitudes'), kind = a[2] ? textOf(a[2]).toLowerCase() : 'mercator';
  if (!['mercator', 'equirectangular', 'lambert', 'orthographic'].includes(kind)) throw new LabError("mapProject's projections: 'mercator', 'equirectangular', 'lambert' (equal-area) and 'orthographic'.");
  if (lat.d.length !== lon.d.length) throw new LabError('One longitude for each latitude.');
  const o = options(a, 3, ['Origin', 'Radius'], 'mapProject'), org = o.has('Origin') ? nums(o.get('Origin')) : [0, 0], R = optNum(o, 'Radius', 1);
  const p = Array.from(lat.d, (v, k) => gs.project(kind as gs.Projection, v, lon.d[k], org[0] ?? 0, org[1] ?? 0));
  return [mat(lat.r, lat.c, p.map((q) => q[0] * R)), mat(lat.r, lat.c, p.map((q) => q[1] * R))];
});
def('ll2utm', (a) => {
  const lat = toMat(a[0] ?? num(NaN), 'The latitudes'), lon = toMat(a[1] ?? num(NaN), 'The longitudes');
  if (lat.d.length !== lon.d.length || [...lat.d].some((v) => Math.abs(v) > 84)) throw new LabError('ll2utm takes latitudes between −84° and 84°, one longitude each.');
  const zone = a[2] ? Math.round(need(a[2], 'The zone')) : undefined, r = Array.from(lat.d, (v, k) => gs.toUtm(v, lon.d[k], zone ?? Math.floor((lon.d[0] + 180) / 6) + 1));
  return [mat(lat.r, lat.c, r.map((q) => q.e)), mat(lat.r, lat.c, r.map((q) => q.n)), num(r[0]?.zone ?? NaN)];
});
def('utm2ll', (a) => {
  const E = toMat(a[0] ?? num(NaN), 'The eastings'), N = toMat(a[1] ?? num(NaN), 'The northings'), zone = Math.round(need(a[2], 'The zone')), south = a[3] ? textOf(a[3]).toLowerCase().startsWith('s') : false;
  if (!(zone >= 1 && zone <= 60) || E.d.length !== N.d.length) throw new LabError("utm2ll(E, N, zone 1–60, 'south' for the southern hemisphere).");
  const r = Array.from(E.d, (v, k) => gs.fromUtm(v, N.d[k], zone, south));
  return [mat(E.r, E.c, r.map((q) => q.lat)), mat(E.r, E.c, r.map((q) => q.lon))];
});
def('fractalTerrain', (a, nout, lab) => {
  const k = Math.round(a[0] ? need(a[0], 'The size (2^k + 1)') : 7), o = options(a, 1, ['Roughness', 'Relief'], 'fractalTerrain');
  if (!(k >= 2 && k <= 10)) throw new LabError('fractalTerrain(k) makes a (2^k + 1)² grid, k from 2 to 10.');
  const Z = gs.fractalTerrain(k, optNum(o, 'Roughness', 0.8), random, optNum(o, 'Relief', 1000));
  if (nout > 0) return [grid(Z)];
  const n = Z.length, x = row(Array.from({ length: n }, (_, i) => i));
  call(lab, 'contourf', x, x, grid(Z), num(14)); call(lab, 'colorbar'); call(lab, 'axis', str('equal')); call(lab, 'title', str('Fractal terrain (m)'));
  return [];
});
def('slopeAspect', (a) => { const Z = unGrid(a[0], 'The heights'), cell = a[1] ? need(a[1], 'The cell size') : 1, r = gs.slopeAspect(Z, cell); return [grid(r.slope), grid(r.aspect)]; });
def('hillshade', (a, nout, lab) => {
  const Z = unGrid(a[0], 'The heights'), cell = a[1] ? need(a[1], 'The cell size') : 1, o = options(a, 2, ['Azimuth', 'Altitude'], 'hillshade');
  const H = gs.hillshade(Z, cell, optNum(o, 'Azimuth', 315), optNum(o, 'Altitude', 45));
  if (nout > 0) return [grid(H)];
  call(lab, 'imagesc', grid(H)); call(lab, 'colormap', str('gray')); call(lab, 'axis', str('equal')); call(lab, 'title', str('Hillshade, sun from the north-west'));
  return [];
});
