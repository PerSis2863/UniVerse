import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import './machines-lab';
import { pidReport, pidTf, tunePid } from './pidtune';

const G3 = { n: [1], d: [1, 3, 3, 1] };

describe('PID tuning', () => {
  it('1/(s+1)³ as a PI gives MATLAB pidtune’s answer', () => {
    const { gains, wc } = tunePid(G3, 'PI');
    // MATLAB: Kp 1.14, Ki 0.454 (the most integral gain is a flat top, so Kp moves a little).
    expect(gains.Kp).toBeCloseTo(1.14, 1);
    expect(gains.Ki).toBeCloseTo(0.454, 2);
    expect(wc).toBeCloseTo(0.52, 1);
    const r = pidReport(G3, gains);
    expect(r.stable).toBe(true);
    expect(r.Pm).toBeCloseTo(60, 1);
  });
  it('every type hits the phase margin at the crossover it chose', () => {
    for (const type of ['PI', 'PID', 'PIDF'] as const) for (const pm of [45, 60, 75]) {
      const { gains, wc } = tunePid(G3, type, { pm });
      const r = pidReport(G3, gains);
      expect(r.stable).toBe(true);
      expect(r.Pm).toBeCloseTo(pm, 1);
      expect(r.Wcp).toBeCloseTo(wc, 2);
      if (pm === 60) expect(r.info!.Overshoot).toBeLessThan(15);
    }
  });
  it('a faster crossover is faster', () => {
    const slow = pidReport(G3, tunePid(G3, 'PIDF', { wc: 0.5 }).gains).info!, fast = pidReport(G3, tunePid(G3, 'PIDF', { wc: 1.2 }).gains).info!;
    expect(fast.RiseTime).toBeLessThan(slow.RiseTime);
  });
  it('P and I controllers, and a plant with an integrator', () => {
    for (const type of ['P', 'I'] as const) expect(pidReport(G3, tunePid(G3, type).gains).Pm).toBeCloseTo(60, 1);
    const Gi = { n: [1], d: [1, 1, 0] }, r = pidReport(Gi, tunePid(Gi, 'PID').gains);
    expect(r.stable).toBe(true);
    expect(r.Pm).toBeCloseTo(60, 1);
  });
  it('pidTf is Kp + Ki/s + Kd s/(Tf s + 1)', () => {
    const t = pidTf({ Kp: 2, Ki: 3, Kd: 0.5, Tf: 0.1 }), s = 1.7;
    const v = (p: number[]) => p.reduce((a, c) => a * s + c, 0);
    expect(v(t.n) / v(t.d)).toBeCloseTo(2 + 3 / s + (0.5 * s) / (0.1 * s + 1), 10);
  });
  it('pidtune and pidtuneOptions in a script', () => {
    const out: string[] = [], lab = new Lab({ out: (s: string) => { out.push(s); }, graphics: new Graphics() });
    lab.run("G = tf(1, [1 3 3 1]); [C, info] = pidtune(G, 'PI'); kp = info.Kp; ki = info.Ki; o = pidtuneOptions('PhaseMargin', 45); [C2, i2] = pidtune(G, 'pidf', o); pm = i2.PhaseMargin;");
    expect((lab.vars.get('kp') as unknown as { d: number[] }).d[0]).toBeCloseTo(1.14, 1);
    expect((lab.vars.get('pm') as unknown as { d: number[] }).d[0]).toBeCloseTo(45, 1);
  });
});

describe('PID tuning, fast plants', () => {
  it('a first-order plant gets a controller at most ten times faster than it', () => {
    const G = { n: [1], d: [1000, 50] }, { gains, wc } = tunePid(G, 'PI');
    expect(wc).toBeLessThanOrEqual(0.5 + 1e-9);
    const r = pidReport(G, gains);
    expect(r.stable).toBe(true);
    expect(r.info!.Overshoot).toBeLessThan(25);
  });
});

describe('plants with a delay (M567)', () => {
  it('a delay costs phase, so the tuned loop is slower but keeps its margin', async () => {
    const { pade } = await import('./pade');
    const q = pade(1, 4), conv = (a: number[], b: number[]) => { const o = new Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { o[i + j] += x * y; })); return o; };
    const G = { n: [1], d: [1, 3, 3, 1] }, Gd = { n: conv([1], q.n), d: conv([1, 3, 3, 1], q.d) };
    const a = tunePid(G, 'PI'), b = tunePid(Gd, 'PI'), r = pidReport(Gd, b.gains);
    expect(b.wc).toBeLessThan(a.wc);
    expect(r.stable).toBe(true);
    expect(r.Pm).toBeCloseTo(60, 0);
  });
  it('tf’s InputDelay and pade in a script', () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("G = tf(1, [1 1], 'InputDelay', 0.5); p = pade(0.5, 2); [C, info] = pidtune(G, 'PI'); ok = info.Stable;");
    expect((lab.vars.get('ok') as unknown as { d: number[] }).d[0]).toBe(1);
    expect(lab.vars.get('p')).toBeTruthy();
  });
});
