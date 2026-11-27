// Hyperion's S-parameters (M571, the owner, 27 Nov: "do all these": a measured channel in place of the loss model).
// Touchstone files (.s1p … .s<N>p, versions 1.x and 2.0: Hz/kHz/MHz/GHz, RI/MA/DB, S parameters, the 2-port column
// order of version 1), writing them back, mixed-mode (a differential pair's SDD from a 4-port), and a channel's
// transfer function on any frequency grid for the link (its bulk delay taken out, DC and the band's top filled in).

export interface SParams { f: number[]; n: number; re: Float64Array; im: Float64Array; z0: number }
/** S(i, j) at frequency k (0-based): index into re/im. */
export const at = (s: SParams, i: number, j: number, k: number) => (k * s.n + i) * s.n + j;

const UNITS: Record<string, number> = { hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9 };
/** Reads a Touchstone file; `ports` from its name (.s4p) when the file (version 1) doesn't say. */
export function readTouchstone(text: string, ports?: number): SParams {
  let unit = 1e9, fmt = 'ma', z0 = 50, v2 = false, order21 = false, n = ports ?? 0, param = 's';
  const nums: number[] = [];
  let inData = true;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/!.*$/, '').trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const t = line.slice(1).trim().toLowerCase().split(/\s+/);
      for (let i = 0; i < t.length; i++) {
        if (UNITS[t[i]]) unit = UNITS[t[i]];
        else if (['ri', 'ma', 'db'].includes(t[i])) fmt = t[i];
        else if (['s', 'y', 'z', 'h', 'g'].includes(t[i])) param = t[i];
        else if (t[i] === 'r' && t[i + 1]) { z0 = +t[i + 1]; i++; }
      }
      continue;
    }
    const kw = /^\[([^\]]+)\]\s*(.*)$/.exec(line);
    if (kw) {
      const k = kw[1].toLowerCase(), v = kw[2].trim().toLowerCase();
      if (k === 'version') v2 = true;
      else if (k === 'number of ports') n = +v;
      else if (k === 'two-port data order') order21 = v === '21_12';
      else if (k === 'network data') inData = true;
      else if (k === 'end') inData = false;
      else if (['number of frequencies', 'reference', 'matrix format', 'mixed-mode order', 'begin information', 'end information', 'noise data'].includes(k)) inData = !['begin information', 'noise data'].includes(k);
      continue;
    }
    if (!inData) continue;
    for (const w of line.split(/\s+/)) { const x = Number(w); if (!Number.isFinite(x)) throw new Error(`Touchstone: “${w}” isn't a number.`); nums.push(x); }
  }
  if (param !== 's') throw new Error('Touchstone: only S-parameter files (not Y, Z, H or G).');
  if (!(n >= 1 && n <= 32)) throw new Error('Touchstone: say how many ports (the file’s name .s2p, .s4p…, or [Number of Ports]).');
  const per = 1 + 2 * n * n;
  if (nums.length % per) throw new Error(`Touchstone: the numbers don't come in rows of ${per} for ${n} ports.`);
  const nf = nums.length / per, re = new Float64Array(nf * n * n), im = new Float64Array(nf * n * n), f: number[] = [];
  for (let k = 0; k < nf; k++) {
    const row = nums.slice(k * per, (k + 1) * per);
    f.push(row[0] * unit);
    for (let q = 0; q < n * n; q++) {
      let i = Math.floor(q / n), j = q % n;
      // version 1's 2-port data is S11 S21 S12 S22 (and 2.0 when its order is 21_12)
      if (n === 2 && (!v2 || order21)) { i = q % 2; j = Math.floor(q / 2); }
      const a = row[1 + 2 * q], b = row[2 + 2 * q], o = at({ n } as SParams, i, j, k);
      if (fmt === 'ri') { re[o] = a; im[o] = b; }
      else { const m = fmt === 'db' ? 10 ** (a / 20) : a, ph = b * Math.PI / 180; re[o] = m * Math.cos(ph); im[o] = m * Math.sin(ph); }
    }
  }
  if (f.some((x, k) => k && x <= f[k - 1])) throw new Error('Touchstone: the frequencies must increase.');
  return { f, n, re, im, z0 };
}
/** A Touchstone 1.1 file (Hz, RI), 2-ports in version 1's column order. */
export function writeTouchstone(s: SParams, comment = 'Hyperion'): string {
  const lines = [`! ${comment}`, `# Hz S RI R ${s.z0}`];
  for (let k = 0; k < s.f.length; k++) {
    const v = (i: number, j: number) => { const o = at(s, i, j, k); return [s.re[o].toExponential(9), s.im[o].toExponential(9)]; };
    const f = s.f[k].toExponential(9);
    if (s.n <= 2) { lines.push([f, ...(s.n === 1 ? v(0, 0) : [...v(0, 0), ...v(1, 0), ...v(0, 1), ...v(1, 1)])].join(' ')); continue; }
    // larger: each matrix row on its own lines, at most four values (eight numbers) a line
    for (let i = 0; i < s.n; i++) {
      const row = Array.from({ length: s.n }, (_, j) => v(i, j)).flat();
      for (let c = 0; c < row.length; c += 8) lines.push(`${i === 0 && c === 0 ? f : ' '.repeat(f.length)} ${row.slice(c, c + 8).join(' ')}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
/** The differential (SDD) 2-port of a 4-port: pairs [[p, n] at side 1, [p, n] at side 2] (0-based; by default ports
 *  1 & 3 at one end, 2 & 4 at the other, as the odd/even numbering of a through channel). */
export function sdd(s: SParams, pairs: [[number, number], [number, number]] = [[0, 2], [1, 3]]): SParams {
  if (s.n !== 4) throw new Error('Mixed-mode needs a 4-port.');
  const nf = s.f.length, re = new Float64Array(nf * 4), im = new Float64Array(nf * 4);
  for (let k = 0; k < nf; k++) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
    const [pa, na] = pairs[a], [pb, nb] = pairs[b];
    let r = 0, i = 0;
    for (const [x, y, sg] of [[pa, pb, 1], [pa, nb, -1], [na, pb, -1], [na, nb, 1]] as const) { const o = at(s, x, y, k); r += sg * s.re[o]; i += sg * s.im[o]; }
    const o = at({ n: 2 } as SParams, a, b, k); re[o] = r / 2; im[o] = i / 2;
  }
  return { f: s.f, n: 2, re, im, z0: 2 * s.z0 };
}
/** The through transfer function (S21 of a 2-port, or of the SDD of a 4-port) at frequencies `fq` (Hz, from 0): the
 *  magnitude (dB) and unwrapped phase interpolated, the bulk delay taken out (the link keeps `keep` seconds of it), the
 *  lowest point held to DC, and past the file's top the loss carried on along its last slope. */
export function throughAt(s0: SParams, fq: number[], keep: number) {
  const s = s0.n === 4 ? sdd(s0) : s0;
  if (s.n !== 2) throw new Error('A channel is a 2-port (S21) or a 4-port (its differential SDD21).');
  const nf = s.f.length, db: number[] = [], ph: number[] = [];
  for (let k = 0; k < nf; k++) { const o = at(s, 1, 0, k); db.push(20 * Math.log10(Math.max(1e-15, Math.hypot(s.re[o], s.im[o])))); ph.push(Math.atan2(s.im[o], s.re[o])); }
  for (let k = 1; k < nf; k++) { let d = ph[k] - ph[k - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; ph[k] = ph[k - 1] + d; }
  // the bulk delay: the phase’s straight line through the origin, fitted over the band (−2πfτ)
  let sxx = 0, sxy = 0;
  for (let k = 0; k < nf; k++) { sxx += s.f[k] * s.f[k]; sxy += s.f[k] * ph[k]; }
  const fit = -(sxy / sxx) / (2 * Math.PI);
  // a passive channel delays; a phase that seems to run ahead means it turned over half a turn between two points
  if (fit < -1e-12) throw new Error('The channel’s frequency points are too far apart for its delay (its phase turns over half a turn between points): use a file with finer steps.');
  const tau = Math.max(0, fit), shift = Math.max(0, tau - keep);
  const slope = nf > 2 ? (db[nf - 1] - db[nf - 3]) / (s.f[nf - 1] - s.f[nf - 3]) : 0;
  const re: number[] = [], im: number[] = [];
  for (const x of fq) {
    let d: number, p: number;
    if (x <= s.f[0]) { d = db[0]; p = s.f[0] > 0 ? ph[0] * x / s.f[0] : ph[0]; }
    else if (x >= s.f[nf - 1]) { d = db[nf - 1] + Math.min(0, slope) * (x - s.f[nf - 1]); p = ph[nf - 1] - 2 * Math.PI * tau * (x - s.f[nf - 1]); }
    else { let k = 1; while (s.f[k] < x) k++; const w = (x - s.f[k - 1]) / (s.f[k] - s.f[k - 1]); d = db[k - 1] + w * (db[k] - db[k - 1]); p = ph[k - 1] + w * (ph[k] - ph[k - 1]); }
    p += 2 * Math.PI * x * shift; // take out the bulk delay beyond `keep`
    const m = 10 ** (Math.max(-200, d) / 20); re.push(m * Math.cos(p)); im.push(m * Math.sin(p));
  }
  return { re, im, delay: tau, removed: shift };
}
/** A channel with `loss` dB at fN (half skin effect, half dielectric, a minimum-phase-like delay of `delay` s), as
 *  S-parameters up to fmax: for trying a Touchstone path without a measured file. */
export function lossyLine(loss: number, fN: number, fmax: number, delay = 2e-9, nf = 2000, z0 = 50): SParams {
  const f = Array.from({ length: nf }, (_, k) => (fmax * (k + 1)) / nf), re = new Float64Array(nf * 4), im = new Float64Array(nf * 4);
  const aN = loss / 20 * Math.LN10;
  f.forEach((x, k) => {
    const a = aN * (0.5 * Math.sqrt(x / fN) + 0.5 * x / fN), m = Math.exp(-a), p = -2 * Math.PI * x * delay - aN * 0.5 * Math.sqrt(x / fN); // skin effect's phase equals its loss (nepers ↔ radians)
    for (const [i, j] of [[1, 0], [0, 1]]) { const o = at({ n: 2 } as SParams, i, j, k); re[o] = m * Math.cos(p); im[o] = m * Math.sin(p); }
  });
  return { f, n: 2, re, im, z0 };
}
