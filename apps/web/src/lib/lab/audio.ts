// Hyperion's test and measurement (M473): WAV files (read and write: 8, 16, 24 and 32-bit whole numbers, 32 and 64-bit
// floats, any number of channels), and the readings the Audio window logs (level in dBFS, the strongest frequency to a
// fraction of a bin, total harmonic distortion). Our own code from the RIFF/WAVE layout and the textbook formulas.

export interface Wav { fs: number; bits: number; float: boolean; channels: Float32Array[] }

/** A WAV file's samples, each channel scaled to −1 … 1 (floats as they are). */
export function decodeWav(bytes: Uint8Array): Wav {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('This isn’t a WAV file.');
  let fmt: { format: number; ch: number; fs: number; bits: number } | null = null, data: [number, number] | null = null;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = tag(at), size = v.getUint32(at + 4, true), body = at + 8;
    if (id === 'fmt ') {
      let format = v.getUint16(body, true);
      if (format === 0xfffe && size >= 26) format = v.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE: the sub-format
      fmt = { format, ch: v.getUint16(body + 2, true), fs: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    } else if (id === 'data') data = [body, Math.min(size, bytes.length - body)];
    at = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('This WAV file has no format or no samples.');
  const { format, ch, fs, bits } = fmt, float = format === 3, bps = bits / 8;
  if (!(format === 1 || format === 3) || ![8, 16, 24, 32, 64].includes(bits) || (float && bits < 32) || ch < 1) throw new Error(`Only plain PCM and float WAV files can be read (this one is format ${format}, ${bits} bits).`);
  const n = Math.floor(data[1] / (bps * ch)), channels = Array.from({ length: ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const p = data[0] + (i * ch + c) * bps;
    channels[c][i] = float ? (bits === 32 ? v.getFloat32(p, true) : v.getFloat64(p, true))
      : bits === 8 ? (v.getUint8(p) - 128) / 128
      : bits === 16 ? v.getInt16(p, true) / 32768
      : bits === 24 ? (((v.getUint8(p + 2) << 24) | (v.getUint8(p + 1) << 16) | (v.getUint8(p) << 8)) >> 8) / 8388608
      : v.getInt32(p, true) / 2147483648;
  }
  return { fs, bits, float, channels };
}

/** A WAV file of these channels (equal lengths), clipped to −1 … 1 for whole-number samples. */
export function encodeWav(channels: ArrayLike<number>[], fs: number, bits = 16, float = false): Uint8Array {
  if (!channels.length || channels.some((c) => c.length !== channels[0].length)) throw new Error('Every channel must have as many samples.');
  if (!(fs > 0) || !Number.isInteger(fs)) throw new Error('The sample rate is a whole number of hertz.');
  if (float ? !(bits === 32 || bits === 64) : ![8, 16, 24, 32].includes(bits)) throw new Error('Bits per sample: 8, 16, 24 or 32 (or 32 and 64 for floats).');
  const ch = channels.length, n = channels[0].length, bps = bits / 8, size = n * ch * bps;
  const out = new Uint8Array(44 + size + (size % 2)), v = new DataView(out.buffer), put = (at: number, s: string) => { for (let i = 0; i < 4; i++) out[at + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); v.setUint32(4, 36 + size + (size % 2), true); put(8, 'WAVE'); put(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, float ? 3 : 1, true); v.setUint16(22, ch, true); v.setUint32(24, fs, true); v.setUint32(28, fs * ch * bps, true); v.setUint16(32, ch * bps, true); v.setUint16(34, bits, true);
  put(36, 'data'); v.setUint32(40, size, true);
  const clip = (x: number) => (x > 1 ? 1 : x < -1 ? -1 : Number.isNaN(x) ? 0 : x);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const p = 44 + (i * ch + c) * bps, x = channels[c][i];
    if (float) { if (bits === 32) v.setFloat32(p, x, true); else v.setFloat64(p, x, true); continue; }
    const s = clip(x);
    if (bits === 8) v.setUint8(p, Math.min(255, Math.round(s * 128) + 128));
    else if (bits === 16) v.setInt16(p, Math.min(32767, Math.round(s * 32768)), true);
    else if (bits === 24) { const q = Math.min(8388607, Math.round(s * 8388608)); v.setUint8(p, q & 255); v.setUint8(p + 1, (q >> 8) & 255); v.setUint8(p + 2, (q >> 16) & 255); }
    else v.setInt32(p, Math.min(2147483647, Math.round(s * 2147483648)), true);
  }
  return out;
}

/** RMS level in dB against full scale (1.0), as audio meters show dBFS. */
export function rmsDb(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return x.length ? 10 * Math.log10(s / x.length || 1e-20) : -Infinity;
}
/** The strongest bin of a spectrum in dB (bins 0 … N/2 of an fft of size `n`), refined by a parabola through it and
 * its neighbours; bins below `minHz` are skipped (to step over hum and DC). */
export function peakFrequency(db: ArrayLike<number>, fs: number, n: number, minHz = 20): { hz: number; db: number } {
  const from = Math.max(1, Math.ceil((minHz * n) / fs));
  let k = from;
  for (let i = from; i < db.length - 1; i++) if (db[i] > db[k]) k = i;
  const a = db[k - 1] ?? db[k], b = db[k], c = db[k + 1] ?? db[k], den = a - 2 * b + c;
  const d = den < 0 ? (0.5 * (a - c)) / den : 0;
  return { hz: ((k + d) * fs) / n, db: b - 0.25 * (a - c) * d };
}
/** Total harmonic distortion (percent) of a power spectrum (bins 0 … N/2): harmonics 2 … h of the strongest tone,
 * each summed over ±`spread` bins, against the tone. */
export function thdPercent(power: ArrayLike<number>, harmonics = 5, spread = 3): number {
  let k = 1;
  for (let i = 1; i < power.length; i++) if (power[i] > power[k]) k = i;
  const band = (c: number) => { let s = 0; for (let i = Math.max(1, c - spread); i <= Math.min(power.length - 1, c + spread); i++) s += power[i]; return s; };
  const f0 = band(k);
  let h = 0;
  for (let m = 2; m <= harmonics && m * k < power.length - spread; m++) h += band(m * k);
  return f0 > 0 ? 100 * Math.sqrt(h / f0) : NaN;
}
