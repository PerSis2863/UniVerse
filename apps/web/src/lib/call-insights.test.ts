import { describe, expect, it } from 'vitest';
import { callInsights } from './call-insights';

const at = (daysBack: number, h = 12) => { const d = new Date(2026, 9, 23 - daysBack, h); return d.toISOString(); };
const row = (daysBack: number, sec: number | null, title = 'Priya', missed = false) => ({ at: at(daysBack), durationSec: sec, missed, answered: !missed, title, type: 'chat' });

describe('call insights', () => {
  it('adds up the week, today last', () => {
    const s = callInsights([row(0, 600), row(0, 300, 'Rahul'), row(2, 1800), row(3, null, 'Rahul', true), row(9, 3600)], new Date(2026, 9, 23, 18).getTime());
    expect(s.days.map((d) => d.minutes)).toEqual([0, 0, 0, 0, 30, 0, 15]);
    expect(s.days[6].label).toBe('Fri');
    expect(s).toMatchObject({ minutes: 45, calls: 4, missed: 1, longest: 1800, top: { title: 'Priya', count: 2 } });
  });
});
