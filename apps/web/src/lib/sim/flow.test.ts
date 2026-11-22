import { describe, expect, it } from 'vitest';
import { shapeOutline, swingRate, Tunnel } from './flow';

describe('Hyperion Simulate: the wind tunnel (M408)', () => {
  it('a cylinder at Re 20: steady drag about 2–3.5 (open flow ≈ 2.1, more for neighbours above and below), no lift', () => {
    const t = new Tunnel({ nx: 200, ny: 80, re: 20, shape: { kind: 'cylinder', angle: 0, thickness: 12, camber: 0 } });
    expect(t.D).toBeGreaterThanOrEqual(15);
    expect(t.reActual).toBeCloseTo(20, 6);
    const cds: number[] = [];
    for (let s = 0; s < 3000; s++) { t.step(); if (s > 2600) cds.push(t.cd); }
    const cd = cds.reduce((a, b) => a + b, 0) / cds.length;
    expect(cd).toBeGreaterThan(1.9);
    expect(cd).toBeLessThan(3.6);
    expect(Math.abs(t.cl)).toBeLessThan(0.1); // the shape sits a hair off the middle (so a wake can sway): a trace of lift
    // No cell has run away (the method stays stable).
    expect(t.field('speed').every((v) => Number.isFinite(v) && v < 3)).toBe(true);
  }, 30_000);
  it('a wing at an angle lifts; turned the other way it pushes down', () => {
    const lift = (angle: number) => {
      const t = new Tunnel({ nx: 200, ny: 80, re: 60, shape: { kind: 'airfoil', angle, thickness: 12, camber: 0 } });
      let cl = 0;
      for (let s = 0; s < 1800; s++) { t.step(); if (s >= 1500) cl += t.cl / 300; }
      return cl;
    };
    expect(lift(8)).toBeGreaterThan(0.1);
    expect(lift(-8)).toBeLessThan(-0.1);
  }, 30_000);
  it('a NACA section is as thick as asked, and counts swings of a signal', () => {
    const pts = shapeOutline({ kind: 'airfoil', angle: 0, thickness: 12, camber: 0 }, 0, 0, 10);
    const ys = pts.map((p) => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.12 * 25, 1);
    expect(swingRate(Array.from({ length: 400 }, (_, i) => Math.sin((2 * Math.PI * i) / 50)))).toBeCloseTo(1 / 50, 3);
    expect(swingRate([1, 2, 3])).toBeNull();
  });
});
