import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './plot3d';
import './machines-lab';
import * as mo from './motor';

describe('Hyperion mechatronics (M485)', () => {
  it('the DC motor settles at V·K / (R b + K²), its current at the load torque over K', () => {
    const m = mo.DC_DEFAULT, r = mo.dcSimulate(m, () => 24, 0.2, (t) => (t > 0.1 ? 0.02 : 0));
    const wNoLoad = (24 * m.k) / (m.r * m.b + m.k * m.k), at = r.t.findIndex((t) => t >= 0.099);
    expect(r.w[at]).toBeCloseTo(wNoLoad, 1);
    // With 0.02 N·m: ω = (V K − R T) / (R b + K²); i = (T + b ω) / K.
    const wLoad = (24 * m.k - m.r * 0.02) / (m.r * m.b + m.k * m.k);
    expect(r.w[r.w.length - 1]).toBeCloseTo(wLoad, 1);
    expect(r.i[r.i.length - 1]).toBeCloseTo((0.02 + m.b * wLoad) / m.k, 3);
    const [n, d] = mo.dcSpeedTf(m);
    expect(n[0] / d[2]).toBeCloseTo(wNoLoad / 24, 12);
  });
  it('Clarke and Park: balanced phases become steady d and q', () => {
    const th = 0.7, I = 5, phi = 0.3;
    const [al, be] = mo.clarke(I * Math.cos(th + phi), I * Math.cos(th + phi - (2 * Math.PI) / 3), I * Math.cos(th + phi + (2 * Math.PI) / 3));
    const [d, q] = mo.park(al, be, th);
    expect(d).toBeCloseTo(I * Math.cos(phi), 12); expect(q).toBeCloseTo(I * Math.sin(phi), 12);
    const back = mo.invClarke(...mo.invPark(d, q, th));
    expect(back[0]).toBeCloseTo(I * Math.cos(th + phi), 12);
  });
  it('field-oriented control reaches the speed, keeps i_d at 0 and carries the load with i_q = T / Kt', () => {
    const m = mo.PMSM_DEFAULT, r = mo.focSimulate(m, () => 100, 0.4, (t) => (t > 0.2 ? 2 : 0));
    const at = r.t.findIndex((t) => t >= 0.19), kt = 1.5 * m.p * m.psi;
    expect(r.w[at]).toBeCloseTo(100, 0);
    expect(Math.abs(r.id[r.id.length - 1])).toBeLessThan(0.05);
    expect(r.w[r.w.length - 1]).toBeCloseTo(100, 0);
    expect(r.iq[r.iq.length - 1]).toBeCloseTo((2 + m.b * 100) / kt, 1);
    expect(Math.max(...r.iq)).toBeLessThanOrEqual(m.imax + 1e-6);
  });
  it('a gearbox divides inertia by N², an encoder counts 4 a line', () => {
    expect(mo.gearReflect(0.5, 0.1, 10, 10, 0.9)).toEqual({ j: 0.005, b: 0.001, torque: 10 / 9 });
    const e = mo.encoder([0, 0.01, 0.02], [0, Math.PI, 2 * Math.PI], 100);
    expect(e.counts).toEqual([0, 200, 400]);
    expect(e.speed[2]).toBeCloseTo(100 * Math.PI, 9);
  });
  it('in the language: a motor for the control toolbox, and a drive', () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("m = dcmotor('K', 0.05); G = dcmotorTF(m); g = dcgain(G); T = feedback(pid(0.01, 0.5) * G, 1); y = dcgain(T); p = pmsm(); s = focSim(p, 100, 0.2); w = s.Speed(end); x = clarke([1 -0.5 -0.5]); [Jr, br, Tr] = gearReflect(0.5, 0.1, 10, 10);");
    const d = (n: string) => [...toMat(lab.vars.get(n)!).d];
    expect(d('g')[0]).toBeCloseTo(0.05 / (1.2 * 1e-5 + 0.0025), 6);
    expect(d('y')[0]).toBeCloseTo(1, 9);
    expect(d('w')[0]).toBeCloseTo(100, 0);
    expect(d('x')).toEqual([1, 0]);
    expect(d('Jr')).toEqual([0.005]);
  });
});

