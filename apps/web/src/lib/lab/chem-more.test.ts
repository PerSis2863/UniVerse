import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as ch from './chem';
import * as cm from './chem-more';
import { root } from './sci-num';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };

describe('Hyperion chemistry, more left-outs (M516)', () => {
  it("gives Pitzer's coefficients as the tables print them", () => {
    const n1 = cm.pitzer(cm.PITZER.NaCl, 1), n6 = cm.pitzer(cm.PITZER.NaCl, 6);
    expect(n1.gamma).toBeCloseTo(0.657, 2);
    expect(n1.phi).toBeCloseTo(0.936, 2);
    expect(n6.gamma).toBeCloseTo(0.986, 1);
    expect(cm.pitzer(cm.PITZER.KCl, 1).gamma).toBeCloseTo(0.604, 2);
    expect(cm.pitzer(cm.PITZER.CaCl2, 1).gamma).toBeCloseTo(0.5, 2);
    expect(cm.pitzer(cm.PITZER.CuSO4, 1).gamma).toBeCloseTo(0.0423, 3);
    expect(cm.pitzer(cm.PITZER.NaCl, 0).gamma).toBe(1);
    expect(cm.pitzer(cm.PITZER.NaCl, 1).aw).toBeCloseTo(Math.exp(-0.936 * 2 * 0.0180153), 3);
  });
  it('drops the pressure along a packed bed as Ergun says', () => {
    const m = ch.parseMechanism('A -> B'), alpha = 0.5;
    const r = cm.packedBed(m, cm.massAction(m, [0]), [1, 0], 1.5, { P0: 1e5, T: 500, alpha });
    r.W.forEach((w, i) => expect(r.y[i]).toBeCloseTo(Math.sqrt(1 - alpha * w), 4));
    const s = cm.packedBed(m, cm.massAction(m, [0]), [1, 0], 3, { P0: 1e5, T: 500, alpha });
    expect(s.stoppedAt).toBeGreaterThan(1.9);
    expect(s.stoppedAt).toBeLessThan(2.01);
  });
  it('grows the gas flow as moles are made (A -> 2B, no pressure drop)', () => {
    const m = ch.parseMechanism('A -> 2 B'), k = 0.01, P0 = 2e5, T = 600, FA0 = 1;
    const r = cm.packedBed(m, cm.massAction(m, [k]), [FA0, 0], 400, { P0, T, alpha: 0 });
    const v0 = FA0 / (P0 / (ch.R_GAS * T) / 1000), X = 1 - r.F[r.F.length - 1][0] / FA0, eps = 1;
    const want = root((x) => (1 + eps) * Math.log(1 / (1 - x)) - eps * x - (k * 400) / v0, 0, 0.999999);
    expect(X).toBeCloseTo(want, 4);
    expect(r.v[r.v.length - 1] / r.v[0]).toBeCloseTo(1 + X, 4);
  });
  it('runs Langmuir–Hinshelwood and any rate law', () => {
    expect(cm.lhRate(2, [1, 3], [1, 1], 2)).toBeCloseTo((2 * 3) / 25, 12);
    expect(cm.lhRate(2, [1], [4], 1)).toBeCloseTo(8 / 5, 12);
    const m = ch.parseMechanism('A -> B'), r = cm.rateLawBatch(m, (c) => [c[0] / (1 + c[0])], [1, 0], 3);
    // dA/dt = −A/(1+A): t = ln(A0/A) + (A0 − A)
    const A = r.y[r.y.length - 1][0];
    expect(Math.log(1 / A) + (1 - A)).toBeCloseTo(3, 3);
  });
  it('works from the language', () => {
    const r = run("[t, C] = rateLawSim('A + B -> C', @(c) 2*c(1)*c(2)/(1 + 3*c(1))^2, [1 1 0], 5);\nr = lhRate(2, [1 3], [1 1; 2 0], 2);\n[a, b0] = ergunAlpha(1.5, 0.006, 0.45, 1.5e-5, 0.4, 0.01, 2000, 1e6);\n[W, F, y] = packedBed('A -> B', 1e-3, [0.1 0], 10, 'Alpha', a, 'T', 500);\n[g, phi, aw] = pitzerActivity('NaCl', [0.5 1]);\nfigure; pitzerActivity('CuSO4')\nfigure; packedBed('A -> 2 B', 1e-3, [0.1 0], 10, 'Alpha', 0.05)\nfigure; rateLawSim('A -> B', @(c) c(1)/(1+c(1)), [1 0], 3)\ns = struct('zM', 1, 'zX', -1, 'nuM', 1, 'nuX', 1, 'beta0', 0.0765, 'beta1', 0.2664, 'Cphi', 0.00127); gs = pitzerActivity(s, 1);");
    expect(r.d('r')[0]).toBeCloseTo(6 / 25, 10);
    expect(r.d('a')[0]).toBeGreaterThan(0);
    expect(r.d('g')[1]).toBeCloseTo(0.657, 2);
    expect(r.d('gs')[0]).toBeCloseTo(r.d('g')[1], 10);
    expect(r.d('y').every((v, i, y) => !i || v <= y[i - 1])).toBe(true);
    expect(r.graphics.figures.length).toBeGreaterThan(2);
  });
});
