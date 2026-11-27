// Hyperion's CAN data (M576, the owner, 27 Nov: the automated-driving page's "access live and recorded driving data…
// CAN"): DBC message databases (messages, signals with Intel or Motorola byte order, signs, scale and offset, value
// tables, multiplexing), CAN logs (Vector ASCII .asc and Linux candump), each frame decoded into its signals, and
// signals encoded back into a frame. Pure, our own code from the DBC and log formats as documented.

const B0 = BigInt(0), B1 = BigInt(1);

export interface Signal { name: string; start: number; length: number; intel: boolean; signed: boolean; factor: number; offset: number; min: number; max: number; unit: string; mux?: number; isMux?: boolean; values?: Record<number, string> }
export interface Message { id: number; extended: boolean; name: string; dlc: number; sender: string; signals: Signal[] }
export interface Frame { t: number; channel: number; id: number; extended: boolean; data: number[]; dir?: 'Rx' | 'Tx' }

/** A DBC file's messages and their signals. */
export function readDBC(text: string): Message[] {
  const msgs: Message[] = [];
  let cur: Message | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    let m = /^BO_\s+(\d+)\s+(\w+)\s*:\s*(\d+)\s+(\w+)/.exec(line);
    if (m) { const id = Number(m[1]); cur = { id: id & 0x1fffffff, extended: (id & 0x80000000) !== 0, name: m[2], dlc: +m[3], sender: m[4], signals: [] }; msgs.push(cur); continue; }
    m = /^SG_\s+(\w+)\s*(M|m\d+)?\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(\s*([-+.\deE]+)\s*,\s*([-+.\deE]+)\s*\)\s*\[\s*([-+.\deE]+)\s*\|\s*([-+.\deE]+)\s*\]\s*"([^"]*)"/.exec(line);
    if (m && cur) { cur.signals.push({ name: m[1], start: +m[3], length: +m[4], intel: m[5] === '1', signed: m[6] === '-', factor: +m[7], offset: +m[8], min: +m[9], max: +m[10], unit: m[11], ...(m[2] === 'M' ? { isMux: true } : m[2] ? { mux: +m[2].slice(1) } : {}) }); continue; }
    m = /^VAL_\s+(\d+)\s+(\w+)\s+(.*);/.exec(line);
    if (m) {
      const id = Number(m[1]) & 0x1fffffff, msg = msgs.find((x) => x.id === id), sig = msg?.signals.find((x) => x.name === m![2]);
      if (sig) { sig.values = {}; for (const v of m[3].matchAll(/(-?\d+)\s+"([^"]*)"/g)) sig.values[+v[1]] = v[2]; }
    }
  }
  if (!msgs.length) throw new Error('No messages (BO_ lines) in this DBC file.');
  return msgs;
}
/** The bits of a signal as the raw unsigned number (BigInt, so 64-bit signals stay exact). */
function rawOf(s: Signal, data: number[]): bigint {
  let v = B0;
  if (s.intel) { for (let i = 0; i < s.length; i++) { const b = s.start + i; if ((data[b >> 3] >> (b & 7)) & 1) v |= B1 << BigInt(i); } }
  else {
    // Motorola: the start bit is the most significant; walk the "sawtooth": down a byte's bits, then the next byte's top
    let pos = s.start;
    for (let i = 0; i < s.length; i++) { v = (v << B1) | BigInt((data[pos >> 3] >> (pos & 7)) & 1); pos = pos % 8 === 0 ? pos + 15 : pos - 1; }
  }
  return v;
}
function putRaw(s: Signal, data: number[], v: bigint) {
  const set = (b: number, bit: number) => { if (bit) data[b >> 3] |= 1 << (b & 7); else data[b >> 3] &= ~(1 << (b & 7)); };
  if (s.intel) for (let i = 0; i < s.length; i++) set(s.start + i, Number((v >> BigInt(i)) & B1));
  else { let pos = s.start; for (let i = s.length - 1; i >= 0; i--) { set(pos, Number((v >> BigInt(i)) & B1)); pos = pos % 8 === 0 ? pos + 15 : pos - 1; } }
}
/** A signal's physical value from a frame's bytes: raw (two's complement when signed) × factor + offset. */
export function decodeSignal(s: Signal, data: number[]): number {
  let r = rawOf(s, data);
  if (s.signed && s.length > 0 && (r >> BigInt(s.length - 1)) & B1) r -= B1 << BigInt(s.length);
  return Number(r) * s.factor + s.offset;
}
/** Every signal of a message present in this frame (a multiplexed signal only when the multiplexor selects it). */
export function decodeFrame(m: Message, data: number[]): Record<string, number> {
  const out: Record<string, number> = {}, mux = m.signals.find((s) => s.isMux), sel = mux ? decodeSignal(mux, data) : undefined;
  for (const s of m.signals) if (s.mux === undefined || s.mux === sel) out[s.name] = decodeSignal(s, data);
  return out;
}
/** A frame's bytes from physical values (each rounded to its step, clamped to its bit width). */
export function encodeFrame(m: Message, values: Record<string, number>): number[] {
  const data = new Array(Math.max(1, m.dlc)).fill(0);
  for (const s of m.signals) {
    if (!(s.name in values)) continue;
    let r = BigInt(Math.round((values[s.name] - s.offset) / s.factor));
    const lo = s.signed ? -(B1 << BigInt(s.length - 1)) : B0, hi = s.signed ? (B1 << BigInt(s.length - 1)) - B1 : (B1 << BigInt(s.length)) - B1;
    if (r < lo) r = lo; if (r > hi) r = hi;
    if (r < B0) r += B1 << BigInt(s.length);
    putRaw(s, data, r);
  }
  return data;
}
/** A CAN log: Vector ASCII (.asc: "time channel id[x] Rx|Tx d dlc bytes", CAN FD lines too) or Linux candump
 *  ("(time) iface id#hex", "id##flagshex" for FD). */
