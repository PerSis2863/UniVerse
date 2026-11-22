import { describe, expect, it } from 'vitest';
import { controlsOf, setControl } from './controls';
import { GifWriter, indexPixels, PaletteMaker } from './gif';
import { findings, sweepCodes, sweepColumns, sweepCsv, sweepValues, type SweepFrame } from './sweep';

describe('Hyperion: Sweep (M402)', () => {
  const code = 'theta = 45;   % slider 10 80\nq = 0.5; % slider 0:0.25:2\nx = sind(2*theta)\n';
  const [theta, q] = controlsOf(code);
  it('spreads values over the range on the slider’s steps, ends as typed', () => {
    expect(sweepValues(theta, 10, 80, 8)).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(sweepValues(q, 0, 2, 9)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
    expect(sweepValues(q, 0, 1, 12)).toEqual([0, 0.25, 0.5, 0.75, 1]); // a coarse step: no repeats
    expect(sweepValues(theta, 80, 10, 3)).toEqual([80, 45, 10]); // backwards too
    expect(sweepValues(theta, 5, 5, 4)).toEqual([]);
    expect(sweepValues(theta, 0, 100, 500)).toHaveLength(48);
  });
  it('a step like 0.25 keeps both decimals (it used to round to 0.3)', () => {
    expect(setControl(code, q, 1.25).split('\n')[1]).toBe('q = 1.25; % slider 0:0.25:2');
  });
  it('writes each value into its own copy of the script', () => {
    const codes = sweepCodes(code, theta, [10, 12.5]);
    expect(codes.map((c) => c.split('\n')[0])).toEqual(['theta = 10;   % slider 10 80', 'theta = 12.5;   % slider 10 80']);
  });
  const frame = (value: number, outs: Record<string, number>): SweepFrame => ({ value, light: '', dark: '', outs });
  it('keeps the numbers that change, and says where they peak and change sign', () => {
    const values = [0, 45, 90, 135];
    const frames = values.map((t) => frame(t, { theta: t, x: +Math.sin((2 * t * Math.PI) / 180).toFixed(6), g: 9.81, y: Math.cos((t * Math.PI) / 180) }));
    const cols = sweepColumns(frames, 'theta');
    expect(cols.map((c) => c.name)).toEqual(['x', 'y']); // theta is the swept one, g never changes
    expect(cols[0]).toMatchObject({ max: 1, min: 3, zero: 0 });
    expect(findings(cols, 'theta', values)).toEqual([
      'x is largest at theta = 45 (1) and smallest at theta = 135 (-1).',
      'x is 0 at theta = 0.',
      'y is largest at theta = 0 (1) and smallest at theta = 135 (-0.70711).',
      'y changes sign between theta = 90 and 135.',
    ]);
    expect(sweepCsv(cols, 'theta', values).split('\n')[1]).toBe('0,0,1');
  });
  it('a run that failed leaves a gap', () => {
    const cols = sweepColumns([frame(1, { a: 1 }), undefined, frame(3, { a: 3 })], 's');
    expect(cols[0].values).toEqual([1, null, 3]);
  });
});

/** A small GIF reader for the test: the palette, each frame's pixels and delay. */
function readGif(b: Uint8Array) {
  expect(String.fromCharCode(...b.slice(0, 6))).toBe('GIF89a');
  const w = b[6] | (b[7] << 8), h = b[8] | (b[9] << 8), size = 2 << (b[10] & 7);
  let p = 13 + size * 3;
  const frames: number[][] = [], delays: number[] = [];
  let loops = false;
  while (p < b.length) {
    const t = b[p++];
    if (t === 0x3b) break;
    if (t === 0x21) {
      const label = b[p++];
      if (label === 0xf9) delays.push(b[p + 2] | (b[p + 3] << 8));
      if (label === 0xff) loops = String.fromCharCode(...b.slice(p + 1, p + 12)) === 'NETSCAPE2.0';
      while (b[p]) p += b[p] + 1;
      p++;
      continue;
    }
    expect(t).toBe(0x2c);
    p += 9;
    const min = b[p++], data: number[] = [];
    while (b[p]) { data.push(...b.slice(p + 1, p + 1 + b[p])); p += b[p] + 1; }
    p++;
    frames.push(unLzw(data, min));
  }
  return { w, h, palette: b.slice(13, 13 + size * 3), frames, delays, loops, ended: b[b.length - 1] === 0x3b };
}
function unLzw(data: number[], min: number) {
  const clear = 1 << min, eoi = clear + 1, out: number[] = [];
  let size = min + 1, next = eoi + 1, bit = 0, dict: number[][] = [], prev: number[] | null = null;
  const reset = () => { dict = Array.from({ length: clear }, (_, i) => [i]); size = min + 1; next = eoi + 1; prev = null; };
  reset();
  for (;;) {
    let code = 0;
    for (let i = 0; i < size; i++, bit++) code |= ((data[bit >> 3] >> (bit & 7)) & 1) << i;
    if (code === clear) { reset(); continue; }
    if (code === eoi) break;
    const entry: number[] = code < next && dict[code] ? dict[code] : [...prev!, prev![0]];
    out.push(...entry);
    if (prev) { dict[next++] = [...prev, entry[0]]; if (next === 1 << size && size < 12) size++; }
    prev = entry;
  }
  return out;
}

describe('Hyperion: animated GIF (M402)', () => {
  const W = 96, H = 64;
  const picture = (shift: number) => {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, on = ((x + shift) >> 3) % 2 === 0;
      px[i] = on ? 37 : 255; px[i + 1] = on ? 99 : 255; px[i + 2] = on ? 235 : 255; px[i + 3] = 255;
      if (y === (x * 3 + shift) % H) { px[i] = (x * 7) % 256; px[i + 1] = (x * 13) % 256; px[i + 2] = (x * 29) % 256; } // many colours: some go to their nearest
    }
    return px;
  };
  it('writes a looping film a GIF reader reads back pixel for pixel', () => {
    const pics = [0, 3, 6].map(picture), pm = new PaletteMaker();
    pics.forEach((p) => pm.add(p));
    const pal = pm.make(), gif = new GifWriter(W, H, pal), wanted: Uint8Array[] = [];
    for (const p of pics) { const ix = indexPixels(p, pal); wanted.push(ix); gif.frame(ix, 250); }
    const g = readGif(gif.finish());
    expect([g.w, g.h, g.loops, g.ended]).toEqual([W, H, true, true]);
    expect(g.delays).toEqual([25, 25, 25]);
    g.frames.forEach((f, k) => expect(f).toEqual([...wanted[k]]));
    // The plain colours come back exactly.
    const at = wanted[0][10 * W + 1], blue = [...g.palette.slice(at * 3, at * 3 + 3)];
    expect(blue).toEqual([37, 99, 235]);
  });
  it('a big noisy picture fills the code table and starts it again', () => {
    const W2 = 300, H2 = 200, px = new Uint8Array(W2 * H2);
    let s = 7;
    for (let i = 0; i < px.length; i++) { s = (s * 1103515245 + 12345) >>> 0; px[i] = s >>> 24; }
    const rgb = new Uint8Array(768); for (let i = 0; i < 768; i++) rgb[i] = i % 256;
    const gif = new GifWriter(W2, H2, { rgb, n: 256, lut: new Int16Array(32768).fill(-1) });
    gif.frame(px, 100);
    expect(readGif(gif.finish()).frames[0]).toEqual([...px]);
  });
});
