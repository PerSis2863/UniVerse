// Stage 5 · D17, offline classroom relay: a short item (a note, an announcement or a quiz without
// pictures) goes from the teacher's screen to students' phones as a loop of QR codes, with no
// internet on the phones. Prepared online on the server (src/server/qr-relay.ts), which signs it
// with the platform's Ed25519 key, so a phone can check it came from the teacher.
//
// What travels: [format 1][flags][key id: 8 bytes][signature: 64 bytes][the item's JSON, deflated],
// written in Base45 (RFC 9285) so each code uses QR's compact alphanumeric mode, and cut into
// frames "UV1:<id>:<n>/<total>:<data>". The loop repeats, so a missed frame comes round again.
import { deflateSync, inflateSync } from 'fflate';
import type { PackQuiz } from '@/lib/offline-packs';

export type RelayKind = 'NOTE' | 'ANNOUNCEMENT' | 'QUIZ';
export interface RelayItem {
  v: 1;
  /** The item's own id (a note's is made up when it's prepared). */
  id: string;
  kind: RelayKind;
  course: { id: string; code: string; name: string };
  /** Who sent it: the course's teacher. */
  from: string;
  title: string;
  /** A note's or announcement's text. */
  text?: string;
  /** A quiz's questions and options, never the answers. */
  quiz?: PackQuiz;
  /** When it was prepared (ISO). */
  at: string;
}
/** What the server hands the teacher's device: the exact JSON it signed, and the signature. */
export interface PreparedRelay { canonical: string; signature: string | null; keyId: string | null }

/** Most a code loop may carry, after compression (a long quiz or a few pages of text). */
export const MAX_RELAY_BYTES = 8 * 1024;
/** Data characters per frame, by code size: version 7, 11 and 15 QR codes (45, 61, 77 squares a side). */
export const FRAME_CHARS = { small: 180, normal: 330, large: 570 } as const;
export type FrameSize = keyof typeof FRAME_CHARS;

// ── Base45 (RFC 9285): 2 bytes → 3 characters of QR's alphanumeric set ──
const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

export function toBase45(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const n = bytes[i] * 256 + bytes[i + 1];
      out += B45[n % 45] + B45[Math.floor(n / 45) % 45] + B45[Math.floor(n / 2025)];
    } else {
      const n = bytes[i];
      out += B45[n % 45] + B45[Math.floor(n / 45)];
    }
  }
  return out;
}

export function fromBase45(text: string): Uint8Array {
  if (text.length % 3 === 1) throw new Error('Not Base45');
  const out: number[] = [];
  const val = (c: string) => {
    const v = B45.indexOf(c);
    if (v < 0) throw new Error('Not Base45');
    return v;
  };
  for (let i = 0; i < text.length; i += 3) {
    if (i + 2 < text.length) {
      const n = val(text[i]) + val(text[i + 1]) * 45 + val(text[i + 2]) * 2025;
      if (n > 0xffff) throw new Error('Not Base45');
      out.push(n >> 8, n & 0xff);
    } else {
      const n = val(text[i]) + val(text[i + 1]) * 45;
      if (n > 0xff) throw new Error('Not Base45');
      out.push(n);
    }
  }
  return new Uint8Array(out);
}

const hexBytes = (hex: string) => new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));
const bytesHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
export const b64urlBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

/** The bytes a code loop carries: header, signature (when signed) and the item's JSON, deflated. */
export function packRelay(p: PreparedRelay): Uint8Array {
  const body = deflateSync(new TextEncoder().encode(p.canonical), { level: 9 });
  const signed = !!(p.signature && p.keyId && /^[0-9a-f]{16}$/.test(p.keyId));
  const sig = signed ? b64urlBytes(p.signature!) : null;
  if (sig && sig.length !== 64) throw new Error('Bad signature');
  const out = new Uint8Array(2 + (signed ? 72 : 0) + body.length);
  out[0] = 1;
  out[1] = signed ? 1 : 0;
  if (signed) { out.set(hexBytes(p.keyId!), 2); out.set(sig!, 10); }
  out.set(body, signed ? 74 : 2);
  return out;
}

