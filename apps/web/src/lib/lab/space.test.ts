import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './plot3d';
import './machines-lab';
import * as sp from './space';

describe('Hyperion space flight (M490)', () => {
  it('elements and state vectors round trip; Kepler and the period', () => {
    const el = { a: 7000, e: 0.1, i: 0.9, raan: 1, argp: 0.5, nu: 2 }, s = sp.toState(el), b = sp.toElements(s.r, s.v);
    for (const k of ['a', 'e', 'i', 'raan', 'argp', 'nu'] as const) expect(b[k]).toBeCloseTo(el[k], 8);
    expect(sp.period(sp.RE + 35786) / 3600).toBeCloseTo(23.93, 2);
    const E = sp.keplerE(1, 0.5);
    expect(E - 0.5 * Math.sin(E)).toBeCloseTo(1, 12);
  });
  it('propagation: without J2 an orbit closes after one period; with it the node drifts as the formula says', () => {
    const s = sp.toState({ a: 7000, e: 0.01, i: 0.9, raan: 0, argp: 0, nu: 0 }), T = sp.period(7000);
    const r = sp.propagate(s.r, s.v, T, { j2: false, dt: 1 });
    expect(Math.hypot(...r.r.at(-1)!.map((x, k) => x - s.r[k]))).toBeLessThan(0.1);
    const iss = sp.toState({ a: sp.RE + 420, e: 0, i: (51.64 * Math.PI) / 180, raan: 0, argp: 0, nu: 0 }), day = sp.propagate(iss.r, iss.v, 86400);
    const drift = Math.atan2(Math.sin(day.raan.at(-1)! - day.raan[0]), Math.cos(day.raan.at(-1)! - day.raan[0]));
    expect(drift / sp.nodalDrift(sp.RE + 420, 0, (51.64 * Math.PI) / 180)).toBeCloseTo(1, 1);
    expect((sp.sunSyncInclination(700) * 180) / Math.PI).toBeCloseTo(98.19, 1);
  });
  it('transfers: LEO to GEO by Hohmann; bi-elliptic wins only for a big ratio; Lambert matches Vallado’s example', () => {
    expect(sp.hohmann(sp.RE + 300, 42164).total).toBeCloseTo(3.89, 2);
    expect(sp.biElliptic(7000, 7000 * 20, 7000 * 40).total).toBeLessThan(sp.hohmann(7000, 7000 * 20).total);
    expect(sp.biElliptic(7000, 7000 * 5, 7000 * 10).total).toBeGreaterThan(sp.hohmann(7000, 7000 * 5).total);
    const l = sp.lambert([5000, 10000, 2100], [-14600, 2500, 7000], 3600)!;
    expect(l.v1[0]).toBeCloseTo(-5.9925, 3); expect(l.v1[1]).toBeCloseTo(1.9254, 3); expect(l.v2[0]).toBeCloseTo(-3.3125, 3);
    // Flying the Lambert orbit really arrives.
    const end = sp.propagate([5000, 10000, 2100], l.v1, 3600, { j2: false, dt: 1 }).r.at(-1)!;
    expect(Math.hypot(end[0] + 14600, end[1] - 2500, end[2] - 7000)).toBeLessThan(1);
  });
  it('the rocket equation, staged', () => {
    const one = sp.rocket([[100, 10, 300]], 0);
    expect(one.total).toBeCloseTo(300 * sp.G0 * Math.log(10), 9);
    expect(sp.rocket([[400000, 25000, 290], [100000, 6000, 340]], 15000).total).toBeGreaterThan(9);
  });
  it('in the language (metres, m/s, degrees)', { timeout: 30_000 }, () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[r, v] = keplerian2ijk(7000e3, 0.01, 51.6, 10, 20, 30); [a, e, i, O, w, nu] = ijk2keplerian(r, v); [dv1, dv2, t] = hohmannTransfer(6678e3, 42164e3); [v1, v2] = lambertSolve([5000 10000 2100]*1e3, [-14600 2500 7000]*1e3, 3600); [dvT, each] = rocketDeltaV([400000 25000 290; 100000 6000 340], 15000); ss = sunSyncInclination(700e3); [tr, fell] = orbitPropagate(r, v, 6000); figure; orbitPropagate(r, v, 3*5900); jd = juliandate([2026 3 20 14 46 0]); jd2 = juliandate(2000, 1, 1, 12, 0, 0); mp = moonPosition([1992 4 12]); [gr, gv] = keplerian2ijk(42164170, 0, 0.001, 0, 0, 0); tb = orbitPropagate(gr, gv, 5*86400, 'Step', 120, 'Sun', 1, 'Moon', 1, 'Epoch', [2026 1 1]); figure; orbitPropagate(gr, gv, 86400, 'Step', 120, 'Sun', 1, 'Moon', 1, 'Epoch', jd);");
    const d = (n: string) => [...toMat(lab.vars.get(n)!).d];
    expect(d('a')[0]).toBeCloseTo(7000e3, 0); expect(d('i')[0]).toBeCloseTo(51.6, 8); expect(d('nu')[0]).toBeCloseTo(30, 6);
    expect(d('dv1')[0] + d('dv2')[0]).toBeCloseTo(3893, -1); expect(d('v1')[0]).toBeCloseTo(-5992.5, 0);
    expect(d('ss')[0]).toBeCloseTo(98.19, 1); expect(d('fell')).toEqual([0]);
    expect(d('jd2')[0]).toBe(2451545); expect(d('jd')[0]).toBeGreaterThan(2461119); expect(Math.hypot(...d('mp')) / 1000).toBeCloseTo(368410, -3);
  });
  it("the Sun's cycle (M490d): thicker air aloft at an active Sun, the same below 150 km, satellites falling sooner", () => {
    expect(sp.airDensity(400, 150)).toBe(sp.airDensity(400));
    expect(sp.airDensity(100, 70)).toBeCloseTo(sp.airDensity(100), 15);
    const quiet = sp.airDensity(400, 70) / sp.airDensity(400), active = sp.airDensity(400, 230) / sp.airDensity(400);
    expect(quiet).toBeGreaterThan(0.2); expect(quiet).toBeLessThan(0.45);
    expect(active).toBeGreaterThan(1.7); expect(active).toBeLessThan(3);
    // The swing grows with height, and is continuous across the table's layers.
    expect(sp.airDensity(800, 230) / sp.airDensity(800)).toBeGreaterThan(active);
    expect(sp.airDensity(399.999, 230) / sp.airDensity(400, 230)).toBeCloseTo(1, 4);
    expect(sp.solarFlux(2019.95)).toBeCloseTo(70, 6); expect(sp.solarFlux(2025.45)).toBeCloseTo(180, 6); expect(sp.solarFlux(2030.95)).toBeCloseTo(70, 6);
    const q = sp.decayTime(400, 0.008, 70), a = sp.decayTime(400, 0.008), hot = sp.decayTime(400, 0.008, 230);
    expect(q).toBeGreaterThan(2 * a); expect(hot).toBeLessThan(0.7 * a);
    // Launched near a maximum it comes down sooner than near a minimum.
    expect(sp.decayTime(400, 0.008, 2025)).toBeLessThan(sp.decayTime(400, 0.008, 2030));
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("a = airDensity(400e3, 230) / airDensity(400e3); d = orbitDecay(400e3, 0.008, 2030); F = solarFlux([2019.95 2025.45]); [r, v] = keplerian2ijk(6378137+300e3, 0, 51.6, 0, 0, 0); tr = orbitPropagate(r, v, 600, 'Drag', 0.01, 'SolarFlux', 70);");
    expect((lab.vars.get('a') as { d: Float64Array }).d[0]).toBeCloseTo(active, 9);
    expect((lab.vars.get('F') as { d: Float64Array }).d[1]).toBeCloseTo(180, 6);
    expect(() => lab.run("airDensity(4e5, 900)")).toThrow(/50 to 300/);
  });
  it('air drag (M490c): density table, the orbit shrinking at the rate the formula gives, a low orbit falling', { timeout: 30_000 }, () => {
    expect(sp.airDensity(0)).toBeCloseTo(1.225, 6);
    expect(sp.airDensity(400)).toBeCloseTo(3.725e-12, 15);
    expect(sp.airDensity(420) / sp.airDensity(400)).toBeCloseTo(Math.exp(-20 / 58.515), 6);
    // Two days at 400 km, bc 0.01: the semi-major axis falls by ρ·bc·√(μa) a second (±25%: the air turns with the
    // Earth, the orbit isn't quite circular, the bulge stirs a).
    const a0 = sp.RE + 400, s = sp.toState({ a: a0, e: 0, i: 0.9, raan: 0, argp: 0, nu: 0 }), T = 2 * 86400, bc = 0.01;
    const meanA = (r: ReturnType<typeof sp.propagate>, from: number) => { const xs = r.r.slice(from).map((q, k) => sp.toElements(q, r.v[from + k]).a); return xs.reduce((p, x) => p + x, 0) / xs.length; };
    const per = Math.round(sp.period(a0) / 10);
    const run = sp.propagate(s.r, s.v, T, { dt: 10, drag: bc, points: 1e6 }), still = sp.propagate(s.r, s.v, T, { dt: 10, points: 1e6 });
    const fell = (meanA(still, run.r.length - per) - meanA(run, run.r.length - per)) * 1000, want = sp.airDensity(400) * bc * Math.sqrt(sp.MU * a0) * 1e6 * T;
    expect(fell / want).toBeGreaterThan(0.75); expect(fell / want).toBeLessThan(1.25);
    // A 160 km orbit falls within days; the station's lasts about a year or two; 800 km lasts for decades.
    const low = sp.toState({ a: sp.RE + 160, e: 0, i: 0.9, raan: 0, argp: 0, nu: 0 });
    expect(sp.propagate(low.r, low.v, 10 * 86400, { dt: 5, drag: 0.02, points: 50 }).crashed).toBe(true);
    expect(sp.decayTime(160, 0.02)).toBeLessThan(5);
    const iss = sp.decayTime(400, 0.008); expect(iss).toBeGreaterThan(150); expect(iss).toBeLessThan(1500);
    expect(sp.decayTime(800, 0.01)).toBeGreaterThan(20 * 365);
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("rho = airDensity([0 400e3]); d = orbitDecay(400e3, 0.008); [r, v] = keplerian2ijk(6378137+300e3, 0, 51.6, 0, 0, 0); [tr, fell] = orbitPropagate(r, v, 6000, 'Drag', 0.01);");
    expect([...toMat(lab.vars.get('rho')!).d][0]).toBeCloseTo(1.225, 6); expect([...toMat(lab.vars.get('fell')!).d]).toEqual([0]);
    expect([...toMat(lab.vars.get('d')!).d][0]).toBeCloseTo(iss, 6);
  });
});
