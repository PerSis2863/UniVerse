import { describe, expect, it } from 'vitest';
import * as T from './touchstone';
import * as M from './mixsig';
import { Lab } from './interp';
import { FileStore } from './files';
import { toMat, type Struct } from './values';
import './mixsig-lab';

// M571: Touchstone files read and written, mixed mode, and a measured channel in the link.
const S21 = (s: T.SParams, k: number) => [s.re[T.at(s, 1, 0, k)], s.im[T.at(s, 1, 0, k)]];

describe('Hyperion S-parameters (M571)', () => {
  it('reads version 1 (2-port column order S11 S21 S12 S22, MA and DB, wrapped lines, comments)', () => {
    const v1 = `! a 2-port
# GHz S MA R 50
1.0  0.1 0   0.5 -90   0.2 0   0.3 0
2.0  0.1 0
     0.25 -180  0.2 0   0.3 0   ! wrapped
`;
    const s = T.readTouchstone(v1, 2);
    expect(s.f).toEqual([1e9, 2e9]);
    const [r, i] = S21(s, 0);
    expect(r).toBeCloseTo(0); expect(i).toBeCloseTo(-0.5); // 0.5 at −90°
    expect(s.re[T.at(s, 0, 1, 0)]).toBeCloseTo(0.2); // S12
    expect(S21(s, 1)[0]).toBeCloseTo(-0.25);
    const db = T.readTouchstone('# MHz S DB R 50\n100 -20 0 -6.0206 0 -6.0206 0 -20 0\n', 2);
    expect(S21(db, 0)[0]).toBeCloseTo(0.5, 4);
    expect(db.f[0]).toBe(100e6);
    expect(() => T.readTouchstone('# GHz Y RI R 50\n1 0 0\n', 1)).toThrow(/only S-parameter/);
    expect(() => T.readTouchstone('# GHz S RI R 50\n1 0 0 0\n', 2)).toThrow(/rows of 9/);
  });
  it('reads version 2 with its keywords and data order', () => {
    const v2 = `[Version] 2.0
# Hz S RI R 50
[Number of Ports] 2
[Two-Port Data Order] 12_21
[Number of Frequencies] 1
[Network Data]
1e9 0.1 0 0.2 0 0.7 0 0.3 0
[End]
`;
    const s = T.readTouchstone(v2);
    expect(s.re[T.at(s, 0, 1, 0)]).toBeCloseTo(0.2); expect(S21(s, 0)[0]).toBeCloseTo(0.7);
  });
  it('writes and reads back a 4-port, and its differential through is the pair’s', () => {
    const F = 3, n = 4, re = new Float64Array(F * 16), im = new Float64Array(F * 16), f = [1e9, 2e9, 3e9];
    for (let k = 0; k < F; k++) for (const [i, j] of [[1, 0], [0, 1], [3, 2], [2, 3]]) { re[T.at({ n } as T.SParams, i, j, k)] = 0.9 - 0.1 * k; im[T.at({ n } as T.SParams, i, j, k)] = -0.1; }
    const s4: T.SParams = { f, n, re, im, z0: 50 }, back = T.readTouchstone(T.writeTouchstone(s4), 4);
    expect([...back.re]).toEqual([...re].map((x) => expect.closeTo(x, 9)));
    const d = T.sdd(back);
    expect(S21(d, 2)[0]).toBeCloseTo(0.7); expect(S21(d, 2)[1]).toBeCloseTo(-0.1);
    expect(d.z0).toBe(100);
  });
  it('a channel from a file behaves as the same channel modelled, and a lossless line passes a whole symbol', () => {
    const rate = 25e9, line = T.readTouchstone(T.writeTouchstone(T.lossyLine(20, rate / 2, 2 * rate, 3e-9)), 2);
    for (const cfg of [{ ctle: 8, dfe: 3, ffe: [-0.1, 0.8, -0.1] }, {}]) {
      const a = M.linkRun({ rate, loss: 20, ...cfg }), b = M.linkRun({ rate, loss: 0, channel: line, ...cfg });
      expect(b.pulse.main).toBeCloseTo(a.pulse.main, 1);
      expect(Math.abs(b.eyeHeight - a.eyeHeight)).toBeLessThan(0.03);
    }
    const thru = M.linkRun({ rate, loss: 0, channel: T.lossyLine(0, rate / 2, 2 * rate, 5e-9) });
    // a whole symbol through; a perfectly lossless line delayed by a fraction of a sample rings by ~9% (Gibbs)
    expect(thru.pulse.main).toBeGreaterThan(0.95); expect(thru.pulse.main).toBeLessThan(1.15);
    expect(thru.pulse.peak / 32).toBeLessThan(12); // the 5 ns of delay taken out but 8 symbols
    // too few points for the delay: refused, not a wrong eye
    expect(() => M.linkRun({ rate, loss: 0, channel: T.lossyLine(0, rate / 2, 2 * rate, 5e-9, 400) })).toThrow(/finer steps/);
  });
  it('sparameters, rfwrite, s2sdd, rfparam and serdes with a channel, in the language', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files });
    l.run("m = sparameters('model', 'Loss', 18, 'Rate', 25e9); rfwrite(m, 'chan.s2p'); s = sparameters('chan.s2p'); v = rfparam(s, 2, 1); k = serdes('Rate', 25e9, 'Channel', 'chan.s2p', 'CTLE', 8, 'DFE', 3);");
    expect(files.text('chan.s2p')).toMatch(/^! Hyperion rfwrite\n# Hz S RI R 50/);
    expect(toMat((l.vars.get('s') as Struct).f.get('NumPorts')!).d[0]).toBe(2);
    const v = toMat(l.vars.get('v')!);
    expect(v.r).toBe(2000); expect(v.im).toBeDefined();
    expect(toMat((l.vars.get('k') as Struct).f.get('EyeHeight')!).d[0]).toBeGreaterThan(0.05);
    expect(() => l.run("rfwrite(m, 'chan.s4p')")).toThrow(/\.s2p/);
    expect(() => l.run('s2sdd(m)')).toThrow(/4-port/);
  });
});
