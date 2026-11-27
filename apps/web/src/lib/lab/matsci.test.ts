import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as ms from './matsci';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };

describe('Hyperion semiconductors and materials (M504)', () => {
  it('silicon and the pn junction by the textbook formulas', () => {
    expect(ms.siEg(300)).toBeCloseTo(1.1245, 3);
    expect(ms.siNi(300)).toBeGreaterThan(5e9); expect(ms.siNi(300)).toBeLessThan(1.2e10);
    expect(ms.siNi(400) / ms.siNi(300)).toBeGreaterThan(100); // ni rises steeply with temperature
    const ni = 1e10, j = ms.pnJunction(1e17, 1e16, 0, 300, ni);
    expect(j.vbi).toBeCloseTo(ms.vt() * Math.log(1e33 / 1e20), 12);
    const eps = 11.7 * ms.EPS0;
    expect(j.W).toBeCloseTo(Math.sqrt((2 * eps * j.vbi / ms.Q) * (1e-17 + 1e-16)), 12);
    expect((j.xn * 1e16) / (j.xp * 1e17)).toBeCloseTo(1, 12); // charge balance
    expect(ms.pnJunction(1e17, 1e16, -5, 300, ni).W).toBeGreaterThan(j.W); // reverse bias widens it
    const b = ms.bands(1e17, 1e16);
    expect(b.ec[0] - b.ec[b.ec.length - 1]).toBeCloseTo(b.vbi, 9);
  });
  it('the diode with series resistance and the MOSFET', () => {
    expect(ms.diodeCurrent(0.6, 1e-14, 1, 0)).toBeCloseTo(1e-14 * Math.expm1(0.6 / ms.vt()), 20);
    const I = ms.diodeCurrent(1.2, 1e-14, 1, 2);
    expect(I).toBeCloseTo(1e-14 * Math.expm1((1.2 - 2 * I) / ms.vt()), 9);
    expect(I).toBeLessThan(0.6 / 2);
    expect(ms.diodeCurrent(-1, 1e-14)).toBeCloseTo(-1e-14, 20);
    // Square law: saturation current k/2 (Vgs − Vth)², continuous at the edge.
    expect(ms.mosfetId(2, 5, 1, 2e-3)).toBeCloseTo(1e-3, 15);
    expect(ms.mosfetId(2, 1, 1, 2e-3)).toBeCloseTo(ms.mosfetId(2, 1 + 1e-12, 1, 2e-3), 12);
    expect(ms.mosfetId(0.5, 1, 1, 2e-3)).toBe(0);
    const t = ms.mosThreshold(1e17, 10);
    expect(t.vth).toBeGreaterThan(0.3); expect(t.vth).toBeLessThan(1.5);
    expect(ms.mosThreshold(1e17, 5).vth).toBeLessThan(t.vth); // a thinner oxide lowers it
  });
  it('stress–strain: the tensile test gets back the yield it was built with', () => {
    const m = ms.MATERIALS.steel, c = ms.stressStrain(m), r = ms.tensile(c.strain, c.stress);
    expect(r.E / m.E).toBeCloseTo(1, 2);
    expect(r.yield / m.yield).toBeCloseTo(1, 2);
    expect(r.uts).toBe(m.uts);
    expect(r.toughness).toBeGreaterThan(50);
  });
  it('fatigue: Basquin, Goodman, ASTM E1049 rainflow and Miner', () => {
    const f = ms.basquinFit([1e3, 1e5, 1e7], [1e3, 1e5, 1e7].map((N) => 900 * (2 * N) ** -0.09));
    expect(f.sf).toBeCloseTo(900, 6); expect(f.b).toBeCloseTo(-0.09, 10);
    expect(ms.cyclesToFailure(300, 900, -0.09)).toBeCloseTo(0.5 * (300 / 900) ** (1 / -0.09), 3);
    expect(ms.cyclesToFailure(300, 900, -0.09, 100, 510)).toBeLessThan(ms.cyclesToFailure(300, 900, -0.09));
    // ASTM E1049's example (-2 1 -3 5 -1 3 -4 4 -2): range 3: ½, 4: 1½, 6: ½, 8: 1, 9: ½.
    const c = ms.rainflow([-2, 1, -3, 5, -1, 3, -4, 4, -2]), by = (r: number) => c.filter((x) => x[0] === r).reduce((s, x) => s + x[2], 0);
    expect([3, 4, 6, 8, 9].map(by)).toEqual([0.5, 1.5, 0.5, 1, 0.5]);
    expect(c.reduce((s, x) => s + x[2], 0)).toBe(4);
    // One full cycle of range 600 at Basquin's life does damage 1/N.
    expect(ms.minerDamage([[600, 0, 1]], 900, -0.09)).toBeCloseTo(1 / ms.cyclesToFailure(300, 900, -0.09), 15);
  });
  it('grade estimation: kriging honours the data, IDW too; the variogram of a trend rises', () => {
    const xy = [[0, 0], [10, 0], [0, 10], [10, 10], [5, 5]], v = [1.2, 2.3, 0.8, 1.9, 1.5];
    const k = ms.krige(xy, v, xy, [0, 1, 20]);
    k.forEach((r, i) => { expect(r.est).toBeCloseTo(v[i], 9); expect(Math.abs(r.var)).toBeLessThan(1e-9); });
    const mid = ms.krige(xy, v, [[5, 0]], [0, 1, 20])[0];
    expect(mid.var).toBeGreaterThan(0);
    expect(ms.idw(xy, v, [[10, 10], [5, 5.0001]])[0]).toBe(1.9);
    const pts = Array.from({ length: 100 }, (_, i) => [i % 10, Math.floor(i / 10)]), g = ms.variogram(pts, pts.map((p) => p[0]), 1, 6);
    expect(g.gamma[5]).toBeGreaterThan(g.gamma[1]);
    expect(ms.spherical(30, 0.1, 1, 20)).toBe(1.1);
  });
  it('in the language', () => {
    const r = run("ni = siliconNi(300); j = pnJunction(1e17, 1e16); vbi = j.Vbi; I = diodeIV([0.5 0.7], 'Rs', 1); Id = mosfetIV([1.5 2], [0 1 3]);\n[e, s] = materialCurve('aluminium'); t = tensileTest(e, s); y = t.Yield; c = rainflowCount([-2 1 -3 5 -1 3 -4 4 -2]); [D, rep] = minerDamage(c * 50, 'steel');\n[est, v] = krigeGrade([0 0; 10 0; 0 10; 10 10], [1 2 3 4], [5 5], [0 1 20]);\npnJunction(1e17, 1e16)\nfigure; materialCurve('steel', 'aluminium', 'titanium', 'copper')");
    expect(r.d('vbi')[0]).toBeGreaterThan(0.6);
    expect(r.d('I')[1]).toBeGreaterThan(r.d('I')[0]);
    expect(r.d('Id').length).toBe(6);
    expect(r.d('y')[0] / 276).toBeCloseTo(1, 2);
    expect(r.d('D')[0]).toBeGreaterThan(0);
    expect(r.d('est')[0]).toBeCloseTo(2.5, 9);
    expect(r.graphics.figures.length).toBe(2);
  });
});
