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
