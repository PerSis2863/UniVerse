import { describe, expect, it } from 'vitest';
import { accessFromTags, accessSummary, cleanAccess } from './travel-access';

describe('accessibility for places', () => {
  it('reads the map’s tags', () => {
    expect(accessFromTags({ wheelchair: 'limited', 'toilets:wheelchair': 'yes', 'wheelchair:description': 'Ramp at the side door' })).toEqual({ wheelchair: 'limited', toilet: true, hearingLoop: null, lift: null, description: 'Ramp at the side door' });
    expect(accessFromTags({ cuisine: 'pizza' })).toBeNull();
  });
  it('keeps visitors’ notes and adds them up', () => {
    expect(cleanAccess({ stepFree: true, lift: 'yes', note: '  wide   doors ', hack: true })).toEqual({ stepFree: true, note: 'wide doors' });
    expect(cleanAccess({})).toBeNull();
    const s = accessSummary([{ stepFree: true }, { stepFree: false, toilet: true }, null, { stepFree: true, note: 'Lift to every floor' }]);
    expect(s.things).toEqual([{ key: 'stepFree', label: 'Step-free entrance', yes: 2, of: 3 }, { key: 'toilet', label: 'Accessible toilet', yes: 1, of: 1 }]);
    expect(s.notes).toEqual(['Lift to every floor']);
    expect(s.visitors).toBe(3);
  });
});
