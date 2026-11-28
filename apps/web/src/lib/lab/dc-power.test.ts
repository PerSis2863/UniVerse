import { describe, expect, it } from 'vitest';
import * as dc from './dc-power';
import { Lab } from './interp';
import { Graphics } from './plot';
import './sciences';

const run = (code: string) => { let out = ''; const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics() }); lab.run(code); return out; };

describe('data-centre power (M571)', () => {
  it('a chip runs from idle to its TDP, a supply is ~96% at half load', () => {
    expect(dc.chipPower(0, dc.CHIPS.gpu700)).toBe(90);
    expect(dc.chipPower(1, dc.CHIPS.gpu700)).toBe(700);
    const eta = (x: number) => (x * 1000) / (x * 1000 + dc.psuLoss(x * 1000, 1000));
    expect(eta(0.5)).toBeGreaterThan(0.95); expect(eta(0.5)).toBeLessThan(0.97);
    expect(eta(0.1)).toBeLessThan(eta(0.5));
  });
  it('an 8-accelerator server draws ~10 kW flat out, fans faster with warm air', () => {
    const s: dc.Server = { chips: 8, chip: dc.CHIPS.gpu1000, cpus: 2, base: 900, fans: 600, psu: 12000 };
    const p = dc.serverPower(s, 1, 25), warm = dc.serverPower(s, 0.6, 35), cool = dc.serverPower(s, 0.6, 25);
    expect(p.wall).toBeGreaterThan(9500); expect(p.wall).toBeLessThan(11500);
    expect(warm.fans).toBeGreaterThan(cool.fans);
  });
  it('a training job swings between compute and exchange and drops at checkpoints', () => {
    const t = Array.from({ length: 1300 }, (_, i) => i * 0.5);
    const u = dc.workload(t, { ...dc.WORKLOAD, checkpointEvery: 300, checkpointFor: 10 });
    expect(Math.max(...u)).toBeCloseTo(0.95); expect(u).toContain(0.35); expect(u[t.indexOf(295)]).toBe(0.02);
  });
  it('a chiller follows Carnot, free cooling in cold air, PUE between 1.05 and 1.6', () => {
    expect(dc.carnotCOP(20, 0)).toBeGreaterThan(dc.carnotCOP(20, 35));
    expect(dc.mechanicalShare(20, 0)).toBe(0); expect(dc.mechanicalShare(20, 30)).toBe(1);
    const cold = dc.facilityPower(80, 0, dc.FACILITY), hot = dc.facilityPower(80, 38, dc.FACILITY);
    expect(cold.chiller).toBe(0); expect(cold.pue).toBeGreaterThan(1.05);
    expect(hot.pue).toBeGreaterThan(cold.pue); expect(hot.pue).toBeLessThan(1.6);
  });
  it('a gigawatt campus fills phase by phase', () => {
    const c = dc.campus({ phases: [[1, 300], [2, 400], [3, 500]], years: 4, fill: 12, utilisation: 0.8, mean: 15, season: 10, day: 5, facility: dc.FACILITY });
    expect(c.years.map((y) => y.capacity)).toEqual([300, 700, 1200, 1200]);
    expect(c.years[3].peak).toBeGreaterThan(1000); expect(c.years[3].peak).toBeLessThan(1300);
    expect(c.years[3].energy).toBeGreaterThan(c.years[1].energy);
    expect(c.monthPeak).toHaveLength(48);
  });
  it('heat carried by air and water', () => {
    expect(dc.heatFlow(12060, 10).air).toBeCloseTo(1, 3);
    expect(dc.heatFlow(1e5, 10).water).toBeCloseTo(143.9, 0);
  });
  it('speaks the language', () => {
    const out = run(`s = dcServer('Chips', 8, 'Chip', 'gpu1000'); [P, parts] = dcServerPower(s, [0 0.5 1]);
f = dcFacility(1e3*[60 80 100], [5 20 35], 'Rated', 1e5);
c = dcCampus([1 200; 2 300], 3);
fprintf('%d %d %.3f %.0f %.2f\\n', P(3) > P(1), parts.Fans(3) > parts.Fans(1), f.PUE(3), c.PeakMW(3), dcHeatFlow(12060, 10))`);
    const [a, b, pue, peak, air] = out.trim().split(' ').map(Number);
    expect([a, b]).toEqual([1, 1]); expect(pue).toBeGreaterThan(1.1); expect(peak).toBeGreaterThan(400); expect(air).toBeCloseTo(1, 1);
  });
});
