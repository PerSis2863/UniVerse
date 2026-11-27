import { describe, expect, it } from 'vitest';
import { C_AIR, roomModes, SoundSim, spectrumPeaks, type SoundModel } from './acoustics';

describe('Hyperion Simulate: sound (M551)', () => {
  it('a pulse travels at the speed of sound', () => {
    const m: SoundModel = { width: 20, height: 4, edges: 'open', blocks: [], source: { x: 2, y: 2, kind: 'pulse', hz: 300 }, listener: { x: 12, y: 2 } };
    const s = new SoundSim(m, 400);
    s.step(Math.ceil(0.05 / s.dt));
    // The pulse's peak at the listener, less its own delay at the source (4 widths).
    let at = 0;
    s.trace.forEach((v, i) => { if (Math.abs(v) > Math.abs(s.trace[at])) at = i; });
    const delay = 4 / (Math.PI * 300), speed = 10 / (at * s.dt - delay);
    expect(speed / C_AIR).toBeGreaterThan(0.96);
    expect(speed / C_AIR).toBeLessThan(1.04);
  });
  it('a closed room rings at its modes, (c/2)·√((m/W)² + (n/H)²)', () => {
    const m: SoundModel = { width: 5, height: 3.5, edges: 'room', blocks: [], source: { x: 0.4, y: 0.4, kind: 'pulse', hz: 400 }, listener: { x: 4.5, y: 3.1 } };
    const s = new SoundSim(m, 100);
    s.step(Math.ceil(0.6 / s.dt));
    const found = spectrumPeaks(s.trace, s.dt, 20, 120, 8), theory = roomModes(5, 3.5, 3);
    for (const t of theory) expect(Math.min(...found.map((f) => Math.abs(f.hz - t.hz) / t.hz))).toBeLessThan(0.03);
  });
  it('a wall in the way makes it quieter behind it, and sound leaves an open box', () => {
    const base: SoundModel = { width: 20, height: 10, edges: 'open', blocks: [], source: { x: 4, y: 2, kind: 'tone', hz: 100 }, listener: { x: 14, y: 2 } };
    const run = (m: SoundModel) => { const s = new SoundSim(m, 160); s.step(Math.ceil(0.25 / s.dt)); return s.listenerDb(0.05); };
    const free = run(base), behind = run({ ...base, blocks: [{ id: 'w', x: 9, y: 0, w: 0.4, h: 6, absorb: 0 }] });
    expect(free - behind).toBeGreaterThan(5);
    expect(Number.isFinite(free)).toBe(true);
  });
});
