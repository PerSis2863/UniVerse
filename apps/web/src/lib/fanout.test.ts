import { describe, expect, it } from 'vitest';
import { FANOUT, fanOut, planFanout, readRelay, type HubStub } from './fanout';

/**
 * A pretend set of live hubs that enforces Workers Free's rule: one request (the sender, or a hub
 * handling a relay) may make at most 50 subrequests. A relay runs as a new request with its own
 * allowance, like a Durable Object request.
 */
function world(people: string[], online: Set<string>, broken = new Set<string>()) {
  const got = new Map<string, number>();
  let worst = 0;
  let requests = 0;
  const hubOf = (budget: { used: number }) => (id: string): HubStub => ({
    async fetch(url, init) {
      budget.used++;
      worst = Math.max(worst, budget.used);
      if (budget.used > 50) throw new Error('Too many subrequests');
      requests++;
      if (broken.has(id)) throw new Error('unreachable');
      if (!people.includes(id)) throw new Error(`no such hub ${id}`);
      got.set(id, (got.get(id) ?? 0) + 1);
      if (url.endsWith('/publish')) return Response.json({ sockets: online.has(id) ? 1 : 0 });
      const relay = readRelay(JSON.parse(String(init?.body)))!;
      const rest = await fanOut(relay.ids, relay.message, hubOf({ used: 0 }));
      return Response.json({ here: online.has(id), online: [...rest] });
    },
  });
  return { got, hubOf, worst: () => worst, requests: () => requests };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${i}`);

describe('live updates to many people (fan-out)', () => {
  it('plans direct sends for small lists and relays for big ones, everyone once', () => {
    expect(planFanout(ids(40))).toEqual({ direct: ids(40), relays: [] });
    for (const n of [41, 100, 1601, 5000]) {
      const { direct, relays } = planFanout(ids(n));
      expect(direct.length + relays.length).toBeLessThanOrEqual(FANOUT);
      expect([...direct, ...relays.flat()].sort()).toEqual(ids(n).sort());
    }
    expect(planFanout(['a', 'a', 'b'])).toEqual({ direct: ['a', 'b'], relays: [] });
  });

  it('a 100-member group: everyone reached exactly once, never over 50 sends per request', async () => {
    const people = ids(100);
    const on = new Set(people.filter((_, i) => i % 2 === 0));
    const w = world(people, on);
    const online = await fanOut(people, '{"type":"chat"}', w.hubOf({ used: 0 }));
    expect(w.got.size).toBe(100);
    expect([...w.got.values()].every((n) => n === 1)).toBe(true);
    expect(online).toEqual(on);
    expect(w.worst()).toBeLessThanOrEqual(50);
    expect(w.requests()).toBe(100); // one hub request per person, as before
  });

  it('5,000 people: still everyone, still within the limit (a few hops)', async () => {
    const people = ids(5000);
    const w = world(people, new Set(['u4999', 'u0', 'u2500']));
    const online = await fanOut(people, '{"type":"notification"}', w.hubOf({ used: 0 }));
    expect(w.got.size).toBe(5000);
    expect(w.worst()).toBeLessThanOrEqual(50);
    expect(online).toEqual(new Set(['u4999', 'u0', 'u2500']));
  });

  it('one unreachable hub only misses that person (or, for a relay, its slice)', async () => {
    const people = ids(30);
    const w = world(people, new Set(people), new Set(['u7']));
    const online = await fanOut(people, '{}', w.hubOf({ used: 0 }));
    expect(online.size).toBe(29);
    expect(online.has('u7')).toBe(false);
  });

  it('reads relay bodies safely', () => {
    expect(readRelay({ ids: ['a', 2, '', 'b'], message: '{}' })).toEqual({ ids: ['a', 'b'], message: '{}' });
    expect(readRelay({ ids: 'a', message: '{}' })).toBeNull();
    expect(readRelay({ ids: [], message: 'x'.repeat(70_000) })).toBeNull();
    expect(readRelay(null)).toBeNull();
  });
});
