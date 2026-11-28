import { describe, expect, it } from 'vitest';
import { buckLoss, cauerZ, fosterToCauer, fosterZ, IGBT, junctionTemp, MOSFET, switching, zth } from './power';

describe('power electronics: losses and heat (M563)', () => {
  it('a buck: CCM losses add up, efficiency sensible; light load goes DCM', () => {
    const b = buckLoss(48, 12, 10, 100e3, 10e-6, 5e-3, MOSFET, 25);
    expect(b.mode).toBe('CCM');
    expect(b.duty).toBeCloseTo(0.25, 6);
    expect(b.ripple).toBeCloseTo((36 * 0.25) / (10e-6 * 100e3), 6);
    const sum = b.high.conduction + b.high.on + b.high.off + b.low.conduction + b.low.rr + b.inductor;
    expect(b.total).toBeCloseTo(sum, 9);
    expect(b.efficiency).toBeGreaterThan(0.9);
    expect(b.efficiency).toBeLessThan(0.995);
    const light = buckLoss(48, 12, 0.2, 100e3, 10e-6, 5e-3, MOSFET);
    expect(light.mode).toBe('DCM');
    expect(light.duty).toBeLessThan(0.25);
    expect(light.low.rr).toBe(0);
  });
  it('switching energies scale with voltage; IGBT conduction is knee plus slope', () => {
    expect(switching(IGBT, 25, 300, 10e3).on).toBeCloseTo(1.5e-3 * 0.5 * 10e3, 9);
  });
  it('Foster: Zth reaches ΣR; Cauer has the same impedance; the junction warms to P·ΣR', () => {
    const f = { r: [0.05, 0.12, 0.2, 0.08], tau: [1e-4, 1e-3, 1e-2, 0.1] };
    expect(zth(f, 100)).toBeCloseTo(0.45, 9);
    const c = fosterToCauer(f);
    expect(c.r.reduce((a, b) => a + b, 0)).toBeCloseTo(0.45, 6);
    for (const w of [1, 30, 1e3, 3e4]) {
      const [a, b] = fosterZ(f, w), [x, y] = cauerZ(c, w);
      expect(x).toBeCloseTo(a, 6);
      expect(y).toBeCloseTo(b, 6);
    }
    const tj = junctionTemp(f, new Array(20000).fill(100), 1e-4, 25);
    expect(tj[tj.length - 1]).toBeCloseTo(25 + 45, 1);
    expect(tj[9]).toBeCloseTo(25 + 100 * zth(f, 1e-3), 6);
  });
});

import { Lab } from './interp';
import { Graphics } from './plot';
import { FileStore } from './files';
import { toMat } from './values';
import './power-lab';
describe('power electronics in the language (M563)', () => {
  it('devices, buck losses, an efficiency map, Foster to Cauer, junction temperature', () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics(), files: new FileStore() });
    lab.run(`d = powerDevice('mosfet', 'Rds', 8e-3);
r = buckLosses(48, 12, 10, 'fsw', 200e3, 'Device', d); e = r.Efficiency; m = r.Mode;
E = efficiencyMap([36 48 60], 12, [1 5 10]);
n = fosterNet([0.05 0.12 0.2 0.08], [1e-4 1e-3 1e-2 0.1]); [R, C] = foster2cauer(n); s = sum(R);
Tj = junctionTemp(n, 100*ones(1, 20000), 1e-4, 'Ambient', 40); last = Tj(end);
[on, off, rr] = switchingLoss(d, 10, 48, 100e3);`);
    const g = (k: string) => toMat(lab.vars.get(k)!).d;
    expect(g('e')[0]).toBeGreaterThan(0.85);
    expect((lab.vars.get('m') as { v: string }).v).toBe('CCM');
    const E = toMat(lab.vars.get('E')!);
    expect([E.r, E.c]).toEqual([3, 3]);
    expect(E.d[0]).toBeLessThan(E.d[3]); // 1 A is less efficient than 5 A at 36 V
    expect(g('s')[0]).toBeCloseTo(0.45, 6);
    expect(g('last')[0]).toBeCloseTo(85, 1);
    expect(g('on')[0]).toBeCloseTo(8e-6 * 100e3, 9);
  });
});

