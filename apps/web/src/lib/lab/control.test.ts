import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { inline } from './values';
import { margin, stepinfo, bodeOf, tfOf } from './control';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, lab, graphics, v: (n: string) => inline(lab.vars.get(n)!, { long: true }), get: (n: string) => lab.vars.get(n)! }; };

describe('Hyperion control systems (M414)', () => {
  it('transfer functions are values: s = tf(\'s\'), arithmetic, feedback, display', () => {
    const r = run("s = tf('s');\nG = (s + 2)/(s^2 + 3*s + 2)\nC = 2 + 1/s;\nT = feedback(G*C, 1);\nH = minreal(G);");
    expect(r.out).toContain('s^2 + 3 s + 2');
    expect(r.out).toContain('Continuous-time transfer function.');
    expect(r.v('H')).toBe('(1)/(s + 1)');
    const T = tfOf(r.get('T'));
    // G·C = (s+2)(2s+1) / (s (s+1)(s+2)); closed loop: (2s² + 5s + 2) / (s³ + 5s² + 7s + 2).
    expect(T.n.map((x) => +x.toFixed(9))).toEqual([2, 5, 2]);
    expect(T.d.map((x) => +x.toFixed(9))).toEqual([1, 5, 7, 2]);
  });
  it('a second-order step: overshoot e^(−πζ/√(1−ζ²)), peak at π/ωd, settles at the DC gain', () => {
    const r = run('G = tf(1, [1 1 1]);\nk = dcgain(G);\n[y, t] = step(G);');
    expect(r.v('k')).toBe('1');
    const info = stepinfo(tfOf(r.get('G'))), z = 0.5, wd = Math.sqrt(1 - z * z);
    expect(info.Overshoot).toBeCloseTo(100 * Math.exp((-Math.PI * z) / wd), 1);
    expect(info.PeakTime).toBeCloseTo(Math.PI / wd, 2);
    expect(info.SteadyState).toBe(1);
    // 2 % settling ≈ 4/(ζωn) = 8 s (a little less for this damping).
    expect(info.SettlingTime).toBeGreaterThan(7);
    expect(info.SettlingTime).toBeLessThan(8.6);
  });
  it('a first-order step reaches 1 − e⁻¹ after one time constant (exactly, by the matrix exponential)', () => {
    const r = run('G = tf(3, [2 1]);\n[y, t] = step(G, 10);');
    const y = r.get('y') as unknown as { d: Float64Array }, t = r.get('t') as unknown as { d: Float64Array };
    const i = [...t.d].findIndex((x) => Math.abs(x - 2) < 1e-9);
    expect(y.d[i]).toBeCloseTo(3 * (1 - Math.exp(-1)), 9);
  });
  it('Bode: 1/(s + 1) is −3 dB and −45° at 1 rad/s; margins of 1/(s(s+1)(s+2)): gain margin 6 at √2 rad/s', () => {
    const b = bodeOf({ n: [1], d: [1, 1] }, [1]);
    expect(20 * Math.log10(b.mag[0])).toBeCloseTo(-3.0103, 3);
    expect(b.phase[0]).toBeCloseTo(-45, 6);
    const m = margin({ n: [1], d: [1, 3, 2, 0] });
    expect(m.Gm).toBeCloseTo(6, 4);
    expect(m.Wcg).toBeCloseTo(Math.SQRT2, 4);
    expect(m.Pm).toBeGreaterThan(50); expect(m.Pm).toBeLessThan(55);
    // An integrator's phase starts at −90°.
    expect(bodeOf({ n: [1], d: [1, 0] }, [1]).phase[0]).toBeCloseTo(-90, 6);
  });
  it('pid, poles, zeros, state space, and the plots draw', () => {
    const r = run('C = pid(2, 1, 0.5);\np = pole(tf(1, [1 3 2]));\nG = ss([0 1; -2 -3], [0; 1], [1 0], 0);\nstep(G); figure; bode(G); figure; margin(G); figure; rlocus(G); figure; nyquist(G); figure; impulse(G);');
    const C = tfOf(r.get('C'));
    expect(C.n).toEqual([0.5, 2, 1]);
    expect(C.d).toEqual([1, 0]);
    expect([...(r.get('p') as unknown as { d: Float64Array }).d].sort((x, y) => x - y)).toEqual([-2, -1]);
    const G = tfOf(r.get('G'));
    expect(G.n.map((x) => +x.toFixed(9))).toEqual([1]);
    expect(G.d.map((x) => +x.toFixed(9))).toEqual([1, 3, 2]);
    expect(r.graphics.figures.length).toBe(6);
  });
  it('a plant with more zeros than poles is refused in plain words', () => {
    expect(() => run('step(tf([1 0 0], [1 1]))')).toThrow(/more zeros than poles/);
  });
});
