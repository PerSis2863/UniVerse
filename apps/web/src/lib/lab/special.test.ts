import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import * as sp from './special-lab';

const run = (code: string) => { const lab = new Lab({ out: () => {}, graphics: new Graphics() }); lab.run(code); return (n: string) => [...toMat(lab.vars.get(n)!).d]; };

describe('Hyperion special maths (M558)', () => {
  it('matrix functions: expm, sqrtm, logm, funm', () => {
    const v = run('A = [0 1; -1 0]; E = expm(A); B = [4 1; 1 3]; S = sqrtm(B); S2 = S*S; L = logm(expm([1 2; 0 3])); F = funm(B, @exp); G = expm(B);');
    expect(v('E')[0]).toBeCloseTo(Math.cos(1), 12);
    expect(v('E')[2]).toBeCloseTo(Math.sin(1), 12);
    v('S2').forEach((x, i) => expect(x).toBeCloseTo([4, 1, 1, 3][i], 11));
    v('L').forEach((x, i) => expect(x).toBeCloseTo([1, 0, 2, 3][i], 9));
    v('F').forEach((x, i) => expect(x).toBeCloseTo(v('G')[i], 9));
  });
  it('Bessel and Airy against tabulated values', () => {
    expect(sp.besselj(0, 1)).toBeCloseTo(0.765197686557967, 12);
    // J_{5/2}(x) = √(2/(πx))·((3/x² − 1)·sin x − 3·cos x / x).
    expect(sp.besselj(2.5, 3)).toBeCloseTo(Math.sqrt(2 / (3 * Math.PI)) * ((1 / 3 - 1) * Math.sin(3) - Math.cos(3)), 11);
    expect(sp.besselj(1, 30)).toBeCloseTo(-0.118751062616623, 10);
    expect(sp.bessely(0, 1)).toBeCloseTo(0.088256964215677, 11);
    expect(sp.bessely(1, 2.5)).toBeCloseTo(0.145918137966786, 10);
    expect(sp.besseli(1, 1)).toBeCloseTo(0.565159103992485, 12);
    expect(sp.besselk(0, 1)).toBeCloseTo(0.421024438240708, 12);
    expect(sp.airy(0, 1)).toBeCloseTo(0.135292416312881, 11);
    expect(sp.airy(0, -2)).toBeCloseTo(0.227407428201528, 10);
    expect(sp.airy(2, 1)).toBeCloseTo(1.207423594952871, 10);
  });
  it('lambertw, erfinv, ellipke, expint, legendre', () => {
    expect(sp.lambertw(1)).toBeCloseTo(0.567143290409784, 14);
    expect(sp.lambertw(-0.2, -1)).toBeCloseTo(-2.542641357773527, 12);
    const [K, E] = sp.ellipke(0.5);
    expect(K).toBeCloseTo(1.854074677301372, 13);
    expect(E).toBeCloseTo(1.350643881047675, 13);
    expect(sp.expint(1)).toBeCloseTo(0.219383934395520, 13);
    expect(sp.expint(0.1)).toBeCloseTo(1.822923958419390, 13);
    const v = run('e = erfinv(0.5); P = legendre(2, 0.5);');
    expect(v('e')[0]).toBeCloseTo(0.476936276204470, 12);
    // P2^0 = (3x²−1)/2, P2^1 = −3x√(1−x²), P2^2 = 3(1−x²).
    v('P').forEach((x, i) => expect(x).toBeCloseTo([-0.125, -1.5 * Math.sqrt(0.75), 2.25][i], 12));
  });
  it('perms, rat, rats and Chebyshev series', () => {
    const v = run('P = perms([1 2 3]); [n, d] = rat(pi); c = chebcoeffs(@(x) exp(x), 20); y = chebval(c, 0.3); r = chebroots(chebcoeffs(@(x) cos(3*x), 30, [0 2]), [0 2]);');
    expect(v('P').slice(0, 6)).toEqual([3, 3, 2, 2, 1, 1]);
    expect(v('n')[0] / v('d')[0]).toBeCloseTo(Math.PI, 6);
    expect(v('y')[0]).toBeCloseTo(Math.exp(0.3), 14);
    expect(v('r')).toHaveLength(2);
    expect(v('r')[0]).toBeCloseTo(Math.PI / 6, 10);
    expect(v('r')[1]).toBeCloseTo(Math.PI / 2, 10);
  });
});
