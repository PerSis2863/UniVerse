// Hyperion's reader for SPICE raw files (M569): what ngspice, Xyce and Spectre (nutascii) write, text ("Values:") or
// binary ("Binary:", little-endian doubles), one plot after another, real or complex. Plain, so tools and tests use it.

const dec = new TextDecoder();
/** A SPICE raw file (ngspice, Xyce, Spectre's nutascii; text or binary) as its plots: variables, real or complex. */
export function parseRaw(bytes: Uint8Array) {
  const plots: { name: string; vars: string[]; complex: boolean; data: { re: number[]; im?: number[] }[] }[] = [];
  let at = 0;
  const line = () => { const e = bytes.indexOf(10, at); const s = dec.decode(bytes.subarray(at, e < 0 ? bytes.length : e)).replace(/\r$/, ''); at = e < 0 ? bytes.length : e + 1; return s; };
  while (at < bytes.length) {
    let name = '', flags = '', nv = 0, np = 0; const vars: string[] = [];
    let mode: 'binary' | 'values' | '' = '';
    while (at < bytes.length) {
      const l = line(), m = /^([A-Za-z. ]+):\s*(.*)$/.exec(l);
      if (!m) continue;
      const k = m[1].trim().toLowerCase();
      if (k === 'plotname') name = m[2].trim();
      else if (k === 'flags') flags = m[2].toLowerCase();
      else if (k === 'no. variables') nv = +m[2];
      else if (k === 'no. points') np = +m[2];
      else if (k === 'variables') { const first = m[2].trim(); const rows = first ? [first] : []; while (rows.length < nv) rows.push(line()); for (const r of rows) vars.push(r.trim().split(/\s+/)[1] ?? `v${vars.length}`); }
      else if (k === 'binary') { mode = 'binary'; break; }
      else if (k === 'values') { mode = 'values'; break; }
    }
    if (!mode) break;
    if (!(nv > 0 && np >= 0 && nv <= 10_000 && np <= 50_000_000)) throw new Error('rawread: this isn’t a SPICE raw file Hyperion understands.');
    const complex = flags.includes('complex'), data = vars.map(() => ({ re: new Array<number>(np), ...(complex ? { im: new Array<number>(np) } : {}) }));
    if (mode === 'binary') {
      const w = complex ? 16 : 8, need = np * nv * w;
      if (at + need > bytes.length) throw new Error('rawread: the file ends early.');
      const dv = new DataView(bytes.buffer, bytes.byteOffset + at, need);
      for (let p = 0; p < np; p++) for (let v = 0; v < nv; v++) { const o2 = (p * nv + v) * w; data[v].re[p] = dv.getFloat64(o2, true); if (complex) data[v].im![p] = dv.getFloat64(o2 + 8, true); }
      at += need;
    } else {
      // "point\tvalue" then a value a line; complex values as re,im
      const nums: string[] = [];
      while (nums.length < np * nv && at < bytes.length) { const t = line().trim(); if (!t) continue; const parts = t.split(/\s+/); nums.push(parts.length > 1 && nums.length % nv === 0 ? parts[1] : parts[parts.length - 1]); }
      nums.forEach((t, i) => { const p = Math.floor(i / nv), v = i % nv, [re, im] = t.split(','); data[v].re[p] = +re; if (complex) data[v].im![p] = +(im ?? 0); });
    }
    plots.push({ name, vars, complex, data });
  }
  if (!plots.length) throw new Error('rawread: no plots in this raw file.');
  return plots;
}
