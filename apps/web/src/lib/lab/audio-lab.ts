import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { FileStore } from './files';
import { mat, num, str, toMat, type Struct, type Value } from './values';
import { decodeWav, encodeWav, thdPercent } from './audio';
import { hammingW, rfft } from './filters';

// Hyperion's test and measurement in the language (M473): audioread, audiowrite and audioinfo (WAV files in Hyperion's
// files), sound and soundsc (played by the window: the engine's background thread has no speakers), and thd. The
// Audio window (Signals → Audio) records from the microphone or its own generator into these files.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const files = (lab: Lab): FileStore => {
  const s = (lab.host as { files?: unknown }).files;
  if (!(s instanceof FileStore)) throw new LabError('Files aren’t available here.');
  return s;
};
const wav = (lab: Lab, name: string) => { try { return decodeWav(files(lab).get(name).bytes); } catch (e) { if (e instanceof LabError) throw e; throw new LabError(`${name}: ${(e as Error).message}`); } };

def('audioread', (a, nout, lab) => {
  const name = textOf(a[0] ?? str('')), w = wav(lab, name), n = w.channels[0].length;
  let from = 0, to = n;
  if (a[1] && a[1].k === 'mat' && a[1].d.length === 2) { from = Math.max(0, a[1].d[0] - 1); to = Math.min(n, Number.isFinite(a[1].d[1]) ? a[1].d[1] : n); }
  const len = Math.max(0, to - from), y = mat(len, w.channels.length);
  w.channels.forEach((c, j) => y.d.set(c.subarray(from, to), j * len));
  return nout > 1 ? [y, num(w.fs)] : [y];
});
def('audiowrite', (a, _n, lab) => {
  const name = textOf(a[0] ?? str('')), y = toMat(a[1] ?? num(NaN), 'The samples'), fs = Math.round(toMat(a[2] ?? num(NaN), 'The sample rate').d[0]);
  if (!/\.wav$/i.test(name)) throw new LabError('audiowrite writes .wav files.');
  let bits = 16;
  for (let i = 3; i + 1 < a.length; i += 2) {
    if (textOf(a[i]).toLowerCase() !== 'bitspersample') throw new LabError("audiowrite takes 'BitsPerSample' (8, 16, 24, 32 or 64).");
    bits = toMat(a[i + 1]).d[0];
  }
  const cols = y.r === 1 ? 1 : y.c, len = y.r === 1 ? y.c : y.r;
  const ch = Array.from({ length: cols }, (_, j) => y.d.subarray(j * len, (j + 1) * len));
  try { files(lab).put(name, { bytes: encodeWav(ch, fs, bits === 64 ? 64 : bits, bits === 64 || y.cls === 'single') }); } catch (e) { if (e instanceof LabError) throw e; throw new LabError((e as Error).message); }
  return [];
});
def('audioinfo', (a, _n, lab) => {
  const name = textOf(a[0] ?? str('')), w = wav(lab, name), n = w.channels[0].length;
  const s: Struct = { k: 'struct', f: new Map<string, Value>([['Filename', str(name)], ['NumChannels', num(w.channels.length)], ['SampleRate', num(w.fs)], ['TotalSamples', num(n)], ['Duration', num(n / w.fs)], ['BitsPerSample', num(w.bits)], ['CompressionMethod', str(w.float ? 'Uncompressed (float)' : 'Uncompressed')]]) };
  return [s];
});
/** sound(y, fs): −1 … 1 played as it is; soundsc scales the loudest sample to full scale. */
for (const [name, scale] of [['sound', false], ['soundsc', true]] as const) {
  def(name, (a, _n, lab) => {
    const y = toMat(a[0] ?? num(NaN), 'The samples'), fs = a[1] ? toMat(a[1]).d[0] : 8192;
    if (!(fs >= 1000 && fs <= 384000)) throw new LabError('The sample rate must be between 1,000 and 384,000 Hz.');
    const cols = y.r === 1 ? 1 : Math.min(2, y.c), len = y.r === 1 ? y.c : y.r;
    const peak = scale ? Math.max(1e-12, ...Array.from(y.d, Math.abs)) : 1;
    const ch = Array.from({ length: cols }, (_, j) => Float32Array.from(y.d.subarray(j * len, (j + 1) * len), (x) => x / peak));
    const play = (lab.host as { sound?: (c: Float32Array[], fs: number) => void }).sound;
    if (!play) throw new LabError('Sound can’t be played here.');
    play(ch, fs);
    return [];
  });
}
/** thd(x, fs, n): total harmonic distortion in dB against the fundamental (harmonics 2 … n, 6 unless given; fs is
 * accepted as MATLAB takes it, the harmonics are found by bin). */
def('thd', (a) => {
  const x = [...toMat(a[0] ?? num(NaN), 'The signal').d], nh = a[2] ? Math.round(toMat(a[2]).d[0]) : 6;
  if (x.length < 64) throw new LabError('thd needs at least 64 samples.');
  const N = 2 ** Math.floor(Math.log2(x.length)), w = hammingW(N), [re, im] = rfft(x.slice(0, N).map((v, i) => v * w[i]), N);
  return [num(20 * Math.log10(thdPercent(Array.from({ length: N / 2 + 1 }, (_, k) => re[k] ** 2 + im[k] ** 2), nh) / 100))];
});
