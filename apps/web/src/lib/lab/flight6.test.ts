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
  it('engines failing, the propeller, wind shear and a microburst (M489d)', { timeout: 60_000 }, () => {
    const ac = fl.PLANE_DEFAULT, last = (x: number[]) => x[x.length - 1], D = 180 / Math.PI;
    // A twin's right engine fails: hands off it yaws and rolls right, towards the dead engine; the left one, left.
    const tw = { count: 2 as const, fail: { at: 2, which: 1 as const } };
    const off = fl.flight6(ac, 20, { V0: 50, h0: 1000, engines: tw }), offL = fl.flight6(ac, 20, { V0: 50, h0: 1000, engines: { count: 2, fail: { at: 2, which: 0 } } });
    expect(last(off.psi) * D).toBeGreaterThan(30); expect(last(off.phi)).toBeGreaterThan(0); expect(last(offL.psi)).toBeCloseTo(-last(off.psi), 6);
    // The autopilot holds the heading (within 5°) on left rudder, banked a little to the good engine; it sinks, less
    // with the dead propeller feathered.
    const held = fl.flight6(ac, 40, { V0: 50, h0: 1000, engines: tw, holdHeading: () => 0, yawDamper: true, points: 400 });
    const fea = fl.flight6(ac, 40, { V0: 50, h0: 1000, engines: { ...tw, feather: true }, holdHeading: () => 0, yawDamper: true, points: 400 });
    expect(Math.max(...held.psi.map(Math.abs)) * D).toBeLessThan(5); expect(last(held.dr)).toBeGreaterThan(0.05); expect(last(held.phi)).toBeLessThan(0);
    expect(last(held.h)).toBeLessThan(950); expect(last(fea.h)).toBeGreaterThan(last(held.h) + 20);
    // Vmc: full rudder just balances one engine at full power there.
    const lat = fl.LAT_DEFAULT, Vm = fl.vmc(ac, lat, 1.8, 0), q = 0.5 * 1.225 * Vm * Vm;
    expect(Vm).toBeGreaterThan(fl.stallSpeed(ac)); expect(fl.vmc(ac, lat, 1.8, 0, true)).toBeLessThan(Vm);
    expect(1.8 * (fl.thrust(ac, Vm, 0, 1) / 2 + 0.1 * q * Math.PI * 0.81)).toBeCloseTo(q * ac.S * ac.b * Math.abs(lat.cndr) * lat.drMax, 0);
    // A single engine stopping: a glide of roughly 6 to 12 to one, the speed held near its trim by the elevator.
    const gl = fl.flight6(ac, 90, { V0: 50, h0: 1000, engines: { count: 1, fail: { at: 1 } }, points: 900 }), i = gl.t.findIndex((t) => t > 60);
    const ratio = (gl.ground[i] * (last(gl.t) - gl.t[i])) / (gl.h[i] - last(gl.h));
    expect(ratio).toBeGreaterThan(6); expect(ratio).toBeLessThan(12);
    // The propeller at climb power, hands off: a swing and roll left (clockwise from behind); the other way round, right;
    // at the trimmed power (rigged for it) nothing; without the propeller nothing.
    const climb = (prop?: fl.Prop) => fl.flight6(ac, 10, { V0: 35, h0: 500, throttle: () => 1, prop, holdHeight: () => 1500 });
    const cw = climb({ dir: 1 }), ccw = climb({ dir: -1 });
    expect(last(cw.psi)).toBeLessThan(-0.1); expect(last(cw.phi)).toBeLessThan(0); expect(last(ccw.psi)).toBeCloseTo(-last(cw.psi), 6);
    expect(last(climb().psi)).toBe(0);
    expect(Math.abs(last(fl.flight6(ac, 10, { V0: 35, h0: 500, prop: { dir: 1 }, holdHeight: () => 500 }).psi))).toBeLessThan(1e-6);
    // The autopilot with its yaw damper holds it within a few degrees.
    expect(Math.max(...fl.flight6(ac, 40, { V0: 35, h0: 500, throttle: () => 1, prop: { dir: 1 }, holdHeight: () => 1500, holdHeading: () => 0, yawDamper: true }).psi.map(Math.abs)) * D).toBeLessThan(3);
    // Shear: a 5 m/s wind at 10 m is 16^(1/7) times that at 160 m; held above 500 m.
    expect(fl.windField({ steady: [0, 5, 0], shear: {} }, 0, 0, 160)[1]).toBeCloseTo(5 * 16 ** (1 / 7), 9);
    expect(fl.windField({ steady: [0, 5, 0], shear: {} }, 0, 0, 900)[1]).toBeCloseTo(fl.windField({ steady: [0, 5, 0], shear: {} }, 0, 0, 500)[1], 9);
    // A microburst: outflow away from its centre, down the middle, nothing down at the ground.
    const mb = { n: 1500, e: 0, radius: 600, outflow: 15, down: 8 }, at = (n: number, h: number) => fl.windField({ microburst: mb }, n, 0, h);
    expect(at(1000, 50)[0]).toBeLessThan(-5); expect(at(2000, 50)[0]).toBeGreaterThan(5); expect(at(1500, 300)[2]).toBeCloseTo(8, 9); expect(at(1500, 0)[2]).toBe(0);
    // Flying through it at 300 m: a headwind (faster), the downdraught, then a tailwind (slower); hands off it falls
    // far, the autopilot loses less.
    const thru = fl.flight6(ac, 60, { V0: 50, h0: 300, wind: { microburst: mb }, points: 600 }), ap = fl.flight6(ac, 60, { V0: 50, h0: 300, wind: { microburst: mb }, holdHeight: () => 300, holdSpeed: 50, points: 600 });
    expect(Math.max(...thru.V)).toBeGreaterThan(55); expect(Math.min(...thru.V)).toBeLessThan(42);
    expect(Math.min(...thru.h)).toBeLessThan(200); expect(Math.min(...ap.h)).toBeGreaterThan(Math.min(...thru.h) + 100);
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("ac = aircraft(); [t, i] = aircraftSim6DOF(ac, 20, 'Engines', 2, 'EngineFail', [2 2], 'HoldHeading', 0, 'YawDamper', 1); v = aircraftVmc(ac, 'Height', 1000); [~, j] = aircraftSim6DOF(ac, 30, 'Height', 300, 'Microburst', [1500 0 600 15 8]); [~, k] = aircraftSim6DOF(ac, 5, 'Wind', [0 5 0], 'Shear', 1/7, 'Propeller', 1); figure; aircraftSim6DOF(ac, 10, 'EngineFail', 1);");
    const f = (n: string, k: string) => toMat((lab.vars.get(n) as unknown as { f: Map<string, never> }).f.get(k)!).d[0];
    expect(f('i', 'Vmc')).toBeCloseTo(toMat(lab.vars.get('v')!).d[0], 6); expect(f('j', 'MaxAirspeed')).toBeGreaterThan(51);
  });
  it("the propeller's gyroscopic pull and turbulence by height (M489e)", { timeout: 60_000 }, () => {
    const ac = fl.PLANE_DEFAULT, last = (x: number[]) => x[x.length - 1];
    // Pitching the nose down with a clockwise propeller (from behind) yaws it left; the other way round, right.
    const go = (prop: fl.Prop) => last(fl.flight6(ac, 4, { V0: 50, h0: 1000, prop, elevator: (t) => (t < 1 ? 0.08 : 0) }).psi);
    expect(go({ dir: 1 }) - go({ dir: 1, inertia: 0 })).toBeLessThan(-1e-3);
    expect(go({ dir: -1 }) - go({ dir: -1, inertia: 0 })).toBeGreaterThan(1e-3);
    // MIL-F-8785C at 30 m with a 15 m/s wind: vertical 1.5 m/s rms over 30 m eddies; above 610 m all 1.5 m/s over 533 m.
    const lo = fl.turbulenceAt(30, 15), d = 0.177 + 0.000823 * (30 / 0.3048);
    expect(lo.s[2]).toBeCloseTo(1.5, 9); expect(lo.L[2]).toBeCloseTo(30, 6); expect(lo.s[0]).toBeCloseTo(1.5 / d ** 0.4, 9);
    expect(fl.turbulenceAt(1000, 15)).toEqual({ s: [1.5, 1.5, 1.5], L: [533, 533, 533] });
    // Flying through it: gustier along the way near the ground than high up.
    const rms = (h0: number) => { const r = fl.flight6(ac, 60, { V0: 50, h0, wind: { turbulence: { sigma: 0, w20: 15, seed: 2 } }, holdHeight: () => h0, holdSpeed: 50, holdHeading: () => 0, yawDamper: true, points: 3000 }); return Math.sqrt(r.wind.reduce((q, x) => q + x[0] ** 2, 0) / r.wind.length); };
    expect(rms(60)).toBeGreaterThan(1.5 * rms(800));
  });
  it('turning gusts (M489f)', { timeout: 60_000 }, () => {
    const ac = fl.PLANE_DEFAULT, rms = (x: number[]) => Math.sqrt(x.reduce((q, v) => q + v * v, 0) / x.length);
    const go = (rotational: boolean) => fl.flight6(ac, 60, { V0: 50, h0: 1000, wind: { turbulence: { sigma: 3, seed: 3, rotational } }, holdHeading: () => 0, holdHeight: () => 1000, holdSpeed: 50, yawDamper: true, points: 3000 });
    const flat = go(false), turning = go(true);
    // The air rolling and turning too: it rocks more, and the same seed flies the same.
    expect(rms(turning.p)).toBeGreaterThan(1.1 * rms(flat.p)); expect(rms(turning.phi)).toBeGreaterThan(rms(flat.phi));
    expect(go(true).p).toEqual(turning.p);
  });
  it('a gust front reaching one wing first (M489g)', { timeout: 60_000 }, () => {
    const go = (deg: number) => fl.flight6(ac, 12, { V0: 50, h0: 1000, wind: { gust: { at: 2, length: 60, up: 5, skew: deg * D } }, points: 1200 });
    const sq = go(0), right = go(30), left = go(-30), steep = go(60), most = (x: number[]) => Math.max(...x.map(Math.abs));
    // Square on: no roll. At an angle the right wing lifts first (rolls left), mirrored from the left; steeper, more.
    expect(most(sq.phi)).toBeLessThan(1e-9);
    expect(Math.min(...right.phi)).toBeLessThan(-0.2 * D); expect(right.phi.findIndex((x) => x < -0.1 * D)).toBeLessThan(right.phi.findIndex((x) => x > 0.1 * D) >>> 0);
    right.phi.forEach((x, i) => expect(x).toBeCloseTo(-left.phi[i], 9));
    expect(most(steep.p)).toBeGreaterThan(most(right.p));
    // Much the same push upwards.
    expect(Math.max(...right.h)).toBeCloseTo(Math.max(...sq.h), 0);
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[tr, info] = aircraftSim6DOF(aircraft(), 12, 'Gust', [2 60 5 30]);");
    expect(lab.vars.get('tr')).toBeTruthy();
  });
});
