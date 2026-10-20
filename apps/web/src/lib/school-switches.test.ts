import { describe, expect, it } from 'vitest';
import { composeSwitches, emailScheduleEntries, orgCandidates, parseEmailSchedule, parseOrgSwitches, parseRollouts, parseSwitches, rolloutBucket, schoolOff } from './feature-switches';

// A feature off for one school (Stage 5 · A9): stored next to the global switches and the owner's
// email schedule in one list, without either losing the others.
describe('per-school feature switches', () => {
  const raw = JSON.stringify(['ai', 'email:digest=weekly', 'org:school1=chat', 'org:school1=uploads', 'org:school2=ai', 'org:bad id=chat', 'org:school3=nope', 'rollout:boards=30', 'rollout:nope=5', 'rollout:groups=100']);

  it('reads all three kinds from the one list', () => {
    expect(parseSwitches(raw)).toEqual(['ai']);
    expect(parseEmailSchedule(raw).digest).toBe('weekly');
    expect(parseOrgSwitches(raw)).toEqual({ school1: ['chat', 'uploads'], school2: ['ai'] });
  });

  it('writes them back together, nothing lost', () => {
    const orgs = { ...parseOrgSwitches(raw), school3: ['boards'] };
    const out = composeSwitches(parseSwitches(raw), emailScheduleEntries(parseEmailSchedule(raw)), orgs, parseRollouts(raw));
    expect(parseSwitches(out)).toEqual(['ai']);
    expect(parseEmailSchedule(out).digest).toBe('weekly');
    expect(parseOrgSwitches(out)).toEqual({ school1: ['chat', 'uploads'], school2: ['ai'], school3: ['boards'] });
    expect(parseRollouts(out)).toEqual({ boards: 30 });
    expect(composeSwitches([], [], {}, {})).toBeNull();
  });

  it('only changes covered by a school switch need the person’s school', () => {
    const orgs = parseOrgSwitches(raw);
    expect(orgCandidates(orgs, 'POST', '/api/chat/conversations').map((f) => f.id)).toEqual(['chat']);
    expect(orgCandidates(orgs, 'POST', '/api/upload')).toHaveLength(1);
    expect(orgCandidates(orgs, 'GET', '/api/chat/conversations')).toEqual([]); // reading is never switched off
    expect(orgCandidates(orgs, 'DELETE', '/api/chat/messages/m1')).toEqual([]); // deleting your own message still works
    expect(orgCandidates(orgs, 'POST', '/api/boards/b1')).toEqual([]); // nobody has boards off
    expect(orgCandidates({}, 'POST', '/api/chat/conversations')).toEqual([]);
  });

  it('gradual rollout: a stable share of schools, growing as the percent goes up', () => {
    expect(parseRollouts(raw)).toEqual({ boards: 30 }); // unknown features and 100 % are ignored
    const schools = Array.from({ length: 1000 }, (_, i) => `org${i}`);
    const inAt = (pct: number) => schools.filter((o) => !schoolOff({}, { boards: pct }, o).includes('boards'));
    expect(inAt(0)).toHaveLength(0);
    expect(Math.abs(inAt(30).length - 300)).toBeLessThan(60); // about 30 %
    expect(inAt(30).every((o) => inAt(60).includes(o))).toBe(true); // raising it only adds schools
    expect(rolloutBucket('boards', 'org7')).toBe(rolloutBucket('boards', 'org7'));
    expect(schoolOff({}, { boards: 0 }, null)).toEqual([]); // people not in a school keep it
    expect(schoolOff({ s1: ['chat'] }, { boards: 0 }, 's1').sort()).toEqual(['boards', 'chat']);
    // The Worker checks a rolled-out feature's changes too
    expect(orgCandidates({}, 'POST', '/api/boards/b1', { boards: 30 }).map((f) => f.id)).toEqual(['boards']);
  });
});
