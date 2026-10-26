import { describe, expect, it } from 'vitest';
import { Spring3D } from './spring';

describe('Spring3D', () => {
  it('swings out after a kick and settles back to rest', () => {
    const s = new Spring3D(900, 45).kick(0, 0, 2.8);
    let peak = 0;
    for (let i = 0; i < 120; i++) { s.update(1 / 60); peak = Math.max(peak, s.pos.z); }
    expect(peak).toBeGreaterThan(0.02);
    expect(peak).toBeLessThan(0.08);
    expect(Math.abs(s.pos.z)).toBeLessThan(1e-3);
  });
  it('stays stable on a long, slow frame', () => {
    const s = new Spring3D(900, 45).kick(5, 5, 5);
    s.update(0.5);
    expect(Number.isFinite(s.pos.x)).toBe(true);
    expect(Math.abs(s.pos.x)).toBeLessThan(0.5);
  });
});