export function readCANLog(text: string): Frame[] {
  const frames: Frame[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let m = /^\s*([\d.]+)\s+(\d+)\s+([0-9A-Fa-f]+)(x?)\s+(Rx|Tx)\s+d\s+([0-9A-Fa-f]+)((?:\s+[0-9A-Fa-f]{2})*)/.exec(raw);
    if (m) { const data = (m[7].trim() ? m[7].trim().split(/\s+/) : []).map((h) => parseInt(h, 16)); frames.push({ t: +m[1], channel: +m[2], id: parseInt(m[3], 16), extended: m[4] === 'x', data: data.slice(0, parseInt(m[6], 16)), dir: m[5] as 'Rx' | 'Tx' }); continue; }
    // CAN FD in .asc: "time CANFD channel Rx|Tx id[x] … brs esi dlc length bytes…"
    m = /^\s*([\d.]+)\s+CANFD\s+(\d+)\s+(Rx|Tx)\s+([0-9A-Fa-f]+)(x?)\s+(?:\S+\s+)?[01]\s+[01]\s+[0-9A-Fa-f]+\s+(\d+)((?:\s+[0-9A-Fa-f]{2})*)/.exec(raw);
    if (m) { const data = m[7].trim().split(/\s+/).filter(Boolean).map((h) => parseInt(h, 16)); frames.push({ t: +m[1], channel: +m[2], id: parseInt(m[4], 16), extended: m[5] === 'x', data: data.slice(0, +m[6]), dir: m[3] as 'Rx' | 'Tx' }); continue; }
    m = /^\s*\(([\d.]+)\)\s+(\S+)\s+([0-9A-Fa-f]+)#(#?)(R\d*|[0-9A-Fa-f.]*)/.exec(raw);
    if (m) {
      if (m[5].startsWith('R')) continue; // a remote frame carries no data
      const hex = (m[4] ? m[5].slice(1) : m[5]).replace(/\./g, '');
      const data = Array.from({ length: hex.length >> 1 }, (_, i) => parseInt(hex.slice(2 * i, 2 * i + 2), 16));
      const ch = /(\d+)$/.exec(m[2]);
      frames.push({ t: +m[1], channel: ch ? +ch[1] + 1 : 1, id: parseInt(m[3], 16), extended: m[3].length > 3, data });
    }
  }
  if (!frames.length) throw new Error('No CAN frames found (Vector .asc or candump .log lines).');
  return frames;
}
/** The frames as text a tool can read again: Vector ASCII. */
export function writeASC(frames: Frame[]) {
  const hex = (n: number, w = 2) => n.toString(16).toUpperCase().padStart(w, '0');
  return ['date Fri Nov 27 12:00:00 pm 2026', 'base hex  timestamps absolute', 'no internal events logged', 'Begin Triggerblock Fri Nov 27 12:00:00 pm 2026',
    ...frames.map((f) => `${f.t.toFixed(6).padStart(11)} ${f.channel}  ${hex(f.id, 1)}${f.extended ? 'x' : ''}             ${f.dir ?? 'Rx'}   d ${hex(f.data.length, 1)} ${f.data.map((b) => hex(b)).join(' ')}`),
    'End TriggerBlock', ''].join('\n');
}
/** Each message's signals over time: { name: { t: [...], signals: { sig: [...] } } }, only the messages the database
 *  knows (and, for a multiplexed signal, NaN where the frame didn't carry it). */
export function signalTimetables(frames: Frame[], db: Message[]) {
  const byId = new Map(db.map((m) => [`${m.extended ? 'x' : 's'}${m.id}`, m])), out: Record<string, { t: number[]; signals: Record<string, number[]> }> = {};
  for (const f of frames) {
    const m = byId.get(`${f.extended ? 'x' : 's'}${f.id}`) ?? byId.get(`s${f.id}`) ?? byId.get(`x${f.id}`);
    if (!m) continue;
    const tt = (out[m.name] ??= { t: [], signals: Object.fromEntries(m.signals.map((s) => [s.name, []])) });
    const v = decodeFrame(m, f.data);
    tt.t.push(f.t);
    for (const s of m.signals) tt.signals[s.name].push(s.name in v ? v[s.name] : NaN);
  }
  return out;
}
