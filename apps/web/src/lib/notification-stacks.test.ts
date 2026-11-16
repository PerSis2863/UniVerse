import { describe, expect, it } from 'vitest';
import { byDay, stacks, when } from './notification-stacks';

describe('the notifications panel list (M222)', () => {
  const now = new Date(2026, 10, 16, 15, 0).getTime();
  const at = (h: number) => new Date(now - h * 3_600_000).toISOString();

  it('stacks the same notification one after another, not ones apart', () => {
    const n = (title: string, type = 'event') => ({ title, type });
    expect(stacks([n('A'), n('A'), n('B'), n('A'), n('A', 'chat')]).map((s) => s.length)).toEqual([2, 1, 1, 1]);
    expect(stacks([])).toEqual([]);
  });

  it('groups by day in order, leaving out empty days', () => {
    const g = byDay([{ createdAt: at(1) }, { createdAt: at(20) }, { createdAt: at(80) }, { createdAt: at(90) }], now);
    expect(g.map((x) => [x.label, x.notes.length])).toEqual([['Today', 1], ['Yesterday', 1], ['Earlier', 2]]);
    expect(byDay([{ createdAt: at(80) }], now).map((x) => x.label)).toEqual(['Earlier']);
  });

  it('dates them like iOS', () => {
    expect(when(new Date(now - 20_000).toISOString(), now)).toBe('now');
    expect(when(at(0.5), now)).toBe('30m ago');
    expect(when(at(6), now)).toBe('6h ago');
    expect(when(at(50), now)).toBe('2d ago');
  });
});
