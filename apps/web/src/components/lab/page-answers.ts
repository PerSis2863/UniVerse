import { answer } from '@/lib/lab/wait';
import { engineView, heldLines, serialLink } from './serial-link';

// M521: the page's side of Hyperion's waiting (src/lib/lab/wait.ts). An engine on a cross-origin-isolated page sends
// its slot of shared memory once ({ channel }) and then questions ({ ask }); each is answered in that slot, which
// wakes the engine. Only the newest question is answered (an older one's engine stopped waiting for it).

export interface Ask { kind: string; body: unknown; ms: number; n: number }
type Answerer = (body: unknown, ms: number) => Promise<unknown>;
const answerers: Record<string, Answerer> = {};
/** Adds what a kind of question is answered with (devices, channels…). */
export const answers = (kind: string, fn: Answerer) => { answerers[kind] = fn; };

const slots = new WeakMap<Worker, { sab: SharedArrayBuffer; latest: number }>();
export const asksOf = (w: Worker | null) => !!w && slots.has(w);
export function onChannel(w: Worker, sab: SharedArrayBuffer) { slots.set(w, { sab, latest: 0 }); }
export function onAsk(w: Worker, a: Ask) {
  const s = slots.get(w);
  if (!s) return;
  s.latest = a.n;
  const fn = answerers[a.kind];
  const reply = (v: { v?: unknown; error?: string }) => { if (s.latest === a.n) answer(s.sab, { n: a.n, ...v }); };
  if (!fn) { reply({ error: `Nothing here answers “${a.kind}”.` }); return; }
  fn(a.body, a.ms).then((v) => reply({ v }), (e: unknown) => reply({ error: e instanceof Error ? e.message : String(e) }));
}

/** The next event from the serial link that `ok` accepts, or after `ms`. */
const next = (ok: (e: { lines?: string[]; state?: unknown }) => boolean, ms: number) => new Promise<void>((done) => {
  const stop = serialLink.subscribe((e) => { if (ok(e)) finish(); });
  const timer = setTimeout(() => finish(), ms);
  function finish() { clearTimeout(timer); stop(); done(); }
});
answers('serial', async (body, ms) => {
  const want = (body as { want?: string }).want;
  if (want === 'line' && !heldLines.length && serialLink.state.open) await next((e) => !!e.lines?.length, ms);
  if (want === 'analog' && serialLink.state.open) await next((e) => !!e.state, Math.min(ms, 300));
  return { lines: heldLines.splice(0), state: engineView(serialLink.state) };
});

