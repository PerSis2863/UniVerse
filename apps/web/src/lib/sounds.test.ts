import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chime, setSounds, soundsOn } from './sounds';

describe('sounds', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
  });
  it('are off until turned on', () => {
    expect(soundsOn()).toBe(false);
    setSounds(true);
    expect(soundsOn()).toBe(true);
    setSounds(false);
    expect(soundsOn()).toBe(false);
  });
  it('never throw where there is no audio', () => {
    setSounds(true);
    vi.stubGlobal('window', {});
    expect(() => chime('success')).not.toThrow();
  });
});
