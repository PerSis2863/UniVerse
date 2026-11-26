// Hyperion's hardware support (M474): the Firmata protocol (the StandardFirmata sketch that comes with the Arduino
// IDE: File → Examples → Firmata) as bytes in and out, a simulated board that answers it (to try everything without
// hardware), and the Serial Plotter's line format ("temp:21.5,light:300" or "1 2 3"). Our own code from the published
// protocol description (firmata/protocol on GitHub, version 2.6).

export const MODE = { input: 0, output: 1, analog: 2, pwm: 3, servo: 4, pullup: 11 } as const;
export type Mode = keyof typeof MODE;
const NAME_OF = Object.fromEntries(Object.entries(MODE).map(([k, v]) => [v, k])) as Record<number, Mode>;

export type Event =
  | { type: 'version'; major: number; minor: number }
  | { type: 'firmware'; name: string; major: number; minor: number }
  | { type: 'digital'; port: number; mask: number }
  | { type: 'analog'; channel: number; value: number }
  | { type: 'capabilities'; pins: { modes: Partial<Record<Mode, number>> }[] }
  | { type: 'analogMap'; map: number[] }
  | { type: 'string'; text: string };

// ——— Bytes out ———
const lo = (v: number) => v & 0x7f, hi = (v: number) => (v >> 7) & 0x7f;
export const encode = {
  capabilities: () => [0xf0, 0x6b, 0xf7],
  analogMapping: () => [0xf0, 0x69, 0xf7],
  firmware: () => [0xf0, 0x79, 0xf7],
  version: () => [0xf9],
  samplingInterval: (ms: number) => [0xf0, 0x7a, lo(ms), hi(ms), 0xf7],
  pinMode: (pin: number, mode: Mode) => [0xf4, pin & 0x7f, MODE[mode]],
  digitalWrite: (pin: number, value: number) => [0xf5, pin & 0x7f, value ? 1 : 0],
  /** PWM duty (0 … 255 for an 8-bit pin) or a servo's angle; pins above 15 use the extended message. */
  analogWrite: (pin: number, value: number) => (pin < 16 ? [0xe0 | pin, lo(value), hi(value)] : [0xf0, 0x6f, pin, lo(value), hi(value), 0xf7]),
  reportAnalog: (channel: number, on: boolean) => [0xc0 | (channel & 0x0f), on ? 1 : 0],
  reportDigital: (port: number, on: boolean) => [0xd0 | (port & 0x0f), on ? 1 : 0],
};

/** Reads the board's bytes as they arrive (in any pieces) and hands back whole messages. */
export class Parser {
  private buf: number[] = [];
  feed(bytes: ArrayLike<number>): Event[] {
    const out: Event[] = [];
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b & 0x80 && this.buf.length && this.buf[0] !== 0xf0) this.buf = []; // a new command cuts off a broken one
      if (!this.buf.length && !(b & 0x80)) continue; // stray data byte
      this.buf.push(b);
      const e = this.take();
      if (e !== undefined) { this.buf = []; if (e) out.push(e); }
    }
    return out;
  }
  /** A finished message (null for one we skip), or undefined while it is still coming. */
  private take(): Event | null | undefined {
    const m = this.buf, c = m[0], need = (n: number) => m.length >= n;
    if (c === 0xf9) return need(3) ? { type: 'version', major: m[1], minor: m[2] } : undefined;
    if ((c & 0xf0) === 0x90) return need(3) ? { type: 'digital', port: c & 0x0f, mask: m[1] | (m[2] << 7) } : undefined;
    if ((c & 0xf0) === 0xe0) return need(3) ? { type: 'analog', channel: c & 0x0f, value: m[1] | (m[2] << 7) } : undefined;
    if (c === 0xf4 || c === 0xf5 || (c & 0xf0) === 0xc0 || (c & 0xf0) === 0xd0) return need(c >= 0xf4 ? 3 : 2) ? null : undefined;
    if (c !== 0xf0) return null;
    if (m[m.length - 1] !== 0xf7) return m.length > 4096 ? null : undefined;
    const body = m.slice(2, -1), cmd = m[1];
    const text = (from: number) => { let s = ''; for (let i = from; i + 1 < body.length; i += 2) s += String.fromCharCode(body[i] | (body[i + 1] << 7)); return s; };
    if (cmd === 0x79) return { type: 'firmware', major: body[0], minor: body[1], name: text(2) };
    if (cmd === 0x71) return { type: 'string', text: text(0) };
    if (cmd === 0x6a) return { type: 'analogMap', map: body.map((x) => (x === 127 ? -1 : x)) };
    if (cmd === 0x6c) {
      const pins: { modes: Partial<Record<Mode, number>> }[] = [];
      let cur: Partial<Record<Mode, number>> = {};
      for (let i = 0; i < body.length;) {
        if (body[i] === 0x7f) { pins.push({ modes: cur }); cur = {}; i++; continue; }
        const name = NAME_OF[body[i]];
        if (name) cur[name] = body[i + 1];
        i += 2;
      }
      return { type: 'capabilities', pins };
    }
    return null;
  }
}

