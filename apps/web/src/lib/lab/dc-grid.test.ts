import { describe, expect, it } from 'vitest';
import * as g from './dc-grid';
import { Lab } from './interp';
import { Graphics } from './plot';
import './sciences';

const run = (code: string) => { let out = ''; const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics() }); lab.run(code); return out; };

describe('data centres on the grid (M572)', () => {
  it('the receiving voltage satisfies the power flow, and collapses past the nose', () => {
    const V = g.receivingVoltage(0.5, 0.1, 1, 0.02, 0.1);
    // V·I* = P + jQ with I = (Vs − V)/Z: check by the angle-free equation
    const lhs = V ** 4 - (1 - 2 * (0.5 * 0.02 + 0.1 * 0.1)) * V * V + (0.25 + 0.01) * (0.0004 + 0.01);
    expect(lhs).toBeCloseTo(0, 12);
    expect(V).toBeLessThan(1);
    expect(g.receivingVoltage(10, 0, 1, 0, 0.1)).toBeNaN();
    // a lossless line's nose at unity power factor: P = Vs²/(2X)
    expect(g.hostingCapacity(1, 0, 0.1, 1, 0).nose).toBeCloseTo(5, 4);
  });
  it('hosting capacity is limited by voltage before the nose', () => {
    const h = g.hostingCapacity(1, 0.01, 0.1, 0.98, 0.95);
    expect(h.limitedBy).toBe('voltage');
    expect(g.receivingVoltage(h.capacity, h.capacity * Math.tan(Math.acos(0.98)), 1, 0.01, 0.1)).toBeCloseTo(0.95, 6);
    expect(g.hostingCapacity(1, 0.01, 0.1, 0.98, 0.95, 0.2).limitedBy).toBe('thermal');
  });
  it('a tap changer brings a sagging voltage back inside its band', () => {
    const P = Array(400).fill(0.8), r = g.voltageSeries(P, P.map(() => 0.2), 1, 0.01, 0.08, 1, g.TAP);
    expect(r.V[0]).toBeLessThan(0.98);
    expect(Math.abs(r.V[399] - 1)).toBeLessThanOrEqual(0.01 + 1e-9);
    expect(r.taps[399]).toBeGreaterThan(0);
  });
  it('frequency: the settled deviation is ΔP/(D + 1/R), a battery raises the nadir', () => {
    const t = Array.from({ length: 601 }, (_, i) => i * 0.1), dP = t.map(() => 0.02);
    const r = g.frequencyResponse(t, dP, g.SFR);
    expect(r.settled).toBeCloseTo((-0.02 / (1 + 20)) * 50, 2);
    expect(r.rocof).toBeCloseTo((0.02 / 8) * 50, 1);
    const b = g.frequencyResponse(t, dP, { ...g.SFR, battery: 0.02 });
    expect(b.nadir).toBeGreaterThan(r.nadir);
    expect(r.nadir).toBeLessThan(r.settled);
  });
  it('harmonics: a capacitor bank resonating near the 5th amplifies it', () => {
    const plain = g.harmonics({ load: 100, kV: 34.5, ssc: 2500, xr: 10, cap: 0, mix: { '6pulse': 1 }, demand: 1, linear: 0 });
    expect(plain.Vh[0]).toBeCloseTo(35 * (100 / 2500) * 5 * Math.hypot(1, Math.sqrt(5) / 50), 6);
    const cap = g.harmonics({ load: 100, kV: 34.5, ssc: 2500, xr: 10, cap: 100, mix: { '6pulse': 1 }, demand: 1, linear: 0 });
    expect(cap.resonance).toBeCloseTo(5, 6);
    expect(cap.Vh[0]).toBeGreaterThan(5 * plain.Vh[0]);
    expect(cap.pass).toBe(false);
    const afe = g.harmonics({ load: 100, kV: 34.5, ssc: 2500, xr: 10, cap: 0, mix: { afe: 1 }, demand: 1, linear: 0 });
    expect(afe.pass).toBe(true);
    expect(g.tddLimit(25)).toBe(8); expect(g.voltageLimits(34.5)).toEqual([5, 3]);
  });
  it('ITIC', () => {
    expect(g.itic(0, 0.015)).toBe(true); expect(g.itic(0.5, 0.1)).toBe(false); expect(g.itic(0.75, 0.3)).toBe(true);
    expect(g.itic(0.75, 2)).toBe(false); expect(g.itic(1.15, 1)).toBe(false); expect(g.sagDivider(1, 3)).toBe(0.75);
  });
  it('speaks the language', () => {
    const out = run(`[V, taps] = dcGridVoltage(0.8*ones(1, 200), 0.2, 'Tap', true);
h = dcHostingCapacity([0.01 0.1]); [df, s] = dcFrequency(0:0.1:30, 0.02);
H = dcHarmonics(100, 34.5, 2500, 'Rectifier', [0.5 0 0.5 0], 'Capacitor', 60);
fprintf('%d %.3f %.3f %d %d\\n', taps(end) > 0, h.Capacity, s.Nadir, numel(H.Order), sum(itic([0 0.5], [0.01 0.1])))`);
    const [tp, cap, nad, n, ok] = out.trim().split(' ').map(Number);
    expect(tp).toBe(1); expect(cap).toBeGreaterThan(0.2); expect(nad).toBeLessThan(0); expect(n).toBe(8); expect(ok).toBe(1);
  });
});
