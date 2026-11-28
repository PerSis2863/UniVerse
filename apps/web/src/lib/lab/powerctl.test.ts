import { describe, expect, it } from 'vitest';
import { BUCK_CTL, buckControl, droopShare, GRID_INV, gridInverter, mppt, PFC, pfcBoost, settle, svpwm } from './powerctl';

describe('converter control (M565)', () => {
  it('a buck holds 3.3 V through a load step under voltage and peak-current mode', () => {
    for (const mode of ['voltage', 'current'] as const) {
      const r = buckControl({ ...BUCK_CTL, mode, cycles: 600 });
      const end = r.vout[r.vout.length - 1];
      expect(end).toBeGreaterThan(3.2); expect(end).toBeLessThan(3.4);
      const s = settle(r.t, r.vout, 1e-3, 0.05 * 3.3);
      expect(s.time).toBeLessThan(1e-3);
      expect(s.deviation).toBeLessThan(1);
    }
  });
  it('a PFC boost draws a sine current: power factor near 1, THD low, the output held', () => {
    const r = pfcBoost({ ...PFC, cycles: 12 });
    expect(r.pf).toBeGreaterThan(0.97);
    expect(r.thd).toBeLessThan(0.12);
    expect(Math.abs(r.vmean - 400)).toBeLessThan(15);
  });
  it('MPPT: both methods track most of the energy as the sun changes', () => {
    const G = Array.from({ length: 600 }, (_, k) => (k < 300 ? 1000 : 600));
    for (const m of ['po', 'inccond'] as const) expect(mppt(m, G, 25, 0.2).efficiency).toBeGreaterThan(0.97);
  });
  it('SVPWM duties stay in range and reach √3/2·Vdc… ; droop shares a load and clips at a limit', () => {
    const d = svpwm(0.57 * 700, 0, 700);
    expect(Math.max(d.da, d.db, d.dc)).toBeLessThanOrEqual(1); expect(Math.min(d.da, d.db, d.dc)).toBeGreaterThanOrEqual(0);
    expect(d.da - d.db).toBeCloseTo((0.57 * 700 * 1.5) / 700, 6);
    expect(svpwm(0, 100, 700).sector).toBe(2);
    const s = droopShare(30e3, [1e-4, 2e-4], [100e3, 100e3]);
    expect(s.P[0]).toBeCloseTo(2 * s.P[1], 6); expect(s.P[0] + s.P[1]).toBeCloseTo(30e3, 6); expect(s.f).toBeCloseTo(50 - 1e-4 * 20e3, 9);
    const c = droopShare(30e3, [1e-4, 2e-4], [12e3, 100e3]);
    expect(c.P[0]).toBe(12e3); expect(c.P[1]).toBeCloseTo(18e3, 6);
  });
  it('a grid-tied inverter locks to the grid and follows P and Q', () => {
    const r = gridInverter(GRID_INV), n = r.t.length;
    expect(Math.abs(r.angleErr[n - 1])).toBeLessThan(0.02);
    expect(r.P[Math.round(n * 0.45)]).toBeCloseTo(5e3, -2);
    expect(r.P[n - 1]).toBeCloseTo(10e3, -2);
    expect(r.Q[n - 1]).toBeCloseTo(3e3, -2);
  });
});
