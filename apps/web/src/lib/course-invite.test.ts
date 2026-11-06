import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearInvite, inviteHref, pendingInvite, rememberInvite } from './course-invite';
import { homeFor } from './role-home';

// M113: a teacher's class link is remembered on the device for a day, through signing up or in.
const DAY = 86_400_000;
const ID = 'cmulde0g900147d341qn9mxlw';

beforeEach(() => {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, get length() { return store.size; },
  } as Storage;
});
afterEach(() => { Reflect.deleteProperty(globalThis, 'localStorage'); });

describe('class invites', () => {
  it('remembers the class for a day, then forgets it', () => {
    rememberInvite(ID, 1_000);
    expect(pendingInvite(1_000 + DAY - 1)).toBe(ID);
    expect(pendingInvite(1_000 + DAY)).toBeNull();
    expect(pendingInvite(999)).toBeNull();
  });

  it('keeps only course ids, and clears', () => {
    rememberInvite('../../evil?x=1');
    expect(pendingInvite()).toBeNull();
    localStorage.setItem('uv-join-course', JSON.stringify({ id: 'javascript:alert(1)', at: Date.now() }));
    expect(pendingInvite()).toBeNull();
    rememberInvite(ID);
    clearInvite();
    expect(pendingInvite()).toBeNull();
    expect(inviteHref(ID)).toBe(`/join?course=${ID}`);
  });

  it('sends a student back to the class after signing up or in, and no one else', () => {
    rememberInvite(ID);
    expect(homeFor({ role: 'STUDENT' }, 'campus')).toBe(`/join?course=${ID}`);
    expect(homeFor({ role: 'TEACHER' }, 'campus')).not.toContain('/join');
    expect(homeFor({ role: 'GUARDIAN' })).toBe('/parent');
    clearInvite();
    expect(homeFor({ role: 'STUDENT' }, 'campus')).not.toContain('/join');
  });
});
