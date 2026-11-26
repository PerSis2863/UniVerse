import { describe, expect, it } from 'vitest';
import { mmc, simulate } from './des';

describe('Hyperion discrete-event simulation (M479)', () => {
  it('Erlang’s formulas', () => {
    const m1 = mmc(0.8, 1, 1);
    expect(m1.wq).toBeCloseTo(4, 10); expect(m1.l).toBeCloseTo(4, 10);
    const m2 = mmc(1.5, 1, 2); // P(wait) = 0.6428…, Wq = 0.6428·… textbook: Lq = 1.9286
    expect(m2.lq).toBeCloseTo(1.92857, 4);
  });
  it('an M/M/1 queue matches the theory', () => {
    const r = simulate({ arrival: { kind: 'exp', mean: 1.25 }, stations: [{ name: 'Desk', servers: 1, service: { kind: 'exp', mean: 1 } }] }, 400_000, 7, { warmup: 2000, maxArrivals: 1e7 });
    expect(r.stations[0].meanWait).toBeGreaterThan(4 * 0.93); expect(r.stations[0].meanWait).toBeLessThan(4 * 1.07);
    expect(r.stations[0].utilisation).toBeCloseTo(0.8, 1);
    expect(r.stations[0].meanQueue).toBeGreaterThan(3.2 * 0.92); expect(r.stations[0].meanQueue).toBeLessThan(3.2 * 1.08);
  });
  it('M/M/2 and M/D/1 too, and a line of stations passes everyone through', () => {
    const r2 = simulate({ arrival: { kind: 'exp', mean: 1 / 1.5 }, stations: [{ name: 'Two', servers: 2, service: { kind: 'exp', mean: 1 } }] }, 300_000, 3, { warmup: 2000, maxArrivals: 1e7 });
    expect(r2.stations[0].meanQueue / 1.92857).toBeGreaterThan(0.92); expect(r2.stations[0].meanQueue / 1.92857).toBeLessThan(1.08);
    const d1 = simulate({ arrival: { kind: 'exp', mean: 1.25 }, stations: [{ name: 'D', servers: 1, service: { kind: 'const', value: 1 } }] }, 300_000, 5, { warmup: 2000, maxArrivals: 1e7 });
    expect(d1.stations[0].meanWait / 2).toBeGreaterThan(0.93); expect(d1.stations[0].meanWait / 2).toBeLessThan(1.07);
    const line = simulate({ arrival: { kind: 'exp', mean: 2 }, stations: [{ name: 'A', servers: 1, service: { kind: 'exp', mean: 1 } }, { name: 'B', servers: 1, service: { kind: 'uniform', lo: 0.5, hi: 1.5 } }] }, 50_000, 2);
    expect(line.throughput).toBeCloseTo(0.5, 1);
    expect(line.stations[1].served).toBeGreaterThan(line.stations[0].served - 5);
    const same = simulate({ arrival: { kind: 'exp', mean: 2 }, stations: [{ name: 'A', servers: 1, service: { kind: 'exp', mean: 1 } }] }, 1000, 9);
    expect(simulate({ arrival: { kind: 'exp', mean: 2 }, stations: [{ name: 'A', servers: 1, service: { kind: 'exp', mean: 1 } }] }, 1000, 9).arrived).toBe(same.arrived);
    const cap = simulate({ arrival: { kind: 'exp', mean: 0.5 }, stations: [{ name: 'Small', servers: 1, service: { kind: 'exp', mean: 1 }, capacity: 2 }] }, 5000, 4);
    expect(cap.stations[0].balked).toBeGreaterThan(0); expect(cap.stations[0].maxQueue).toBeLessThanOrEqual(2);
    expect(() => simulate({ arrival: { kind: 'exp', mean: 1 }, stations: [{ name: 'A', servers: 1, service: { kind: 'exp', mean: 1 } }], route: [[0.8, 0.5]] }, 10)).toThrow(/Routing/);
  });
});