/** Reads what packRelay wrote. Throws when it isn't a relay item. */
export function unpackRelay(bytes: Uint8Array): { canonical: string; item: RelayItem; signature: Uint8Array | null; keyId: string | null } {
  if (bytes.length < 3 || bytes[0] !== 1) throw new Error('Not a UniVerse code');
  const signed = (bytes[1] & 1) === 1;
  const canonical = new TextDecoder().decode(inflateSync(bytes.subarray(signed ? 74 : 2)));
  const item = JSON.parse(canonical) as RelayItem;
  if (item?.v !== 1 || !['NOTE', 'ANNOUNCEMENT', 'QUIZ'].includes(item.kind) || typeof item.title !== 'string' || !item.course?.id) throw new Error('Not a UniVerse code');
  return { canonical, item, keyId: signed ? bytesHex(bytes.subarray(2, 10)) : null, signature: signed ? bytes.slice(10, 74) : null };
}

/** A short random id for one loop, so frames of two different items never mix. */
export const loopId = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => B45[b % 36]).join('');

/** The loop's frames: "UV1:<id>:<n>/<total>:<Base45 data>", n from 1. */
export function toFrames(bytes: Uint8Array, id: string, size: FrameSize = 'normal'): string[] {
  const data = toBase45(bytes);
  const per = FRAME_CHARS[size];
  const total = Math.max(1, Math.ceil(data.length / per));
  return Array.from({ length: total }, (_, i) => `UV1:${id}:${i + 1}/${total}:${data.slice(i * per, (i + 1) * per)}`);
}

const FRAME = /^UV1:([0-9A-Z]{4}):(\d{1,3})\/(\d{1,3}):([0-9A-Z $%*+\-./:]*)$/;

export type CollectState = { state: 'ignored' | 'progress' | 'done'; have: number; total: number };

/** Gathers frames as the camera reads them, in any order, until it has every one. */
export class FrameCollector {
  private id: string | null = null;
  private total = 0;
  private parts = new Map<number, string>();
  /** A frame of another loop, kept until a second one says the teacher really switched. */
  private other: { id: string; total: number; n: number; data: string } | null = null;

  add(text: string): CollectState {
    const m = FRAME.exec(text.trim());
    const id = m?.[1] ?? '', n = m ? Number(m[2]) : 0, total = m ? Number(m[3]) : 0, data = m?.[4] ?? '';
    if (!m || n < 1 || total < 1 || n > total) return this.status('ignored');
    if (id !== this.id) {
      // Another loop: the teacher showed something else. Switch once it's seen twice in a row
      // (one stray frame from the edge of the screen shouldn't throw away what we have).
      if (this.id && this.parts.size && this.other?.id !== id) {
        this.other = { id, total, n, data };
        return this.status('ignored');
      }
      const first = this.other?.id === id && this.other.total === total ? this.other : null;
      this.id = id; this.total = total; this.parts = new Map(); this.other = null;
      if (first) this.parts.set(first.n, first.data);
    }
    if (total !== this.total) return this.status('ignored');
    this.other = null;
    this.parts.set(n, data);
    return this.status(this.parts.size === this.total ? 'done' : 'progress');
  }

  private status(state: CollectState['state']): CollectState {
    return { state, have: this.parts.size, total: this.total };
  }

  /** The frame numbers still missing (to show progress). */
  missing(): number[] {
    return Array.from({ length: this.total }, (_, i) => i + 1).filter((n) => !this.parts.has(n));
  }

  /** The bytes, once every frame is in. */
  bytes(): Uint8Array {
    if (!this.total || this.parts.size !== this.total) throw new Error('Not all codes read yet');
    return fromBase45(Array.from({ length: this.total }, (_, i) => this.parts.get(i + 1)!).join(''));
  }

  reset() { this.id = null; this.total = 0; this.parts = new Map(); this.other = null; }
}

/**
 * Whether the platform's key signed this item. 'unchecked' when the phone has no saved key (it
 * hasn't been online since this came in) or can't check Ed25519 signatures.
 */
export async function checkRelay(canonical: string, signature: Uint8Array | null, keyId: string | null, keys: { kid: string; x: string }[]): Promise<'ok' | 'bad' | 'unsigned' | 'unchecked'> {
  if (!signature || !keyId) return 'unsigned';
  const jwk = keys.find((k) => k.kid === keyId);
  if (!jwk) return keys.length ? 'bad' : 'unchecked';
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, { name: 'Ed25519' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'Ed25519' }, key, signature as BufferSource, new TextEncoder().encode(canonical) as BufferSource);
    return ok ? 'ok' : 'bad';
  } catch {
    return 'unchecked';
  }
}