// ——— A simulated Arduino Uno running StandardFirmata ———
/** Pins 0–13 digital (3, 5, 6, 9, 10, 11 with PWM; 0 and 1 the serial line), A0–A5 = pins 14–19 (analog channels 0–5).
 * Analog inputs follow slow made-up signals (a temperature sensor, a light sensor, a knob…); a digital output wired
 * back to its neighbour (pin 7 reads pin 8) lets a test see its writes. */
export class SimBoard {
  private pending: number[] = [];
  private modes = new Map<number, Mode>();
  private outs = new Map<number, number>();
  private reportA = new Set<number>();
  private reportD = new Set<number>();
  readonly pwm = new Map<number, number>();
  private t = 0;
  constructor() { this.pending.push(0xf9, 2, 6, ...this.sysex(0x79, [2, 6, ...this.chars('Simulated Uno')])); }
  private chars(s: string) { return [...s].flatMap((ch) => [lo(ch.charCodeAt(0)), hi(ch.charCodeAt(0))]); }
  private sysex(cmd: number, body: number[]) { return [0xf0, cmd, ...body, 0xf7]; }
  /** Bytes from the computer. */
  write(bytes: ArrayLike<number>) {
    const raw = Array.from(bytes);
    for (let i = 0; i < raw.length;) {
      const c = raw[i];
      if (c === 0xf0) {
        const end = raw.indexOf(0xf7, i);
        if (end < 0) break;
        const cmd = raw[i + 1];
        if (cmd === 0x6b) this.pending.push(...this.sysex(0x6c, Array.from({ length: 20 }, (_, p) => this.capsOf(p)).flat()));
        else if (cmd === 0x69) this.pending.push(...this.sysex(0x6a, Array.from({ length: 20 }, (_, p) => (p >= 14 ? p - 14 : 127))));
        else if (cmd === 0x79) this.pending.push(...this.sysex(0x79, [2, 6, ...this.chars('Simulated Uno')]));
        else if (cmd === 0x6f) this.pwm.set(raw[i + 2], raw[i + 3] | (raw[i + 4] << 7));
        i = end + 1; continue;
      }
      if (c === 0xf9) { this.pending.push(0xf9, 2, 6); i += 1; continue; }
      if (c === 0xf4) { this.modes.set(raw[i + 1], NAME_OF[raw[i + 2]] ?? 'input'); i += 3; continue; }
      if (c === 0xf5) { this.outs.set(raw[i + 1], raw[i + 2] ? 1 : 0); this.sendAll(); i += 3; continue; }
      if ((c & 0xf0) === 0xe0) { this.pwm.set(c & 0x0f, raw[i + 1] | (raw[i + 2] << 7)); i += 3; continue; }
      if ((c & 0xf0) === 0x90) { const port = c & 0x0f, mask = raw[i + 1] | (raw[i + 2] << 7); for (let b = 0; b < 8; b++) this.outs.set(port * 8 + b, (mask >> b) & 1); this.sendAll(); i += 3; continue; }
      if ((c & 0xf0) === 0xc0) { if (raw[i + 1]) this.reportA.add(c & 0x0f); else this.reportA.delete(c & 0x0f); i += 2; continue; }
      if ((c & 0xf0) === 0xd0) { if (raw[i + 1]) { this.reportD.add(c & 0x0f); this.sendPort(c & 0x0f); } else this.reportD.delete(c & 0x0f); i += 2; continue; }
      i += 1;
    }
  }
  private capsOf(p: number): number[] {
    if (p < 2) return [0x7f];
    const caps = [0, 1, 1, 1, 11, 1];
    if ([3, 5, 6, 9, 10, 11].includes(p)) caps.push(3, 8, 4, 14);
    if (p >= 14) caps.push(2, 10);
    return [...caps, 0x7f];
  }
  /** A digital input's level: pin 7 is wired to pin 8; pin 2 is a button pressed every other second. */
  private level(p: number) {
    if ((this.modes.get(p) ?? 'input') === 'output') return this.outs.get(p) ?? 0;
    if (p === 7) return this.outs.get(8) ?? 0;
    if (p === 2) return Math.floor(this.t) % 2;
    return this.modes.get(p) === 'pullup' ? 1 : 0;
  }
  /** A write can change any port (pin 7 follows pin 8): every reported port is sent again. */
  private sendAll() { for (const port of this.reportD) this.sendPort(port); }
  private sendPort(port: number) {
    if (!this.reportD.has(port)) return;
    let mask = 0;
    for (let b = 0; b < 8; b++) mask |= this.level(port * 8 + b) << b;
    this.pending.push(0x90 | port, lo(mask), hi(mask));
  }
  /** The six analog inputs at time t (seconds), 10-bit. */
  analogAt(ch: number, t: number) {
    const v = [512 + 60 * Math.sin(t / 4), 300 + 250 * Math.max(0, Math.sin(t / 2)), 1023 * (0.5 + 0.5 * Math.sin(t / 3)), 200 + 20 * Math.sin(7 * t), 700, (this.pwm.get(9) ?? 0) * 4][ch] ?? 0;
    return Math.max(0, Math.min(1023, Math.round(v)));
  }
  /** Advances the clock (seconds) and returns what the board sent meanwhile. */
  read(dt = 0): Uint8Array {
    const before = Math.floor(this.t);
    this.t += dt;
    if (dt > 0) {
      for (const ch of this.reportA) { const v = this.analogAt(ch, this.t); this.pending.push(0xe0 | ch, lo(v), hi(v)); }
      if (Math.floor(this.t) !== before) for (const port of this.reportD) this.sendPort(port);
    }
    const out = Uint8Array.from(this.pending);
    this.pending = [];
    return out;
  }
}

// ——— Text lines, as the Serial Plotter reads them ———
/** "temp:21.5,light:300" (named) or "1 2 3" / "1,2,3" / tabs (unnamed); null for a line without numbers. */
export function parsePlotLine(line: string): { names: (string | null)[]; values: number[] } | null {
  const parts = line.trim().split(/[,\t ]+|\s*;\s*/).filter(Boolean);
  if (!parts.length) return null;
  const names: (string | null)[] = [], values: number[] = [];
  for (const p of parts) {
    const m = /^([^:=]+)[:=](.+)$/.exec(p), v = Number(m ? m[2] : p);
    if (!Number.isFinite(v)) continue;
    names.push(m ? m[1].trim() : null); values.push(v);
  }
  return values.length ? { names, values } : null;
}