import { averaged, dabPower, frestimate, llcGain, pidtune, prbs, resp } from './power';
describe('converter design (M564)', () => {
  it('averaged models: CCM duties, DCM at light load, DC gain of the transfer function', () => {
    const b = averaged('buck', 48, 12, NaN, 22e-6, 100e-6, 1.2, 200e3);
    expect(b.mode).toBe('CCM'); expect(b.duty).toBeCloseTo(0.25, 9); expect(b.num[b.num.length - 1] / b.den[b.den.length - 1]).toBeCloseTo(48, 9);
    const bo = averaged('boost', 12, 48, NaN, 22e-6, 100e-6, 24, 200e3);
    expect(bo.mode).toBe('CCM'); expect(bo.duty).toBeCloseTo(0.75, 9); expect(bo.num[0]).toBeLessThan(0); // the right-half-plane zero
    const light = averaged('buck', 48, 12, NaN, 2e-6, 100e-6, 100, 50e3);
    expect(light.mode).toBe('DCM'); expect(light.duty).toBeLessThan(0.25);
    // Feeding the DCM duty back in gives the same output.
    expect(averaged('buck', 48, NaN, light.duty, 2e-6, 100e-6, 100, 50e3).vout).toBeCloseTo(12, 6);
    const bb = averaged('buckboost', 12, 24, NaN, 22e-6, 100e-6, 10, 200e3);
    expect(bb.duty).toBeCloseTo(2 / 3, 6);
  });
  it('LLC gain is 1 at resonance and rises below it at light load; DAB power peaks at 90°', () => {
    expect(llcGain(1, 5, 0.4)).toBeCloseTo(1, 9);
    expect(llcGain(0.7, 5, 0.2)).toBeGreaterThan(1);
    const p = (phi: number) => dabPower(400, 48, 8, phi, 100e3, 20e-6);
    expect(p(Math.PI / 2)).toBeGreaterThan(p(Math.PI / 3));
    expect(p(-Math.PI / 4)).toBeCloseTo(-p(Math.PI / 4), 9);
  });
  it('PRBS has a full period; frestimate recovers a first-order lag', () => {
    const s = prbs(7, 127); expect(s.reduce((a, b) => a + b, 0)).toBe(1); // 64 ones, 63 minus ones
    const Ts = 1e-3, u = prbs(10, 8000), y = new Float64Array(u.length), a = Math.exp(-Ts * 20);
    for (let k = 1; k < u.length; k++) y[k] = a * y[k - 1] + (1 - a) * u[k - 1];
    const { re, im } = frestimate(u, y, Ts, [5, 20, 60]);
    const gain = (w: number) => (1 - a) / Math.hypot(1 - a * Math.cos(w * Ts), a * Math.sin(w * Ts));
    expect(Math.hypot(re[1], im[1])).toBeCloseTo(gain(20), 1);
    expect(Math.hypot(re[0], im[0])).toBeCloseTo(gain(5), 1);
  });
  it('pidtune meets the crossover and phase margin it was asked for', () => {
    const num = [48], den = [22e-6 * 100e-6, 22e-6 / 1.2, 1]; // the buck's Gvd
    for (const [type, f] of [['PI', 500], ['PID', 5e3]] as const) {
      const g = pidtune(num, den, type, 2 * Math.PI * f, 55);
      // Open loop C·G at wc: magnitude 1, phase −180 + 55.
      const w = g.wc, [gr, gi] = resp(num, den, w), cr = g.Kp, ci = g.Kd * w - g.Ki / w;
      const lr = gr * cr - gi * ci, li = gr * ci + gi * cr;
      expect(Math.hypot(lr, li)).toBeCloseTo(1, 6);
      const pmGot = 180 + (Math.atan2(li, lr) * 180) / Math.PI;
      expect(pmGot).toBeCloseTo(g.pm, 6);
      if (type === 'PID') expect(pmGot).toBeCloseTo(55, 4); else expect(pmGot).toBeGreaterThanOrEqual(55);
    }
    expect(() => pidtune(num, den, 'PI', 2 * Math.PI * 5e3, 55)).toThrow(/PID/);
  });
});

