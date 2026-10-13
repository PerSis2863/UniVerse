import { describe, expect, it } from 'vitest';
import { cleanTags, counsellorWorthy, lastDays, lateNights, localParts, moodSignals, nudgesFor, validTimeZone, type Signals } from './wellbeing';

const base: Signals = { lateNights: 0, lost: 0, missed: 0, dueSoon: 0, checkins: 0, hardDays: 0, average: null, veryHardRecent: 0 };

describe('wellbeing radar rules (Stage 5 · D13)', () => {
  it('counts late nights in the student’s own time zone', () => {
    // 01:30 in Kolkata is 20:00 UTC the evening before; 23:30 in Kolkata isn't late enough.
    const times = [new Date('2026-10-10T20:00:00Z'), new Date('2026-10-10T21:00:00Z'), new Date('2026-10-11T18:00:00Z'), new Date('2026-10-12T22:00:00Z')];
    expect(localParts(times[0], 'Asia/Kolkata')).toEqual({ day: '2026-10-11', hour: 1 });
    expect(lateNights(times, 'Asia/Kolkata')).toBe(2); // 11 Oct (twice) and 13 Oct at 03:30
    expect(lateNights(times, 'UTC')).toBe(0);
  });

  it('accepts only real time zones and known tags', () => {
    expect(validTimeZone('Europe/Paris')).toBe('Europe/Paris');
    expect(validTimeZone('Mars/Base')).toBeNull();
    expect(validTimeZone(42)).toBeNull();
    expect(cleanTags(['sleep', 'sleep', 'hacked', 3, 'money'])).toEqual(['sleep', 'money']);
  });

  it('turns signals into gentle private nudges, care first', () => {
    expect(nudgesFor(base)).toEqual([]);
    const ids = nudgesFor({ ...base, lateNights: 3, dueSoon: 5, missed: 2, lost: 3, hardDays: 3 }).map((x) => x.id);
    expect(ids).toEqual(['mood', 'late', 'heavy', 'missed', 'lost']);
    expect(nudgesFor({ ...base, lateNights: 2, dueSoon: 3, missed: 1, lost: 2 })).toEqual([]);
    expect(nudgesFor({ ...base, checkins: 4, average: 4.3 }).map((x) => x.id)).toEqual(['good']);
    expect(nudgesFor({ ...base, veryHardRecent: 1 })[0]).toMatchObject({ id: 'mood', care: true });
    expect(nudgesFor({ ...base, lateNights: 1 + 2 })[0].body).toContain('3 nights');
  });

  it('a counsellor may be told only after many hard days, or very hard ones lately', () => {
    expect(counsellorWorthy({ ...base, hardDays: 3 })).toBe(false);
    expect(counsellorWorthy({ ...base, hardDays: 4 })).toBe(true);
    expect(counsellorWorthy({ ...base, veryHardRecent: 2 })).toBe(true);
  });

  it('reads the week’s check-ins', () => {
    const days7 = lastDays('2026-10-13', 7), days3 = lastDays('2026-10-13', 3);
    expect(days7).toEqual(['2026-10-13', '2026-10-12', '2026-10-11', '2026-10-10', '2026-10-09', '2026-10-08', '2026-10-07']);
    const s = moodSignals([{ day: '2026-10-13', mood: 1 }, { day: '2026-10-12', mood: 2 }, { day: '2026-10-09', mood: 4 }, { day: '2026-10-01', mood: 1 }], days7, days3);
    expect(s).toEqual({ checkins: 3, hardDays: 2, average: 2.3, veryHardRecent: 1 });
  });
});
