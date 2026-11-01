import { planesFrom, type AirTraffic } from '@/lib/aircraft';

// GET /trace/aircraft (M69): live air traffic from the OpenSky Network (free, no key, non-commercial
// use, about 100 calls a day without an account). Kept for 15 minutes, in this server's memory and in
// Cloudflare's cache (shared by every server in a place), so the whole site asks at most ~96 times a
// day; the browser moves the planes along their course in between. Nothing about who is looking is
// sent; the answer is the same for everyone. The owner can switch it off (console → switches).

const URL = 'https://opensky-network.org/api/states/all';
const KEEP = 15 * 60_000, FAILED = 2 * 60_000;
const CACHE_KEY = 'https://cache.universe.internal/aircraft-v1';
let mem: { at: number; keep: number; data: AirTraffic } | null = null;

type CacheLike = { match(k: string): Promise<Response | undefined>; put(k: string, r: Response): Promise<void> };
const edge = () => (globalThis as unknown as { caches?: { default?: CacheLike } }).caches?.default ?? null;

export async function aircraft(): Promise<AirTraffic> {
  if (mem && Date.now() - mem.at < mem.keep) return mem.data;
  const cache = edge();
  const hit = await cache?.match(CACHE_KEY).catch(() => undefined);
  if (hit) { const data = (await hit.json()) as AirTraffic; mem = { at: Date.now(), keep: KEEP, data }; return data; }
  try {
    const res = await fetch(URL, { headers: { Accept: 'application/json', 'User-Agent': 'UniVerse Impact (Trace live globe)' }, signal: AbortSignal.timeout(9000) });
    if (!res.ok) throw new Error(`OpenSky ${res.status}`);
    const j = (await res.json()) as { time?: number; states?: unknown[][] };
    const data: AirTraffic = { at: new Date((j.time ?? Date.now() / 1000) * 1000).toISOString(), planes: planesFrom(j.states), source: 'OpenSky Network' };
    mem = { at: Date.now(), keep: KEEP, data };
    await cache?.put(CACHE_KEY, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${KEEP / 1000}` } })).catch(() => {});
    return data;
  } catch (e) {
    console.error('Air traffic unavailable:', (e as Error).message);
    const data: AirTraffic = { at: null, planes: mem?.data.planes ?? [], source: 'OpenSky Network', note: 'The air traffic feed did not answer; trying again in a few minutes.' };
    mem = { at: Date.now(), keep: FAILED, data };
    return data;
  }
}
