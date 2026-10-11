import { describe, expect, it } from 'vitest';
import { canPost, canSee, groupChannels, nameColor, parseIds, parseRules } from './community-roles';

const member = (role = 'MEMBER', roleIds: string[] = []) => ({ role, roleIds });
const channel = (kind: string, priv = false, view: string[] = [], post: string[] = []) => ({ channelKind: kind, channelPrivate: priv, rules: { view, post } });

describe('who sees and posts in a channel', () => {
  it('everyone sees an open channel; a private one is for staff and its roles', () => {
    expect(canSee(channel('TEXT'), member())).toBe(true);
    const reps = channel('TEXT', true, ['rep']);
    expect(canSee(reps, member())).toBe(false);
    expect(canSee(reps, member('MEMBER', ['rep']))).toBe(true);
    expect(canSee(reps, member('MOD'))).toBe(true);
    expect(canSee(reps, member('OWNER'))).toBe(true);
  });
  it('announcements take posts from staff and chosen roles; voice rooms take none', () => {
    const news = channel('ANNOUNCE', false, [], ['rep']);
    expect(canPost(news, member())).toBe(false);
    expect(canPost(news, member('MEMBER', ['rep']))).toBe(true);
    expect(canPost(news, member('MOD'))).toBe(true);
    expect(canPost(channel('VOICE'), member('OWNER'))).toBe(false);
    expect(canPost(channel('TEXT'), member())).toBe(true);
    // Can't post where you can't see.
    expect(canPost(channel('TEXT', true, ['x']), member())).toBe(false);
  });
});

describe('reading what the database holds', () => {
  it('keeps strings, drops repeats and junk', () => {
    expect(parseIds('["a","b","a",3]')).toEqual(['a', 'b']);
    expect(parseIds('{"a":1}')).toEqual([]);
    expect(parseIds('not json')).toEqual([]);
    expect(parseIds(null)).toEqual([]);
  });
  it('keeps channel rules to roles that still exist', () => {
    expect(parseRules('{"view":["a","gone"],"post":["b"]}', new Set(['a', 'b']))).toEqual({ view: ['a'], post: ['b'] });
    expect(parseRules('broken')).toEqual({ view: [], post: [] });
    expect(parseRules(null)).toEqual({ view: [], post: [] });
  });
});

describe('names and lists', () => {
  it('colours a name by the first role in the community’s order', () => {
    const roles = [{ id: 'a', color: '#111', position: 2 }, { id: 'b', color: '#222', position: 0 }];
    expect(nameColor(['a', 'b'], roles)).toBe('#222');
    expect(nameColor(['a'], roles)).toBe('#111');
    expect(nameColor([], roles)).toBeNull();
  });
  it('lists channels without a category first, then each category in order of first use', () => {
    const out = groupChannels([
      { id: 1, category: 'Study' }, { id: 2, category: null }, { id: 3, category: 'Fun' }, { id: 4, category: 'study' }, { id: 5, category: null },
    ]);
    expect(out.map((g) => [g.category, g.channels.map((c) => c.id)])).toEqual([[null, [2, 5]], ['Study', [1, 4]], ['Fun', [3]]]);
  });
});
