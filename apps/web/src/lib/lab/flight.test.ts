import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './plot3d';
import './machines-lab';
import * as fl from './flight';

describe('Hyperion flight dynamics (M489)', () => {
  const ac = fl.PLANE_DEFAULT;
  it('the standard atmosphere matches its tables', () => {
    const s = fl.isa(0), t = fl.isa(11000), u = fl.isa(20000);
    expect(s.rho).toBeCloseTo(1.225, 3); expect(s.a).toBeCloseTo(340.3, 1);
    expect(t.T).toBeCloseTo(216.65, 2); expect(t.P).toBeCloseTo(22632, -1);
    expect(u.P).toBeCloseTo(5474.9, -1); expect(fl.isa(5000).rho).toBeCloseTo(0.7364, 3);
  });
  it('trimmed level flight stays level; slower needs more angle of attack', () => {
    const slow = fl.trim(ac, 35, 1000), fast = fl.trim(ac, 60, 1000);
    expect(slow.ok && fast.ok).toBe(true); expect(slow.alpha).toBeGreaterThan(fast.alpha);
    const r = fl.flightSim(ac, 60, { V0: 50, h0: 1000 });
    expect(Math.abs(r.h.at(-1)! - 1000)).toBeLessThan(1); expect(r.V.at(-1)!).toBeCloseTo(50, 1);
    expect(fl.trim(ac, 20, 1000).ok).toBe(false); // below the stall
  });
  it('the modes: a quick well-damped short period and a slow lightly-damped phugoid near √2·π·V/g', () => {
    const m = fl.modes(ac, fl.trim(ac, 50, 1000));
    const sp = m.find((x) => x.name === 'short period')!, ph = m.find((x) => x.name === 'phugoid')!;
    expect(sp.period).toBeLessThan(3); expect(sp.damping).toBeGreaterThan(0.3);
    expect(ph.damping).toBeLessThan(0.2); expect(ph.period / ((Math.SQRT2 * Math.PI * 50) / fl.G0)).toBeCloseTo(1, 0);
  });
  it('an elevator pulse sets off the phugoid; the autopilot climbs and holds; pulling hard stalls the wing', () => {
    const d = fl.flightSim(ac, 120, { elevator: (s) => (s > 1 && s < 2 ? -0.03 : 0) });
    expect(Math.max(...d.h) - 1000).toBeGreaterThan(5); expect(d.stalled).toBe(false);
    const ap = fl.flightSim(ac, 120, { holdHeight: (s) => (s < 5 ? 1000 : 1150), holdSpeed: 50 });
    expect(ap.h.at(-1)!).toBeCloseTo(1150, -1); expect(ap.V.at(-1)!).toBeCloseTo(50, 0);
    expect(fl.flightSim(ac, 30, { elevator: (s) => (s > 1 ? -0.3 : 0), throttle: () => -1 }).stalled).toBe(true);
  });
  it('performance: stall speed by hand, the glide ratio, climb best between stall and top speed', () => {
    const p = fl.performance(ac);
    expect(p.stall).toBeCloseTo(Math.sqrt((2 * ac.m * fl.G0) / (1.225 * ac.S * (ac.cl0 + ac.cla * ac.alphaStall))), 6);
    expect(p.glideRatio).toBeCloseTo(1 / (2 * Math.sqrt(ac.cd0 * ac.k)), 9);
    expect(p.bestClimbSpeed).toBeGreaterThan(p.stall); expect(p.bestClimbSpeed).toBeLessThan(p.topSpeed);
    expect(p.ceiling).toBeGreaterThan(2000);
    const t = fl.turn(50, Math.PI / 3);
    expect(t.n).toBeCloseTo(2, 9); expect(t.radius).toBeCloseTo(2500 / (fl.G0 * Math.sqrt(3)), 6);
  });
  it('rolling and yawing (M489b): the three sideways modes, the roll answering the aileron, a turn by the numbers, the yaw damper', () => {
    const ac = fl.PLANE_DEFAULT, m = fl.lateralModes(ac, 50, 1000), by = (n: string) => m.find((x) => x.name === n)!;
    expect(m.map((x) => x.name)).toEqual(['Dutch roll', 'roll', 'spiral']);
    expect(by('Dutch roll').period).toBeGreaterThan(1.5); expect(by('Dutch roll').period).toBeLessThan(4);
    expect(by('Dutch roll').damping).toBeGreaterThan(0.05); expect(by('roll').re).toBeLessThan(-3);
    expect(Math.abs(by('spiral').re)).toBeLessThan(0.1);
    // A held aileron: the roll rate reaches about the one where damping meets the aileron, −(2V/b)·Clδa·δa / Clp.
    const ail = fl.lateralSim(ac, 2, { aileron: (t) => (t > 0.2 ? 0.05 : 0) }), want = (-(2 * 50) / ac.b) * fl.LAT_DEFAULT.clda * 0.05 / fl.LAT_DEFAULT.clp;
    expect(Math.max(...ail.p) / want).toBeGreaterThan(0.6); expect(Math.max(...ail.p) / want).toBeLessThan(1.05);
    // A held 30° bank: the heading turns at g·tan φ / V, as in levelTurn.
    const b = fl.lateralSim(ac, 60, { holdBank: () => Math.PI / 6 }), n = b.t.length, rate = (b.psi[n - 1] - b.psi[n - 101]) / (b.t[n - 1] - b.t[n - 101]);
    expect(rate / ((fl.G0 * Math.tan(Math.PI / 6)) / 50)).toBeCloseTo(1, 1);
    expect(fl.lateralSim(ac, 60, { holdHeading: () => Math.PI / 2 }).psi.at(-1)!).toBeCloseTo(Math.PI / 2, 2);
    // The rudder kick's Dutch roll dies away faster with the yaw damper.
    const kick = (yawDamper: boolean) => { const r = fl.lateralSim(ac, 12, { rudder: (t) => (t > 0.5 && t < 1 ? 0.1 : t >= 1 && t < 1.5 ? -0.1 : 0), yawDamper }); return Math.max(...r.beta.slice(Math.floor(r.beta.length * 0.6)).map(Math.abs)); };
    expect(kick(true)).toBeLessThan(0.5 * kick(false));
  });
  it('in the language', { timeout: 30_000 }, () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[T, a, P, rho] = atmosisa([0 11000]); ac = aircraft(); tr = aircraftTrim(ac, 50, 1000); m = aircraftModes(ac, 50, 1000); per = m.Period(1); [r, info] = aircraftSim(ac, 30, 'HoldHeight', 1100, 'HoldSpeed', 50); p = aircraftPerformance(ac); [n, R, tt] = levelTurn(50, 60); figure; aircraftSim(ac, 60, 'Elevator', @(t) -0.03*(t > 1 & t < 2)); figure; aircraftPerformance(ac); lm = aircraftLateralModes(ac, 50, 1000); dp = lm.Period(1); lr = aircraftLateralSim(ac, 60, 'HoldHeading', 90, 'MaxBank', 25); hd = lr.Heading(end); mb = max(lr.Bank); figure; aircraftLateralSim(ac, 15, 'Rudder', @(t) 0.1*(t > 0.5 & t < 1), 'YawDamper', 1); lm2 = aircraftLateralModes(ac, 50, 1000, 'Lateral', struct('Cnbeta', 0.12)); dp2 = lm2.Period(1);");
    const d = (n: string) => [...toMat(lab.vars.get(n)!).d];
    expect(d('rho')[0]).toBeCloseTo(1.225, 3); expect(d('T')[1]).toBeCloseTo(216.65, 2);
    expect(d('per')[0]).toBeLessThan(3); expect(d('n')[0]).toBeCloseTo(2, 9);
    expect(d('dp')[0]).toBeGreaterThan(1.5); expect(d('hd')[0]).toBeCloseTo(90, 0); expect(d('mb')[0]).toBeLessThan(26);
    // A bigger fin (more weathercock stability) swings faster.
    expect(d('dp2')[0]).toBeLessThan(d('dp')[0]);
  });
});
