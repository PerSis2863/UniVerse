// Live updates to many people at once. Each signed-in person has their own live hub (a Durable
// Object, cloudflare/worker.ts RealtimeHub), and telling a hub something is one subrequest. Workers
// Free allows 50 subrequests per request, so a message in a 100-member group used to reach only
// about the first 50 members live; the rest saw it when they came back to the app.
//
// Now a sender tells at most FANOUT hubs itself. For a bigger list it hands each hub a slice of the
// list ("relay"): that hub tells its own tabs, then the rest of its slice, with its own subrequest
// allowance (each Durable Object request has its own). Slices bigger than FANOUT relay again, so any
// number of people is reached in a few hops. The number of hub requests stays one per person.
//
// No imports: the Worker uses this file too.

/** The most hubs one request tells directly (under Workers Free's 50 subrequests, with room to spare). */
export const FANOUT = 40;

export interface HubStub {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

/** Who to tell directly, and which slices to hand on (each slice's first person relays it). */
export function planFanout(ids: string[], width = FANOUT): { direct: string[]; relays: string[][] } {
  const all = [...new Set(ids)];
  if (all.length <= width) return { direct: all, relays: [] };
  const size = Math.ceil(all.length / width);
  const direct: string[] = [];
  const relays: string[][] = [];
  for (let i = 0; i < all.length; i += size) {
    const slice = all.slice(i, i + size);
    if (slice.length === 1) direct.push(slice[0]);
    else relays.push(slice);
  }
  return { direct, relays };
}

/**
 * Tells every listed person's hub `message` (the event's JSON). Resolves to those with UniVerse open
 * right now; never rejects (a hub that can't be reached is just not counted as online).
 * `hubOf` gives a person's hub stub.
 */
export async function fanOut(ids: string[], message: string, hubOf: (id: string) => HubStub, width = FANOUT): Promise<Set<string>> {
  const { direct, relays } = planFanout(ids, width);
  const online = new Set<string>();
  await Promise.all([
    ...direct.map(async (id) => {
      try {
        const res = await hubOf(id).fetch('https://realtime/publish', { method: 'POST', body: message });
        if (res.ok && ((await res.json()) as { sockets?: number }).sockets) online.add(id);
      } catch {
        /* not reached: counted as away */
      }
    }),
    ...relays.map(async ([first, ...rest]) => {
      try {
        const res = await hubOf(first).fetch('https://realtime/relay', { method: 'POST', body: JSON.stringify({ ids: rest, message }) });
        if (!res.ok) return;
        const r = (await res.json()) as { here?: boolean; online?: unknown };
        if (r.here) online.add(first);
        if (Array.isArray(r.online)) for (const id of r.online) if (typeof id === 'string') online.add(id);
      } catch {
        /* not reached */
      }
    }),
  ]);
  return online;
}

/** Reads a relay request's body: the rest of the slice (strings only, at most `max`) and the message. */
export function readRelay(body: unknown, max = 20_000): { ids: string[]; message: string } | null {
  const b = body as { ids?: unknown; message?: unknown } | null;
  if (!b || !Array.isArray(b.ids) || typeof b.message !== 'string' || b.message.length > 64 * 1024) return null;
  return { ids: b.ids.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64).slice(0, max), message: b.message };
}
