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
});
