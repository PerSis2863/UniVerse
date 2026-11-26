import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { waits } from './wait';
import { FileStore, fileBytes } from './files';
import { Graphics } from './plot';
import './net-lab';

// M560: the web functions against a stand-in page (the real one is src/components/lab/net-link.ts).
const enc = new TextEncoder();
function run(code: string) {
  const lab = new Lab({ out: () => {}, graphics: new Graphics(), files: new FileStore() });
  lab.run(code);
  return { lab, get: (n: string) => lab.vars.get(n) };
}
describe('Hyperion on the web', () => {
  it('webread decodes JSON and adds the query; webwrite sends a struct as JSON; websave keeps the bytes', () => {
    const sent: { url: string; method: string; body?: unknown; headers: Record<string, string> }[] = [];
    waits.page = (kind, body) => {
      if (kind !== 'web') throw new Error(kind);
      const b = body as { url: string; method: string; body?: unknown; headers: Record<string, string> };
      sent.push(b);
      if (b.url.includes('pic')) return { status: 200, statusText: 'OK', type: 'image/png', bytes: new Uint8Array([1, 2]), pixels: { w: 2, h: 1, rgba: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]) } };
      return { status: 200, statusText: 'OK', type: 'application/json', bytes: enc.encode('{"temp": 21.5, "tags": ["a", "b"]}') };
    };
    const { lab, get } = run(`d = webread('https://api.example.com/w', 'city', 'Pune', weboptions('KeyName', 'X-Key', 'KeyValue', 'k1'));
t = d.temp; r = webwrite('https://api.example.com/p', struct('x', 3)); websave('w.json', 'https://api.example.com/w'); im = webread('https://api.example.com/pic');`);
    expect(sent[0].url).toBe('https://api.example.com/w?city=Pune');
    expect(sent[0].headers['X-Key']).toBe('k1');
    expect(sent[1].method).toBe('POST');
    expect(JSON.parse(sent[1].body as string)).toEqual({ x: 3 });
    expect(get('t')).toMatchObject({ d: Float64Array.from([21.5]) });
    expect(new TextDecoder().decode(fileBytes(lab, 'w.json'))).toContain('temp');
    const im = get('im') as { r: number; c: number; p: number; cls: string; d: Float64Array };
    expect([im.r, im.c, im.p, im.cls]).toEqual([1, 2, 3, 'uint8']);
    expect([...im.d]).toEqual([255, 0, 0, 0, 0, 255]);
    waits.page = null;
  });
  it('MQTT: connect, subscribe, publish and read; a controller read gives axes, buttons and the hat', () => {
    const asked: Record<string, unknown>[] = [];
    waits.page = (kind, body) => {
      const b = body as Record<string, unknown>;
      asked.push({ kind, ...b });
      if (kind === 'gamepad') return [{ index: 0, id: 'Pad', axes: [0.5, -1], buttons: Array(16).fill(0), pressed: Array.from({ length: 16 }, (_, i) => i === 0 || i === 12 || i === 15) }];
      if (b.op === 'open') return { conn: 7 };
      if (b.op === 'read') return { messages: [{ topic: 'room/t', payload: enc.encode('22'), at: 1000 }], closed: false };
      return true;
    };
    const { get } = run(`mq = mqttclient('test.example.org', 'Port', 8884); subscribe(mq, 'room/#'); write(mq, 'room/set', 'on'); m = read(mq); v = str2double(m.Data);
joy = vrjoystick(1); [ax, bt, pov] = read(joy); a2 = axis(joy, 2);`);
    expect(asked[0]).toMatchObject({ op: 'open', url: 'wss://test.example.org:8884/mqtt' });
    expect(asked.find((x) => x.op === 'publish')).toMatchObject({ topic: 'room/set' });
    expect(get('v')).toMatchObject({ d: Float64Array.from([22]) });
    expect([...(get('ax') as { d: Float64Array }).d]).toEqual([0.5, -1]);
    expect((get('pov') as { d: Float64Array }).d[0]).toBe(45);
    expect((get('a2') as { d: Float64Array }).d[0]).toBe(-1);
    waits.page = null;
  });
});