describe('converter design in the language (M564)', () => {
  it('converterModel, pidtune on it, buckDesign, monteCarlo, prbs and frestimate', () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics(), files: new FileStore() });
    lab.run(`[op, G] = converterModel('buck', 'Vin', 48, 'Vout', 12, 'L', 22e-6, 'C', 100e-6, 'R', 1.2, 'fsw', 200e3);
mode = op.Mode; dc = dcgain(G);
[C, info] = pidtune(G, 'PID', 2*pi*5e3, 'PhaseMargin', 55); pm = info.PhaseMargin;
[best, all] = buckDesign(48, 12, 10, 'Inductors', [4.7e-6 3e-3 1; 10e-6 5e-3 2; 22e-6 9e-3 3], 'Capacitors', [47e-6 5e-3 1; 220e-6 3e-3 2], 'Fsw', [100e3 300e3], 'MaxRipple', 0.4);
rng(1); [Y, mc] = monteCarlo(@(p) llcGain(0.9, p(1), p(2)), [5 0.4], 0.1, 500, 'Spec', [1 1.2]);
u = prbs(9, 4000); n = numel(u);
M = llcGain([0.5 1 2], 5, [0.2 0.5]); sz = size(M);`);
    const g = (k: string) => toMat(lab.vars.get(k)!).d;
    expect((lab.vars.get('mode') as { v: string }).v).toBe('CCM');
    expect(g('dc')[0]).toBeCloseTo(48, 6);
    expect(g('pm')[0]).toBeCloseTo(55, 3);
    const best = lab.vars.get('best') as { f: Map<string, unknown> };
    expect(toMat(best.f.get('Efficiency') as never).d[0]).toBeGreaterThan(0.9);
    expect(toMat(lab.vars.get('Y')!).r).toBe(500);
    const mc = lab.vars.get('mc') as { f: Map<string, unknown> };
    const yld = toMat(mc.f.get('Yield') as never).d[0];
    expect(yld).toBeGreaterThan(0); expect(yld).toBeLessThanOrEqual(1);
    expect(g('n')[0]).toBe(4000);
    expect([...g('sz')]).toEqual([2, 3]);
  });
});

describe('converter control in the language (M565)', () => {
  it('buckControlSim, pfcSim, mpptSim, svpwm, gridInverterSim, droopShare', () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics(), files: new FileStore() });
    lab.run(`r = buckControlSim('current', 'Cycles', 500); v = r.Vout(end);
p = pfcSim('Cycles', 8); pf = p.PowerFactor;
m = mpptSim('inccond', [1000*ones(1,200) 700*ones(1,200)]); me = m.Efficiency;
th = linspace(0, 2*pi, 13); [da, db, dc, s] = svpwm(300*cos(th), 300*sin(th), 700);
g = gridInverterSim('Tend', 0.15, 'Steps', [0 4e3 1e3]); P = g.P(end);
[Ps, f] = droopShare(10e3, [1e-4 1e-4], [8e3 8e3]);`);
    const g = (k: string) => toMat(lab.vars.get(k)!).d;
    expect(g('v')[0]).toBeCloseTo(3.3, 1);
    expect(g('pf')[0]).toBeGreaterThan(0.95);
    expect(g('me')[0]).toBeGreaterThan(0.95);
    expect(Math.max(...g('da'))).toBeLessThanOrEqual(1);
    expect([...g('s')].slice(0, 6)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(g('P')[0]).toBeCloseTo(4e3, -2);
    expect([...g('Ps')]).toEqual([5e3, 5e3]);
  });
});

describe('induction motors and the rectifier in the language (M566)', () => {
  it('inductionMotor, inductionSim, torqueSpeed, rectifier3', () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics(), files: new FileStore() });
    lab.run(`m = inductionMotor();
r = inductionSim(m, 'foc', 'Speed', @(t) 80*(t > 0.1), 'Tend', 0.8); w = r.Speed(end);
T = torqueSpeed(m, [0.05 0.2 1]);
b = rectifier3('Ld', 20e-3, 'Cycles', 40); h5 = b.Harmonics(5);`);
    const g = (k: string) => toMat(lab.vars.get(k)!).d;
    expect(g('w')[0]).toBeCloseTo(80, 0);
    expect(g('T').length).toBe(3);
    expect(g('h5')[0]).toBeGreaterThan(0.1);
  });
});
