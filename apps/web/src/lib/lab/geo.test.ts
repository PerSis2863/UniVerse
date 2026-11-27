import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as gs from './geo';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
let seed = 11;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);

describe('Hyperion geoscience (M498)', () => {
  it('picks the P arrival to within a few hundredths of a second', () => {
    const s = gs.seismogram(60, 100, 60, rand);
    expect(s.tp).toBeCloseTo(15, 9);
    expect(Math.abs(gs.pick(s.x, 100) - s.tp)).toBeLessThan(0.15);
    const r = gs.staLta(s.x, 100);
    expect(Math.max(...r.slice(0, 1400))).toBeLessThan(4);
  });
  it('locates a quake from arrival times (and its depth)', () => {
    const st = [[0, 0], [80, 10], [30, 90], [-50, 60], [60, -70]], q = [25, 30], t0 = 3, vp = 6;
    const tp = st.map((s) => t0 + Math.hypot(s[0] - q[0], s[1] - q[1]) / vp);
    const r = gs.locate(st, tp, vp);
    expect(r.x).toBeCloseTo(25, 4); expect(r.y).toBeCloseTo(30, 4); expect(r.t0).toBeCloseTo(3, 5);
    const tpz = st.map((s) => t0 + Math.hypot(s[0] - q[0], s[1] - q[1], 12) / vp), z = gs.locate(st, tpz, vp, { depth: true });
    expect(z.depth).toBeCloseTo(12, 2);
    expect(gs.spDistance(10, 6, 3.5)).toBeCloseTo(84, 9);
    // Hutton–Boore's reference event: 1 mm at 100 km is ML 3.
    expect(gs.localMagnitude(1, 100)).toBeCloseTo(3, 2);
  });
  it('distances, bearings and destinations on the globe', () => {
    // A quarter of the equator is 90°; London to Paris about 344 km; north is 0°, east 90°.
    expect(gs.arc(0, 0, 0, 90)).toBeCloseTo(90, 12);
    expect((gs.arc(51.5074, -0.1278, 48.8566, 2.3522) * Math.PI * gs.EARTH_R) / 180).toBeCloseTo(343.5, 0);
    expect(gs.bearing(0, 0, 10, 0)).toBeCloseTo(0, 12);
    expect(gs.bearing(0, 0, 0, 10)).toBeCloseTo(90, 12);
    const [la, lo] = gs.destination(10, 20, 30, 45);
    expect(gs.arc(10, 20, la, lo)).toBeCloseTo(30, 9);
    expect(gs.bearing(10, 20, la, lo)).toBeCloseTo(45, 9);
    // Vincenty: Flinders Peak to Buninyong (Vincenty's own test), 54,972.271 m.
    expect(gs.vincenty(-37.95103342, 144.42486789, -37.65282114, 143.92649554)).toBeCloseTo(54972.271, 2);
  });
  it('projections and UTM', () => {
    const [x, y] = gs.project('mercator', 45, 90);
    expect(x).toBeCloseTo(Math.PI / 2, 12);
    expect(y).toBeCloseTo(Math.log(Math.tan(Math.PI / 4 + Math.PI / 8)), 12);
    expect(gs.project('orthographic', 0, 120)[0]).toBeNaN();
    // The Lambert projection keeps area: the whole sphere fits in a disc of radius 2 (area 4π).
    expect(Math.hypot(...gs.project('lambert', 0, 179.999))).toBeCloseTo(2, 3);
    // On the central meridian the northing is k0 × the meridian arc: 4,984,944.378 m to 45° on WGS84.
    const m = gs.toUtm(45, 3);
    expect(m.e).toBeCloseTo(500000, 6);
    expect(m.n).toBeCloseTo(0.9996 * 4984944.378, 2);
    // The Eiffel Tower is in zone 31, a little west of its central meridian, and comes back where it was.
    const u = gs.toUtm(48.85826, 2.294516);
    expect(u.zone).toBe(31);
    expect(u.e).toBeGreaterThan(448000); expect(u.e).toBeLessThan(448500);
    const b = gs.fromUtm(u.e, u.n, 31);
    expect(b.lat).toBeCloseTo(48.85826, 7); expect(b.lon).toBeCloseTo(2.294516, 7); // under a millimetre
    const s = gs.toUtm(-33.8568, 151.2153), back = gs.fromUtm(s.e, s.n, s.zone, true);
    expect(s.n).toBeGreaterThan(6e6); expect(back.lat).toBeCloseTo(-33.8568, 7);
  });
  it('terrain: slope, aspect and hillshade of a plane', () => {
    // Rising 1 m per 1 m cell towards the east: 45° slope, facing west (270°).
    const Z = Array.from({ length: 5 }, () => [0, 1, 2, 3, 4]), r = gs.slopeAspect(Z, 1);
    expect(r.slope[2][2]).toBeCloseTo(45, 9); expect(r.aspect[2][2]).toBeCloseTo(270, 9);
    // Rising towards the south (rows run north to south): it faces north.
    expect(gs.slopeAspect(Array.from({ length: 5 }, (_, i) => [i, i, i, i, i]), 1).aspect[2][2]).toBeCloseTo(0, 9);
    const flat = gs.hillshade(Array.from({ length: 4 }, () => [5, 5, 5, 5]), 10, 315, 30);
    expect(flat[1][1]).toBeCloseTo(Math.sin(Math.PI / 6), 12);
    const T = gs.fractalTerrain(5, 0.8, rand);
    expect(T.length).toBe(33);
    expect(T.flat().every(Number.isFinite)).toBe(true);
  });
  it('in the language', () => {
    const r = run("d = distance(0, 0, 0, 90); km = deg2km(d); az = azimuth(0, 0, 10, 0); [la, lo] = reckon(0, 0, 90, 90);\nm = distance(-37.95103342, 144.42486789, -37.65282114, 143.92649554, wgs84Ellipsoid);\n[E, N, z] = ll2utm(48.85826, 2.294516); [lat, lon] = utm2ll(E, N, z);\nrng(1); [x, t, tp] = seismogram(50, 100, 40); p = pickArrival(x, 100);\nq = locateQuake([0 0; 80 10; 30 90; -50 60], 3 + sqrt(sum(([0 0; 80 10; 30 90; -50 60] - [25 30]).^2, 2))'/6); qx = q.X;\nZ = fractalTerrain(5); hillshade(Z, 30)\nfigure; locateQuake([0 0; 80 10; 30 90; -50 60], [8 10 13 12])");
    expect(r.d('d')[0]).toBeCloseTo(90, 12);
    expect(r.d('km')[0]).toBeCloseTo(10007.5, 0);
    expect(r.d('lo')[0]).toBeCloseTo(90, 9);
    expect(r.d('m')[0]).toBeCloseTo(54972.271, 2);
    expect(r.d('z')[0]).toBe(31);
    expect(r.d('lat')[0]).toBeCloseTo(48.85826, 7);
    expect(Math.abs(r.d('p')[0] - r.d('tp')[0])).toBeLessThan(0.15);
    expect(r.d('qx')[0]).toBeCloseTo(25, 3);
    expect(r.graphics.figures.length).toBe(2);
  });
});
