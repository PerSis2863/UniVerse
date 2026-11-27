import { describe, expect, it } from 'vitest';
import * as gn from './dc-gen';
import { Lab } from './interp';
import { Graphics } from './plot';
import './sciences';

const run = (code: string) => { let out = ''; const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics() }); lab.run(code); return out; };
const plant: gn.Plant = { grid: 100, turbines: 4, cap: 50, min: 0.3, ramp: 5, eta: 0.4, T: 15, battery: 100, bpower: 130, rte: 0.88, soc0: 0.5, socMin: 0.1, socMax: 0.95, gasPrice: 4, gridPrice: 80, gridCO2: 0.4 };

describe('power on site (M575)', () => {
  it('a gas turbine: 40% → ~30% at half load, derated in hot air, fuel and CO₂ by heat rate', () => {
    const f = gn.gasTurbine(1, 50, 0.4), h = gn.gasTurbine(0.5, 50, 0.4), hot = gn.gasTurbine(1, 50, 0.4, 35);
    expect(f.efficiency).toBeCloseTo(0.4, 9); expect(h.efficiency).toBeCloseTo(0.296, 3);
    expect(hot.capacity).toBeCloseTo(50 * 0.86, 9);
    expect(f.heatRate).toBeCloseTo(8530, 0); expect(f.fuel).toBeCloseTo(426.5, 0); expect(f.co2).toBeCloseTo(426.5 * 0.05306, 1);
  });
  it('a PEM cell: ~1 V open, falling with current; power peaks; hydrogen by Faraday', () => {
    const lo = gn.fuelCell(1, 'pem', 1, 100), mid = gn.fuelCell(400, 'pem', 1, 100);
    expect(lo.V).toBeGreaterThan(1); expect(mid.V).toBeGreaterThan(0.6); expect(mid.V).toBeLessThan(0.85);
    // 1 A for an hour in one cell: 1/(2F)·2.016 g/mol·3600 s = 0.0376 g
    expect(gn.fuelCell(10, 'pem', 1, 100).h2).toBeCloseTo(3.76e-5, 7);
  });
  it('a genset: a bigger block dips deeper; small steps meet the tighter classes', () => {
    const t = Array.from({ length: 801 }, (_, i) => i * 0.01);
    const small = gn.gensetSteps(t, [[0, 0.2], [1, 0.45]], gn.GENSET), big = gn.gensetSteps(t, [[0, 0.2], [1, 0.95]], gn.GENSET);
    expect(big.dip).toBeLessThan(small.dip); expect(small.classes).toContain('G2'); expect(big.classes).not.toContain('G3');
    expect(small.f[800]).toBeCloseTo(60, 1);      // isochronous: back to 60 Hz
  });
  it('the hybrid plant serves an AI load that swings faster than turbines ramp, thanks to the battery', () => {
    const load = Array.from({ length: 240 }, (_, i) => 200 + 60 * Math.sign(Math.sin((2 * Math.PI * i) / 20)));
    const withB = gn.dispatch(load, [], 1 / 60, plant), without = gn.dispatch(load, [], 1 / 60, { ...plant, battery: 0, bpower: 0 });
    expect(withB.totals.unserved).toBeLessThan(0.01); expect(without.totals.unserved).toBeGreaterThan(1);
    const bal = load.map((l, i) => withB.grid[i] + withB.gt[i] + withB.battery[i] + withB.unserved[i] - withB.curtailed[i] - l);
    expect(Math.max(...bal.map(Math.abs))).toBeLessThan(1e-9);
    expect(Math.max(...withB.grid)).toBeLessThanOrEqual(100);
    expect(Math.min(...withB.soc)).toBeGreaterThanOrEqual(0.1 - 1e-9);
  });
  it('speaks the language', () => {
    const out = run(`g = gasTurbine([0.5 1], 'Rated', 40); [V, P] = fuelCell([100 500], 'Cells', 300, 'Area', 300);
[f, s] = gensetStep(0:0.01:6, [0 0.2; 1 0.5]); h = hybridPower(250*ones(1, 120), 1/60, 'Grid', 100, 'Battery', [50 50 0.9]);
fprintf('%.3f %d %.1f %.3f %.0f\\n', g.Efficiency(2), P(2) > P(1), s.Dip, h.UnservedMWh, h.Starts)`);
    const [e, more, dip, uns, starts] = out.trim().split(' ').map(Number);
    expect(e).toBeCloseTo(0.4, 3); expect(more).toBe(1); expect(dip).toBeLessThan(-1); expect(uns).toBeCloseTo(0, 3); expect(starts).toBe(0);
  });
});
