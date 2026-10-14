import { generateKeyPairSync, sign } from 'node:crypto';
import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { encodeQr } from './qr';
import { FRAME_CHARS, FrameCollector, MAX_RELAY_BYTES, checkRelay, fromBase45, packRelay, toBase45, toFrames, unpackRelay, type RelayItem } from './qr-relay';

/** Draws a QR matrix as an RGBA picture (4 px a square, a 4-square quiet zone) and reads it back with jsQR. */
function readBack(text: string): string | null {
  const m = encodeQr(text);
  const px = 4, quiet = 4, side = (m.length + quiet * 2) * px;
  const rgba = new Uint8ClampedArray(side * side * 4).fill(255);
  m.forEach((row, y) => row.forEach((dark, x) => {
    if (!dark) return;
    for (let dy = 0; dy < px; dy++) for (let dx = 0; dx < px; dx++) {
      const i = (((y + quiet) * px + dy) * side + (x + quiet) * px + dx) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
    }
  }));
  return jsQR(rgba, side, side, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

const item = (over: Partial<RelayItem> = {}): RelayItem => ({
  v: 1, id: 'a1', kind: 'NOTE', course: { id: 'c1', code: 'CS101', name: 'Intro' }, from: 'Ms Rao', title: 'Homework', text: 'Read chapter 4 — and bring your notebook. नमस्ते', at: '2026-10-14T09:00:00.000Z', ...over,
});

describe('offline classroom relay (D17)', () => {
  it('Base45 round-trips every byte value and odd lengths (RFC 9285 examples)', () => {
    expect(toBase45(new TextEncoder().encode('AB'))).toBe('BB8');
    expect(toBase45(new TextEncoder().encode('Hello!!'))).toBe('%69 VD92EX0');
    const all = Uint8Array.from({ length: 257 }, (_, i) => i % 256);
    expect([...fromBase45(toBase45(all))]).toEqual([...all]);
    expect(() => fromBase45('GGW')).toThrow(); // 65535 + 1
    expect(() => fromBase45('a')).toThrow();
  });

  it('the QR encoder writes alphanumeric codes up to version 15 that a reader reads back', () => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
    for (const n of [17 + FRAME_CHARS.small, 17 + FRAME_CHARS.normal, 17 + FRAME_CHARS.large]) {
      const text = 'UV1:AB12:1/9:' + Array.from({ length: n - 13 }, (_, i) => chars[(i * 7) % chars.length]).join('');
      expect(encodeQr(text).length).toBeLessThanOrEqual(77); // version 15 at most
      expect(readBack(text)).toBe(text);
    }
    // Byte mode still works (links, mixed case) and the biggest version too
    expect(readBack('https://universeimpact.com/verify/abc?x=1')).toBe('https://universeimpact.com/verify/abc?x=1');
    const long = 'x'.repeat(400);
    expect(readBack(long)).toBe(long);
    expect(() => encodeQr('x'.repeat(500))).toThrow();
  });

  it('packs, cuts into frames and comes back together in any order, signed', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const canonical = JSON.stringify(item());
    const signature = sign(null, Buffer.from(canonical), privateKey).toString('base64url');
    const bytes = packRelay({ canonical, signature, keyId: '0123456789abcdef' });
    const frames = toFrames(bytes, 'K3F9', 'small');
    for (const f of frames) expect(readBack(f)).toBe(f);
    const c = new FrameCollector();
    const order = frames.map((_, i) => i).reverse();
    let last;
    for (const i of [...order, order[0]]) last = c.add(frames[i]);
    expect(last).toEqual({ state: 'done', have: frames.length, total: frames.length });
    const back = unpackRelay(c.bytes());
    expect(back.item).toEqual(item());
    expect(back.keyId).toBe('0123456789abcdef');
    const x = (publicKey.export({ format: 'jwk' }) as { x: string }).x;
    return Promise.all([
      expect(checkRelay(back.canonical, back.signature, back.keyId, [{ kid: '0123456789abcdef', x }])).resolves.toBe('ok'),
      expect(checkRelay(back.canonical.replace('Homework', 'Homewark'), back.signature, back.keyId, [{ kid: '0123456789abcdef', x }])).resolves.toBe('bad'),
      expect(checkRelay(back.canonical, back.signature, back.keyId, [{ kid: 'ffffffffffffffff', x }])).resolves.toBe('bad'),
      expect(checkRelay(back.canonical, back.signature, back.keyId, [])).resolves.toBe('unchecked'),
    ]);
  });

  it('unsigned items still travel, and say so', async () => {
    const canonical = JSON.stringify(item({ kind: 'ANNOUNCEMENT' }));
    const back = unpackRelay(packRelay({ canonical, signature: null, keyId: null }));
    expect(back.item.kind).toBe('ANNOUNCEMENT');
    expect(await checkRelay(back.canonical, back.signature, back.keyId, [])).toBe('unsigned');
    expect(() => unpackRelay(new Uint8Array([2, 0, 1]))).toThrow();
  });

  it('ignores stray frames and switches to a new loop only when it is seen twice', () => {
    const a = toFrames(packRelay({ canonical: JSON.stringify(item()), signature: null, keyId: null }), 'AAAA', 'small');
    const b = toFrames(packRelay({ canonical: JSON.stringify(item({ title: 'Other', text: 'x'.repeat(600) })), signature: null, keyId: null }), 'BBBB', 'small');
    const c = new FrameCollector();
    expect(c.add('https://example.com').state).toBe('ignored');
    expect(c.add('UV1:AAAA:3/2:XX').state).toBe('ignored');
    c.add(a[0]);
    expect(c.add(b[0]).state).toBe('ignored'); // one stray frame
    expect(c.add(a[0]).have).toBe(1);
    c.add(b[0]);
    expect(c.add(b[1])).toMatchObject({ state: b.length === 2 ? 'done' : 'progress', have: 2, total: b.length }); // switched
    expect(c.missing()).toEqual(Array.from({ length: b.length - 2 }, (_, i) => i + 3));
  });

  it('a long quiz fits the size limit compressed', () => {
    const quiz = { id: 'q', title: 'Week 5', description: null, dueDate: null, timeLimit: 20, questions: Array.from({ length: 40 }, (_, i) => ({ id: `qq${i}`, question: `Which of these sorting algorithms is stable when the input has ${i} repeated keys?`, options: ['Merge sort', 'Quick sort', 'Heap sort', 'Selection sort'] })) };
    const bytes = packRelay({ canonical: JSON.stringify(item({ kind: 'QUIZ', text: undefined, quiz })), signature: null, keyId: null });
    expect(bytes.length).toBeLessThan(MAX_RELAY_BYTES);
    expect(toFrames(bytes, 'QQQQ', 'normal').length).toBeLessThanOrEqual(30);
  });
});
