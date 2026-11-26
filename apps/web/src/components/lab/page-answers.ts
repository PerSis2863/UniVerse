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

// M522: a channel's newest readings (the page is signed in; the engine isn't).
answers('iot', async (body) => {
  const { channel, n } = body as { channel: string; n: number };
  const { api } = await import('@/lib/api');
  const all = (await api.get<{ channels: { id: string; name: string; fields: string[] }[] }>('/iot/channels')).data.channels;
  const c = all.find((x) => x.id === channel) ?? all.find((x) => x.name.toLowerCase() === channel.toLowerCase());
  if (!c) throw new Error(`There’s no channel “${channel}”: yours are ${all.map((x) => x.name).join(', ') || 'none yet (make one in Signals → IoT)'}.`);
  const r = (await api.get<{ entries: { at: string; values: (number | null)[] }[] }>(`/iot/channels/${c.id}/entries?limit=${n}`)).data;
  return { fields: c.fields, entries: r.entries };
});

// M526: Bluetooth and USB devices (wireless-link.ts).
answers('wireless', async (body, ms) => {
  const b = body as { op: string; service?: string; char?: string; fresh?: boolean; bytes?: number[]; n?: number };
  const { wirelessLink, fullUuid } = await import('./wireless-link');
  const st = wirelessLink.state;
  if (b.op === 'view') return { ble: { open: st.ble.open, name: st.ble.name, chars: st.ble.chars.map(({ service, uuid, name, props }) => ({ service, uuid, name, props })) }, usb: st.usb };
  if (b.op === 'find') {
    if (!st.ble.open) throw new Error('The Bluetooth device isn’t connected any more.');
    const c = st.ble.chars.find((x) => x.service === fullUuid(b.service!) && x.uuid === fullUuid(b.char!));
    if (!c) throw new Error(`No characteristic ${b.char} in service ${b.service}: see ble(…).Characteristics.`);
    return { service: c.service, uuid: c.uuid, name: c.name, props: c.props };
  }
  if (b.op === 'read') return wirelessLink.readBle(b.service!, b.char!, !!b.fresh, Math.max(100, ms - 500));
  if (b.op === 'write') { await wirelessLink.writeBle(b.service!, b.char!, b.bytes ?? []); return true; }
  if (b.op === 'usbwrite') { await wirelessLink.writeUsb(b.bytes ?? []); return true; }
  if (b.op === 'usbread') return wirelessLink.readUsb(b.n ?? 64, Math.max(100, ms - 500));
  throw new Error('Unknown device question.');
});

// M555: the webcam. The list of cameras (names appear once the person has allowed the camera), and a picture: the
// stream is opened once per camera and kept for the visit (the browser shows its camera light), a frame drawn to a
// canvas at the size asked and sent as RGB bytes.
const streams = new Map<string, MediaStream>();
answers('camera', async (body) => {
  const b = body as { op: string; name?: string; w?: number; h?: number };
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no camera access.');
  const cams = async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  let list = await cams();
  if (b.op === 'list') {
    // Names are hidden until the camera is allowed once.
    if (list.length && list.every((d) => !d.label)) { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach((t) => t.stop()); list = await cams(); }
    return list.map((d, i) => d.label || `Camera ${i + 1}`);
  }
  if (b.op !== 'snap') throw new Error('Unknown camera question.');
  const dev = list.find((d, i) => (d.label || `Camera ${i + 1}`) === b.name) ?? list[0];
  const key = dev?.deviceId ?? 'default', w = Math.min(1920, b.w ?? 640), h = Math.min(1080, b.h ?? 480);
  let stream = streams.get(key);
  if (!stream || stream.getVideoTracks().every((t) => t.readyState === 'ended')) {
    stream = await navigator.mediaDevices.getUserMedia({ video: { ...(dev?.deviceId ? { deviceId: { exact: dev.deviceId } } : {}), width: { ideal: w }, height: { ideal: h } } });
    streams.set(key, stream);
  }
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.srcObject = stream;
  await video.play();
  // Give the camera a moment to settle its exposure on the first picture.
  await new Promise((r) => setTimeout(r, streams.size === 1 && !video.currentTime ? 400 : 50));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(video, 0, 0, w, h);
  video.pause(); video.srcObject = null;
  const px = g.getImageData(0, 0, w, h).data, rgb = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < px.length; i += 4, j += 3) { rgb[j] = px[i]; rgb[j + 1] = px[i + 1]; rgb[j + 2] = px[i + 2]; }
  return { w, h, rgb };
});
