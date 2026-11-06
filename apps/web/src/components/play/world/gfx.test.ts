import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pace, fitFor, gfxNow, saveFit, setGfx } from './gfx';

// M118: the 3D games' graphics choice and the sharpness each choice held, kept on the device.
beforeEach(() => {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, get length() { return store.size; },
  } as Storage;
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
});
afterEach(() => { Reflect.deleteProperty(globalThis, 'localStorage'); vi.unstubAllGlobals(); });

describe('graphics choice', () => {
  it('starts Balanced and ignores anything else stored', () => {
    expect(gfxNow()).toBe('balanced');
    localStorage.setItem('uv-play-gfx', 'ultra');
    expect(gfxNow()).toBe('balanced');
  });

  it('keeps the sharpness that held, within the choice’s cap', () => {
    expect(fitFor('balanced')).toBeNull();
    saveFit('balanced', 1.25);
    expect(fitFor('balanced')).toBe(1.25);
    saveFit('smooth', 1.5); // over Smooth's cap of 1: not trusted
    expect(fitFor('smooth')).toBeNull();
    localStorage.setItem('uv-play-fit', '{not json');
    expect(fitFor('balanced')).toBeNull();
  });

  it('a person’s choice starts at its best; the world lowering it keeps what it found', () => {
    saveFit('smooth', 0.75);
    saveFit('balanced', 1);
    setGfx('smooth', true);
    expect(gfxNow()).toBe('smooth');
    expect(fitFor('smooth')).toBe(0.75);
    setGfx('balanced');
    expect(gfxNow()).toBe('balanced');
    expect(fitFor('balanced')).toBeNull();
    expect(window.dispatchEvent).toHaveBeenCalledTimes(2);
  });
});

describe('frame pacing', () => {
  /** Feeds `secs` of frames `ms` long (a list repeats); returns what it said, with the time. */
  const run = (pace: Pace, ms: number | number[], secs: number) => {
    const said: [string, number][] = [];
    const list = Array.isArray(ms) ? ms : [ms];
    for (let t = 0, i = 0; t < secs; i++) { const d = list[i % list.length] / 1000; t += d; const go = pace.feed(d); if (go) said.push([go, +pace.age.toFixed(2)]); }
    return said;
  };
  it('leaves a steady 60 alone, and lowers a steady 50 on a 60 Hz screen after the first second', () => {
    expect(run(new Pace(() => 1 / 60), 16.7, 20)).toEqual([]);
    const fifty = run(new Pace(() => 1 / 60), 20, 3);
    expect(fifty[0][0]).toBe('down');
    expect(fifty[0][1]).toBeLessThan(1.8);
  });
  it('lowers judder (every sixth frame missed), not a one-off hitch', () => {
    expect(run(new Pace(() => 1 / 60), [16.7, 16.7, 16.7, 16.7, 16.7, 33.3], 6)[0]?.[0]).toBe('down');
    expect(run(new Pace(() => 1 / 60), [...Array(120).fill(16.7), 300], 20)).toEqual([]);
  });
  it('doesn’t take a 50 Hz screen or a 30-a-second battery saver for a slow device', () => {
    expect(run(new Pace(() => 1 / 50), 20, 20)).toEqual([]);
    expect(run(new Pace(() => 1 / 30), 33.3, 20)).toEqual([]);
  });
  it('steps a device managing 3 frames a second down soon, and a quick screen up', () => {
    const slow = run(new Pace(() => 1 / 60), 333, 5);
    expect(slow[0]).toEqual(['down', expect.any(Number)]);
    expect(slow[0][1]).toBeLessThan(2.5);
    expect(run(new Pace(() => 1 / 120), 8.3, 4)[0][0]).toBe('up');
    // Slower than a frame a second (software drawing): still down, from the third frame.
    expect(run(new Pace(() => 1 / 60), 2400, 8)[0]).toEqual(['down', 3]);
  });
});