describe('Hyperion motors: field weakening, MTPA and steppers (M485b)', () => {
  it('field weakening takes a PMSM past its base speed; without it the voltage runs out', () => {
    const p = mo.PMSM_DEFAULT, base = p.vdc / Math.sqrt(3) / (p.p * p.psi);
    const a = mo.focSimulate(p, () => 160, 0.6, () => 0, mo.focTune(p), { fieldWeakening: false });
    const b = mo.focSimulate(p, () => 160, 0.6);
    expect(a.w.at(-1)!).toBeLessThan(base);
    expect(b.w.at(-1)!).toBeCloseTo(160, 0);
    expect(b.id.at(-1)!).toBeLessThan(-5); // the flux is weakened by a negative d current
    expect(Math.hypot(b.id.at(-1)!, b.iq.at(-1)!)).toBeLessThanOrEqual(p.imax + 0.5);
  });
  it('MTPA: a surface-magnet motor keeps i_d at 0, an interior one carries the same torque on less current', () => {
    expect(mo.mtpaId(mo.PMSM_DEFAULT, 10)).toBe(0);
    const ipm = { ...mo.PMSM_DEFAULT, ld: 0.3e-3, lq: 0.9e-3 }, id = mo.mtpaId(ipm, 10), iq = Math.sqrt(100 - id * id);
    expect(id).toBeLessThan(0);
    // At 10 A, the MTPA split gives more torque than all of it on q.
    expect(mo.torqueOf(ipm, id, iq)).toBeGreaterThan(mo.torqueOf(ipm, 0, 10));
  });
  it('a stepper keeps every step when ramped, loses them when started too fast', () => {
    const m = mo.STEPPER_DEFAULT;
    const ok = mo.stepperSimulate(m, (t) => Math.min(400, 2000 * t), 0.5, { micro: 8 });
    expect(ok.lost).toBe(0);
    expect(ok.cmd.at(-1)! / ok.stepAngle).toBeGreaterThan(150);
    expect(Math.abs(mo.stepperSimulate(m, () => 3000, 0.2, { micro: 8 }).lost)).toBeGreaterThan(100);
    const po = mo.pullOut(m, [200, 4000]);
    expect(po[0]).toBeGreaterThan(0.1); expect(po[1]).toBeLessThan(po[0]);
  });
  it('six-step brushless: the right phases per Hall sector, steady speed, a commutation dip, the speed loop (M485c)', () => {
    // Each sector drives the two phases whose back-EMFs are flat and opposite.
    expect(mo.SIX_STEP).toEqual([[0, 1], [0, 2], [1, 2], [1, 0], [2, 0], [2, 1]]);
    const m = mo.BLDC_DEFAULT, mean = (v: number[], from: number) => { const x = v.slice(from); return x.reduce((s, y) => s + y, 0) / x.length; };
    const free = mo.bldcSimulate(m, 0.4);
    // No load: back-EMF across two phases nearly meets the supply (friction takes a little).
    expect(free.w.at(-1)!).toBeGreaterThan(0.95 * m.vdc / (2 * m.ke)); expect(free.w.at(-1)!).toBeLessThan(m.vdc / (2 * m.ke));
    // Loaded at half duty: torque balances the load, and the currents add to zero.
    const r = mo.bldcSimulate(m, 0.4, { duty: () => 0.5, load: () => 0.05 }), k = Math.floor(r.t.length * 0.75);
    expect(mean(r.torque, k)).toBeCloseTo(0.05 + m.b * mean(r.w, k), 2);
    expect(Math.max(...r.ia.map((a, j) => Math.abs(a + r.ib[j] + r.ic[j])))).toBeLessThan(1e-9);
    // Halls 20° off: the same load needs more current (torque ripple grows).
    const off = mo.bldcSimulate(m, 0.4, { duty: () => 0.5, load: () => 0.05, hallOffset: (20 * Math.PI) / 180 });
    const spread = (v: number[]) => Math.max(...v.slice(k)) - Math.min(...v.slice(k));
    expect(spread(off.torque)).toBeGreaterThan(spread(r.torque));
    // A speed loop on the duty holds 200 rad/s.
    const sp = mo.bldcSimulate(m, 0.5, { speed: () => 200, load: () => 0.03 });
    expect(mean(sp.w, Math.floor(sp.t.length * 0.8))).toBeCloseTo(200, -1);
  });
  it('real switching: SVPWM under FOC and PWM in six-step give the averaged result plus ripple (M485d)', () => {
    const m = mo.PMSM_DEFAULT, avg = mo.focSimulate(m, () => 100, 0.2, () => 1), sw = mo.focSimulate(m, () => 100, 0.2, () => 1, mo.focTune(m), { pwm: 10000 });
    expect(sw.w.at(-1)!).toBeCloseTo(100, 0);
    const tail = (v: number[]) => v.slice(Math.floor(v.length * 0.8)), spread = (v: number[]) => Math.max(...tail(v)) - Math.min(...tail(v));
    expect(spread(sw.iq)).toBeGreaterThan(spread(avg.iq) + 0.05);
    const mean = (v: number[]) => tail(v).reduce((a, b) => a + b, 0) / tail(v).length;
    expect(mean(sw.iq)).toBeCloseTo(mean(avg.iq), 0);
    const b = mo.BLDC_DEFAULT, ba = mo.bldcSimulate(b, 0.3, { duty: () => 0.5, load: () => 0.03 }), bs = mo.bldcSimulate(b, 0.3, { duty: () => 0.5, load: () => 0.03, pwm: 20000 });
    expect(Math.abs(bs.w.at(-1)! - ba.w.at(-1)!)).toBeLessThan(0.05 * ba.w.at(-1)!);
  });
  it('motor heating: the steady temperature by hand, the continuous rating, the time to the limit (M485c)', () => {
    const th = mo.THERMAL_DEFAULT;
    // Without copper's rise, T = Tamb + P·Rth; with it, a little hotter.
    const s = mo.heatSteady(th, 1, 5);
    expect(s.winding).toBeGreaterThan(25 + 25 * 1.8); expect(s.winding).toBeLessThan(25 + 25 * 1.8 * 1.4);
    expect((s.winding - 25) * 1 - 25 * (1 + 0.00393 * (s.winding - 25)) * 1.8).toBeCloseTo(0, 6);
    const c = mo.heatSteady(th, 1, 1).continuous;
    expect(mo.heatSteady(th, 1, c).winding).toBeCloseTo(th.tmax, 6);
    // The simulation settles where the formula says; at twice the rating it passes the limit after a while.
    const sim = mo.heatSimulate(th, 1, () => 5, 20000);
    expect(sim.winding.at(-1)!).toBeCloseTo(s.winding, 0);
    const hot = mo.heatSimulate(th, 1, () => 2 * c, 20000);
    expect(hot.overAt).toBeGreaterThan(10); expect(hot.overAt).toBeLessThan(2000);
  });
  it('in the language', { timeout: 30_000 }, () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("s = stepper(); [r, lost] = stepperSim(s, @(t) min(400, 2000*t), 0.3, 'Microsteps', 8); h = s.HoldingTorque; p = pmsm(); f = focSim(p, 160, 0.5); w = f.Speed(end); g = focSim(p, 160, 0.5, 'FieldWeakening', 0); w0 = g.Speed(end);");
    const d = (n: string) => [...toMat(lab.vars.get(n)!).d];
    expect(d('lost')).toEqual([0]); expect(d('h')[0]).toBeCloseTo(0.3 * 1.5 * Math.SQRT2, 9);
    expect(d('w')[0]).toBeCloseTo(160, 0); expect(d('w0')[0]).toBeLessThan(140);
    lab.run("b = bldc(); r = bldcSim(b, 0.3, 'Duty', 0.5); wb = r.Speed(end); kt = b.TorqueConstant; [h, info] = motorHeat(1, 5, 3000); Ic = info.Continuous; tw = h.Winding(end);");
    expect(d('wb')[0]).toBeGreaterThan(150); expect(d('kt')).toEqual([0.06]);
    expect(d('Ic')[0]).toBeGreaterThan(5); expect(d('tw')[0]).toBeGreaterThan(40);
  });
});
