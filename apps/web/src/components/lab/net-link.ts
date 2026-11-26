import { answers } from './page-answers';

// M560: the page's side of Hyperion's web functions (src/lib/lab/net-lab.ts). Addresses on this site are fetched
// here, without cookies. Other sites go through the sealed web link (public/sandbox/net.html: an opaque origin with
// nothing of the site's), and only after the person allows that site, once per visit: a script shared by link can't
// send anyone's files or variables anywhere without them saying yes. MQTT brokers are asked about the same way.

const LINK = '/sandbox/net.html';
const allowed = new Set<string>();
let frame: HTMLIFrameElement | null = null;
let ready: Promise<void> | null = null;
let seq = 0;
const waiting = new Map<number, (m: Record<string, unknown>) => void>();
/** Messages from brokers, per link, until the script reads them. */
const inbox = new Map<number, { topic: string; payload: Uint8Array; at: number }[]>();
const closed = new Set<number>();
const wakers = new Map<number, () => void>();

function listen(ev: MessageEvent) {
  if (!frame || ev.source !== frame.contentWindow) return;
  const m = (ev.data ?? {}) as Record<string, unknown>;
  if (m.ready === true) { onReady?.(); return; }
  if (typeof m.mqtt === 'number') {
    if (m.closed === true) { closed.add(m.mqtt); wakers.get(m.mqtt)?.(); }
    else if (typeof m.topic === 'string' && m.payload instanceof Uint8Array) {
      const box = inbox.get(m.mqtt) ?? [];
      box.push({ topic: m.topic.slice(0, 500), payload: m.payload.slice(0, 1_000_000), at: Number(m.at) || Date.now() });
      if (box.length > 10_000) box.splice(0, box.length - 10_000);
      inbox.set(m.mqtt, box);
      wakers.get(m.mqtt)?.();
    }
    return;
  }
  if (typeof m.id === 'number') { waiting.get(m.id)?.(m); waiting.delete(m.id); }
}
let onReady: (() => void) | null = null;
function open(): Promise<void> {
  if (ready && frame) return ready;
  window.addEventListener('message', listen);
  const f = document.createElement('iframe');
  f.src = LINK;
  f.setAttribute('sandbox', 'allow-scripts');
  f.title = 'Hyperion’s sealed web link';
  f.setAttribute('aria-hidden', 'true');
  f.tabIndex = -1;
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;pointer-events:none';
  ready = new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(() => { ready = null; reject(new Error('the web link didn’t start')); }, 15_000);
    onReady = () => { clearTimeout(t); resolve(); };
  });
  document.body.appendChild(f);
  frame = f;
  return ready;
}
async function viaLink(msg: Record<string, unknown>, ms: number): Promise<Record<string, unknown>> {
  await open();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => { waiting.delete(id); reject(new Error('it took too long')); }, ms);
    waiting.set(id, (m) => { clearTimeout(t); if (typeof m.error === 'string') reject(new Error(m.error.slice(0, 300))); else resolve(m); });
    frame?.contentWindow?.postMessage({ ...msg, id }, '*');
  });
}

/** Asks the person once per visit before a script talks to another site. */
function mayReach(url: URL, what: string) {
  const host = url.host.toLowerCase();
  if (allowed.has(host)) return;
  if (!window.confirm(`This script wants to ${what} ${host}.\n\nAnything the script sends goes to that site. Allow it for this visit?`)) throw new Error(`you didn’t allow ${host}`);
  allowed.add(host);
}

async function pixelsOf(bytes: Uint8Array, type: string) {
  if (!/^image\/(png|jpeg|gif|webp|bmp|avif)/.test(type)) return undefined;
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type }));
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0);
    return { w: bmp.width, h: bmp.height, rgba: new Uint8Array(g.getImageData(0, 0, bmp.width, bmp.height).data.buffer) };
  } catch { return undefined; }
}

answers('web', async (body, ms) => {
  const b = body as { url: string; method?: string; headers?: Record<string, string>; body?: string | Uint8Array; timeout?: number };
  let url: URL;
  try { url = new URL(b.url, location.href); } catch { throw new Error(`“${b.url}” isn’t a web address`); }
  const timeout = Math.min(b.timeout ?? 15_000, ms - 500);
  let r: { status: number; statusText: string; type: string; bytes: Uint8Array };
  if (url.origin === location.origin) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, { method: b.method ?? 'GET', headers: b.headers, body: b.body as BodyInit | undefined, credentials: 'omit', signal: ctl.signal });
      r = { status: res.status, statusText: res.statusText, type: res.headers.get('content-type') ?? '', bytes: new Uint8Array(await res.arrayBuffer()) };
    } finally { clearTimeout(t); }
  } else {
    if (url.protocol !== 'https:') throw new Error('only https addresses can be reached from the browser');
    mayReach(url, (b.method ?? 'GET') === 'GET' ? 'read from' : 'send data to');
    const m = await viaLink({ kind: 'web', url: url.href, method: b.method, headers: b.headers, body: b.body, timeout }, timeout + 1000);
    r = { status: Number(m.status), statusText: String(m.statusText ?? ''), type: String(m.type ?? ''), bytes: m.bytes as Uint8Array };
  }
  return { ...r, pixels: await pixelsOf(r.bytes, r.type) };
});

let conns = 0;
answers('mqtt', async (body, ms) => {
  const b = body as { op: string; conn?: number; url?: string; clientId?: string; user?: string; pass?: string; topic?: string; payload?: Uint8Array; retain?: boolean; wait?: boolean };
  if (b.op === 'open') {
    let url: URL;
    try { url = new URL(b.url!); } catch { throw new Error(`“${b.url}” isn’t a broker address`); }
    if (url.protocol !== 'wss:') throw new Error('the browser reaches brokers over secure WebSockets only: an address like wss://broker.example.com:8884/mqtt');
    mayReach(url, 'connect to the broker');
    const conn = ++conns;
    await viaLink({ kind: 'mqtt-open', conn, url: url.href, clientId: b.clientId, user: b.user, pass: b.pass }, ms - 500);
    inbox.set(conn, []);
    return { conn };
  }
  const conn = b.conn!;
  if (b.op === 'read') {
    const box = inbox.get(conn) ?? [];
    if (!box.length && b.wait && !closed.has(conn)) await new Promise<void>((done) => {
      const t = setTimeout(finish, Math.max(0, ms - 500));
      function finish() { clearTimeout(t); wakers.delete(conn); done(); }
      wakers.set(conn, finish);
    });
    return { messages: box.splice(0), closed: closed.has(conn) };
  }
  if (closed.has(conn)) throw new Error('the broker closed the link');
  await viaLink({ kind: 'mqtt', conn, op: b.op, topic: b.topic, payload: b.payload ? Array.from(b.payload) : [], retain: b.retain }, ms - 500);
  if (b.op === 'close') { inbox.delete(conn); closed.add(conn); }
  return true;
});

// Game controllers and joysticks (the Gamepad API): what the browser sees right now.
answers('gamepad', async () => {
  const pads = (navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p);
  return pads.map((p) => ({ index: p.index, id: p.id, axes: [...p.axes], buttons: p.buttons.map((x) => x.value), pressed: p.buttons.map((x) => x.pressed) }));
});
