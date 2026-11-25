// Hyperion reads electrophysiology files (M517): Axon Binary Format 2 (pCLAMP 10 and later, Clampex's .abf), laid
// out as pyabf documents it (the header, then sections in 512-byte blocks: protocol, ADC, strings, data), and
// Neurodata Without Borders 2 (.nwb, HDF5): each time series under /acquisition with its data, conversion, offset,
// unit and its starting time and rate (or its timestamps). Pure.
import { H5File, numbers, type H5Dataset, type H5Group, type H5Object } from './hdf5';

export interface Recording { data: number[][][]; rate: number; channels: string[]; units: string[]; sweeps: number; mode: number }

const BLOCK = 512;
/** ABF2: data[channel][sweep][sample], scaled to the units the amplifier reported. ABF 1 (before 2006) is refused. */
export function readAbf(b: Uint8Array): Recording {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), sig = String.fromCharCode(...b.subarray(0, 4));
  if (sig === 'ABF ') throw new Error('This is ABF 1 (Clampex before version 10): open it in Clampfit and save it as ABF 2.');
  if (sig !== 'ABF2') throw new Error('That isn’t an ABF file (it starts with ABF2).');
  const sweeps = dv.getUint32(12, true), format = dv.getUint16(30, true);
  const sec = (o: number) => ({ block: dv.getUint32(o, true), bytes: dv.getUint32(o + 4, true), count: Number(dv.getBigInt64(o + 8, true)) });
  const prot = sec(76), adc = sec(92), strs = sec(220), data = sec(236);
  const p = prot.block * BLOCK;
  const mode = dv.getInt16(p, true), interval = dv.getFloat32(p + 2, true), adcRange = dv.getFloat32(p + 110, true), resolution = dv.getInt32(p + 118, true);
  if (!(interval > 0)) throw new Error('The file has no sampling interval.');
  const nch = adc.count;
  if (!(nch >= 1 && nch <= 64)) throw new Error('The file lists no input channels.');
  let strings: string[] = [];
  if (strs.bytes) {
    const raw = b.subarray(strs.block * BLOCK, strs.block * BLOCK + strs.bytes), parts: string[] = [];
    let cur = '';
    for (const c of raw) { if (c) cur += String.fromCharCode(c); else { parts.push(cur); cur = ''; } }
    const start = parts.findIndex((s) => /(clampex|clampfit|axoscope|patchxpress)/i.test(s));
    strings = start >= 0 ? parts.slice(start).map((s) => s.replace(/^.*(clampex|clampfit|axoscope|patchxpress)/i, '$1')) : [];
  }
  const ch: { scale: number; offset: number; name: string; unit: string; order: number }[] = [];
  for (let i = 0; i < nch; i++) {
    const a = adc.block * BLOCK + i * adc.bytes, f = (o: number) => dv.getFloat32(a + o, true);
    const tele = dv.getInt16(a + 2, true) ? f(6) : 1;
    const gain = f(40) * f(48) * f(28) * (tele || 1);
    const nameI = dv.getInt32(a + 74, true), unitI = dv.getInt32(a + 78, true);
    ch.push({ scale: format === 1 ? 1 : adcRange / (resolution * gain), offset: format === 1 ? 0 : f(44) - f(52), name: strings[nameI]?.trim() || `ADC${dv.getInt16(a, true)}`, unit: strings[unitI]?.trim() || '', order: dv.getInt16(a + 26, true) });
  }
  const size = format === 1 ? 4 : 2, total = data.count, start = data.block * BLOCK;
  if (start + total * size > b.length) throw new Error('The file is cut short (its data run past the end).');
  const nsw = mode === 3 ? 1 : Math.max(1, sweeps), per = Math.floor(total / nch / nsw);
  const out = ch.map(() => Array.from({ length: nsw }, () => new Array<number>(per)));
  for (let s = 0; s < nsw; s++) for (let k = 0; k < per; k++) for (let c = 0; c < nch; c++) {
    const at = start + ((s * per + k) * nch + c) * size, raw = format === 1 ? dv.getFloat32(at, true) : dv.getInt16(at, true);
    out[c][s][k] = raw * ch[c].scale + ch[c].offset;
  }
  return { data: out, rate: 1e6 / interval, channels: ch.map((c) => c.name), units: ch.map((c) => c.unit), sweeps: nsw, mode };
}

export interface NwbSeries { name: string; data: number[][]; rate: number; start: number; unit: string; timestamps?: number[] }
const find = (g: H5Group, name: string): H5Object | undefined => g.children().find((c) => c.name === name);
const scalar = (o: H5Object | undefined): number | undefined => (o?.kind === 'dataset' ? numbers(o.read(), o.type)[0] : undefined);
const attrNum = (o: H5Object, k: string, d: number) => { const v = o.attrs.get(k); return Array.isArray(v) && v.length ? v[0] : d; };
/** Every time series under /acquisition (and /stimulus/presentation): data[channel][sample], in the file's unit. */
export function readNwb(b: Uint8Array, limit = 20_000_000): NwbSeries[] {
  const f = new H5File(b), root = f.root(), out: NwbSeries[] = [];
  const groups = ['acquisition', 'stimulus/presentation'].map((p) => p.split('/').reduce<H5Object | undefined>((g, k) => (g?.kind === 'group' ? find(g, k) : undefined), root));
  let used = 0;
  for (const g of groups) {
    if (g?.kind !== 'group') continue;
    for (const s of g.children()) {
      if (s.kind !== 'group') continue;
      const d = find(s, 'data');
      if (d?.kind !== 'dataset' || !(d.type.cls === 0 || d.type.cls === 1)) continue;
      const n = d.dims.reduce((a, x) => a * x, 1);
      used += n;
      if (used > limit) throw new Error('Over 20 million values: the file is too big to open here.');
      const v = numbers((d as H5Dataset).read(), d.type), conv = attrNum(d, 'conversion', 1), off = attrNum(d, 'offset', 0);
      const rows = d.dims[0] ?? 1, cols = d.dims.length > 1 ? n / rows : 1;
      const data = Array.from({ length: cols }, (_, c) => Array.from({ length: rows }, (_, i) => v[i * cols + c] * conv + off));
      const st = find(s, 'starting_time'), ts = find(s, 'timestamps'), unit = d.attrs.get('unit');
      const series: NwbSeries = { name: s.name, data, rate: st ? attrNum(st, 'rate', NaN) : NaN, start: scalar(st) ?? 0, unit: typeof unit === 'string' ? unit : '' };
      if (ts?.kind === 'dataset') { series.timestamps = numbers(ts.read(), ts.type); series.start = series.timestamps[0] ?? 0; if (series.timestamps.length > 1) series.rate = (series.timestamps.length - 1) / (series.timestamps[series.timestamps.length - 1] - series.timestamps[0]); }
      out.push(series);
    }
  }
  if (!out.length) throw new Error('No time series under /acquisition: is this an NWB 2 file?');
  return out;
}
