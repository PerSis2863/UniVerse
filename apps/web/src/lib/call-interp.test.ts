import { describe, expect, it } from 'vitest';
import { spokenOnes, UNDER, voiceVolume } from './call-interp';

describe('call interpreters', () => {
  it('turns the others down for someone listening to an interpreter', () => {
    expect(voiceVolume('a', null)).toBe(1);
    expect(voiceVolume('i', 'i')).toBe(1);
    expect(voiceVolume('a', 'i')).toBe(UNDER);
  });
  it('lists the spoken interpreters', () => {
    expect(spokenOnes({ i: { kind: 'spoken', label: 'Spanish', name: 'Ines' }, s: { kind: 'sign', label: 'BSL', name: 'Sam' } })).toEqual([{ userId: 'i', kind: 'spoken', label: 'Spanish', name: 'Ines' }]);
  });
});
