import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './comms-lab';
import * as cm from './comms';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
let seed = 9;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
const simulate = (kind: 'psk' | 'qam', M: number, ebno: number, n: number) => {
  const k = Math.log2(M), sym = Array.from({ length: n }, () => Math.floor(rand() * M));
  const [re, im] = kind === 'psk' ? cm.pskmod(sym, M) : cm.qammod(sym, M, true);
  const [rr, ri] = cm.awgn(re, im, ebno + 10 * Math.log10(k), rand, false);
  const back = kind === 'psk' ? cm.pskdemod(rr, ri!, M) : cm.qamdemod(rr, ri!, M, true);
  return cm.biterr(sym, back, k).ratio;
};

describe('Hyperion wireless communications (M427)', () => {
  it('modulates and demodulates every symbol back; neighbours differ by one bit; QAM at unit power', () => {
    for (const M of [2, 4, 8, 16]) { const s = Array.from({ length: M }, (_, i) => i), [re, im] = cm.pskmod(s, M); expect(cm.pskdemod(re, im, M)).toEqual(s); }
    for (const M of [4, 16, 64]) {
      const s = Array.from({ length: M }, (_, i) => i), [re, im] = cm.qammod(s, M, true);
      expect(cm.qamdemod(re, im, M, true)).toEqual(s);
      expect(re.reduce((p, v, i) => p + v * v + im[i] ** 2, 0) / M).toBeCloseTo(1, 12);
    }
    // 8-PSK: points next to each other around the circle carry labels one bit apart.
    const [re, im] = cm.pskmod([0, 1, 2, 3, 4, 5, 6, 7], 8), byAngle = [0, 1, 2, 3, 4, 5, 6, 7].sort((x, y) => Math.atan2(im[x], re[x]) - Math.atan2(im[y], re[y]));
    byAngle.forEach((s, i) => { const t = byAngle[(i + 1) % 8], d = s ^ t; expect(d & (d - 1)).toBe(0); });
  });

  it('bit-error rates over noise match theory: BPSK, QPSK, 16-QAM', () => {
    // BPSK at 6 dB: Q(√(2·10^0.6)) ≈ 2.39e-3.
    expect(cm.berTheory(6, 'psk', 2)).toBeCloseTo(2.388e-3, 5);
    for (const [kind, M, eb, n] of [['psk', 2, 6, 200_000], ['psk', 4, 6, 100_000], ['qam', 16, 10, 100_000]] as const) {
      const sim = simulate(kind, M, eb, n), th = cm.berTheory(eb, kind, M);
      expect(Math.abs(sim / th - 1)).toBeLessThan(0.15);
    }
  });

  it('in the language', () => {
    const r = run("rng(1)\nM = 16; x = randi([0 M-1], 1, 2000);\ny = qammod(x, M, 'UnitAveragePower', true);\np = mean(abs(y).^2);\nz = qamdemod(awgn(y, 30), M, 'UnitAveragePower', true);\n[n, ber] = biterr(x, z);\nth = berawgn([0 6], 'psk', 2);\nb = int2bit([5; 2], 3)'; back = bit2int(b', 3)';\nscatterplot(awgn(y, 18))");
    expect(r.d('p')[0]).toBeCloseTo(1, 1);
    expect(r.d('n')).toEqual([0]);
    expect(r.d('th')[0]).toBeCloseTo(0.0786, 3);
    expect(r.d('b')).toEqual([1, 0, 1, 0, 1, 0]);
    expect(r.d('back')).toEqual([5, 2]);
    expect(r.graphics.figures.length).toBe(1);
    expect(() => run('qammod(1:3, 8)')).toThrow(/square/);
  });
});
