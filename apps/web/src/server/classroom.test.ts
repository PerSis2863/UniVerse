import { describe, expect, it, vi } from 'vitest';
import { classCode, codeWindow, moodCounts, normalizeClassCode } from './classroom';

vi.mock('./realtime', () => ({ publish: vi.fn() }));

describe('in-person class codes', () => {
  it('makes the same 6-character code for a secret and window, and a different one next window', async () => {
    const a = await classCode('secret-1', 1000);
    expect(a).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
    expect(await classCode('secret-1', 1000)).toBe(a);
    expect(await classCode('secret-1', 1001)).not.toBe(a);
    expect(await classCode('secret-2', 1000)).not.toBe(a);
  });
  it('changes window every 30 seconds', () => {
    expect(codeWindow(0)).toBe(0);
    expect(codeWindow(29_999)).toBe(0);
    expect(codeWindow(30_000)).toBe(1);
  });
  it('reads codes the way people type them', () => {
    expect(normalizeClassCode('ab2-c3d')).toBe('AB2C3D');
    expect(normalizeClassCode(' ab 2c 3d ')).toBe('AB2C3D');
    expect(normalizeClassCode('AB2C3')).toBeNull();
    expect(normalizeClassCode('AB2C3O')).toBeNull(); // O isn't used
    expect(normalizeClassCode(123456)).toBeNull();
  });
});

describe('moodCounts', () => {
  it('counts lost and fine answers from the last five minutes only', () => {
    const now = Date.parse('2026-10-13T10:00:00Z');
    const ago = (min: number) => new Date(now - min * 60_000);
    const m = moodCounts([
      { mood: 'LOST', moodAt: ago(1) },
      { mood: 'LOST', moodAt: ago(6) }, // too old: reset
      { mood: 'OK', moodAt: ago(2) },
      { mood: null, moodAt: null },
    ], now);
    expect(m).toEqual({ lost: 1, ok: 1, total: 4 });
  });
});
