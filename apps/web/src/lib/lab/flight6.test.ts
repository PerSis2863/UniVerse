import { describe, expect, it } from 'vitest';
import * as fl from './flight';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './plot3d';
import './machines-lab';

// The whole aeroplane (M489c): checked against the separate up-and-down and sideways runs it joins, and wind's effects
// worked out by hand.
const ac = fl.PLANE_DEFAULT, D = Math.PI / 180;
const at = (r: { t: number[] }, t: number) => r.t.findIndex((x) => x >= t - 1e-9);
describe('Hyperion flight in six directions (M489c)', () => {
  it('holds level trim, and an elevator doublet flies as the up-and-down model does', () => {
    const still = fl.flight6(ac, 60, { points: 600 });
    expect(Math.abs(still.h.at(-1)! - 1000)).toBeLessThan(2); expect(Math.max(...still.phi.map(Math.abs))).toBeLessThan(1e-6);
    const pulse = (t: number) => (t > 1 && t < 2 ? -0.03 : t >= 2 && t < 3 ? 0.03 : 0);
    const six = fl.flight6(ac, 30, { elevator: pulse, points: 3000 }), two = fl.flightSim(ac, 30, { elevator: pulse, points: 3000 });
    for (const t of [3, 8, 15, 25]) { expect(six.h[at(six, t)]).toBeCloseTo(two.h[at(two, t)], 0); expect(six.V[at(six, t)]).toBeCloseTo(two.V[at(two, t)], 1); }
  });
  it('rolls as the sideways model does at first; in a turn it sinks unless the autopilot pulls', () => {
    const ail = (t: number) => (t > 1 && t < 2 ? 0.05 : 0);
    const six = fl.flight6(ac, 4, { aileron: ail, points: 4000 }), side = fl.lateralSim(ac, 4, { aileron: ail, points: 4000 });
    const b6 = six.phi[at(six, 2.5)], bl = side.phi[at(side, 2.5)];
    expect(b6).toBeGreaterThan(2 * D); expect(Math.abs(b6 - bl) / bl).toBeLessThan(0.15);
    // A 90° turn to the east: with height and speed held it ends on the heading within 3° and 30 m of its height;
    // banked without them it sinks.
    const held = fl.flight6(ac, 60, { holdHeading: () => Math.PI / 2, holdHeight: () => 1000, holdSpeed: 50, yawDamper: true, points: 600 });
    expect(Math.abs(held.psi.at(-1)! - Math.PI / 2)).toBeLessThan(3 * D); expect(Math.max(...held.h.map((h) => Math.abs(h - 1000)))).toBeLessThan(30);
    expect(Math.max(...held.nz)).toBeGreaterThan(1.1);
    const loose = fl.flight6(ac, 30, { holdHeading: () => Math.PI, points: 300 });
    expect(loose.h.at(-1)!).toBeLessThan(980);
  });
  it('wind: carried along by a steady wind, a 1 − cos gust lifting it less than a sharp one, turbulence by its strength', () => {
    const cross = fl.flight6(ac, 60, { wind: { steady: [0, 10, 0] }, points: 600 });
    expect(cross.e.at(-1)! / 600).toBeCloseTo(1, 1); expect(cross.V.at(-1)!).toBeCloseTo(50, 0); expect(cross.ground[0]).toBeCloseTo(Math.hypot(50, 10), 0);
    const head = fl.flight6(ac, 10, { wind: { steady: [-10, 0, 0] }, points: 100 });
    expect(head.ground.at(-1)!).toBeCloseTo(40, 0);
    // The sharp-edged gust's extra load: ρ·V·CLα·U / (2·W/S).
    const U = 5, sharp = (fl.isa(1000).rho * 50 * ac.cla * U) / ((2 * ac.m * fl.G0) / ac.S);
    const g = fl.flight6(ac, 6, { wind: { gust: { at: 1, length: 60, up: U } }, points: 6000 }), dn = Math.max(...g.nz) - 1;
    expect(dn).toBeGreaterThan(0.1); expect(dn).toBeLessThan(sharp);
    const tb = { sigma: 3, seed: 7 }, a = fl.flight6(ac, 200, { wind: { turbulence: tb }, yawDamper: true, points: 4000 }), b = fl.flight6(ac, 200, { wind: { turbulence: tb }, yawDamper: true, points: 4000 });
    expect(a.h).toEqual(b.h);
    const rms = (k: 0 | 1 | 2) => Math.sqrt(a.wind.reduce((q, w) => q + w[k] ** 2, 0) / a.wind.length);
    for (const k of [0, 1, 2] as const) { expect(rms(k)).toBeGreaterThan(2); expect(rms(k)).toBeLessThan(4); }
    expect(Math.max(...a.phi.map(Math.abs))).toBeGreaterThan(1 * D);
  });
  it('in the language (degrees for angles, the controls in radians)', { timeout: 60_000 }, () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[tr, info] = aircraftSim6DOF(aircraft(), 40, 'HoldHeading', 90, 'HoldHeight', 1000, 'HoldSpeed', 50, 'YawDamper', 1); hd = tr.Heading(end); mx = info.MaxLoadFactor; cw = aircraftSim6DOF(aircraft(), 20, 'Wind', [0 10 0]); ee = cw.East(end); figure; aircraftSim6DOF(aircraft(), 10, 'Gust', [2 60 3], 'Turbulence', 1.5, 'Seed', 2);");
    const v = (n: string) => toMat(lab.vars.get(n)!).d[0];
    expect(v('hd')).toBeCloseTo(90, -1); expect(v('mx')).toBeGreaterThan(1.05); expect(v('ee')).toBeCloseTo(200, -1);
    expect(() => lab.run("aircraftSim6DOF(aircraft(), 10, 'Wind', [1 2])")).toThrow(/north east down/);
  });
});
