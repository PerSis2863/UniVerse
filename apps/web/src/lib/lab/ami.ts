import { LabError } from './parse';
import { b64ToF64, f64ToB64, native, nativePlatform } from './native';
import { fftConvolve } from './si';
import type { Analog } from './ibis-analog';

// IBIS-AMI models in Hyperion (M577, the owner, 27 Nov: IBIS-AMI "for the Hyperion download app which can do it"). A chip
// maker ships an equaliser as a compiled library plus an .ami text file describing its settings (IBIS 7.2, chapter
// 10). Here: the .ami file read (its parameter tree, the reserved flags that say which flows the model supports), the
// settings string AMI_Init takes, built from the defaults and the person's choices (checked against their lists and
// ranges), and the two flows the standard defines: statistical (the channel's impulse response equalised by each
// model's AMI_Init) and time-domain (a bit pattern through the transmitter's AMI_GetWave, the channel and the
// receiver's AMI_GetWave). The libraries themselves run in the computer app (native.ts).

export interface Node { name: string; items: (Node | string)[] }
/** The .ami file's tree: parentheses, "strings", words; | starts a comment to the end of the line. */
export function parseAmi(text: string): Node {
  const tokens: string[] = [];
  const src = text.replace(/\|[^\n]*/g, ' ');
  for (let i = 0; i < src.length;) {
    const ch = src[i];
    if (ch === '(' || ch === ')') { tokens.push(ch); i++; }
    else if (/\s/.test(ch)) i++;
    else if (ch === '"') { const j = src.indexOf('"', i + 1); if (j < 0) throw new LabError('The .ami file has a string that never ends.'); tokens.push(src.slice(i, j + 1)); i = j + 1; }
    else { let j = i; while (j < src.length && !/[\s()]/.test(src[j])) j++; tokens.push(src.slice(i, j)); i = j; }
  }
  let k = 0;
  const node = (): Node => {
    if (tokens[k++] !== '(') throw new LabError('The .ami file must start with "(" (an IBIS-AMI parameter tree).');
    const name = tokens[k++];
    if (!name || name === '(' || name === ')') throw new LabError('The .ami file has a branch without a name.');
    const items: (Node | string)[] = [];
    while (k < tokens.length && tokens[k] !== ')') items.push(tokens[k] === '(' ? node() : tokens[k++]);
    if (tokens[k++] !== ')') throw new LabError('The .ami file has a "(" that is never closed.');
    return { name, items };
  };
  return node();
}

export interface Param { path: string[]; name: string; usage: string; type: string; value?: string; list?: string[]; range?: [number, number, number]; description: string }
export interface AmiInfo { root: string; params: Param[]; reservedParams?: Param[]; bci?: { protocol: string; interval: number; training: number }; reserved: Record<string, string>; initReturnsImpulse: boolean; getWaveExists: boolean; ignoreBits: number; modulation: string; maxAggressors: number }

const kids = (n: Node) => n.items.filter((x): x is Node => typeof x !== 'string');
const words = (n: Node) => n.items.filter((x): x is string => typeof x === 'string');
const unq = (s: string) => (s.length > 1 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);
/** A parameter leaf: its usage, type, default and allowed values (the newer and the older "Format" ways). */
function leaf(n: Node, path: string[]): Param {
  const get = (k: string) => kids(n).find((c) => c.name.toLowerCase() === k.toLowerCase());
  const usage = get('Usage') ? words(get('Usage')!)[0] : 'Info', type = get('Type') ? words(get('Type')!)[0] : 'Float';
  const p: Param = { path, name: n.name, usage, type, description: get('Description') ? unq(words(get('Description')!).join(' ')) : '' };
  const fmt = get('Format'), fw = fmt ? words(fmt) : [];
  const listW = get('List') ? words(get('List')!) : fw[0] === 'List' ? fw.slice(1) : null;
  const rangeW = get('Range') ? words(get('Range')!) : fw[0] === 'Range' ? fw.slice(1) : null;
  const valueW = get('Value') ? words(get('Value')!) : fw[0] === 'Value' ? fw.slice(1) : null;
  if (listW) p.list = listW;
  if (rangeW && rangeW.length >= 3) p.range = [Number(rangeW[0]), Number(rangeW[1]), Number(rangeW[2])];
  p.value = get('Default') ? words(get('Default')!)[0] : valueW ? valueW.join(' ') : p.range ? String(p.range[0]) : listW ? listW[0] : undefined;
  return p;
}
/** Every parameter of a model (leaves under Reserved_Parameters and Model_Specific) and the reserved flags. */
export function readAmi(text: string): AmiInfo {
  const root = parseAmi(text), params: Param[] = [], reservedParams: Param[] = [], reserved: Record<string, string> = {};
  const walk = (n: Node, path: string[], section: string) => {
    const isLeaf = kids(n).some((c) => /^(usage|type|format)$/i.test(c.name));
    if (isLeaf) { const p = leaf(n, path); if (section === 'Reserved_Parameters') { reserved[p.name] = p.value ?? ''; reservedParams.push(p); } else params.push(p); return; }
    for (const c of kids(n)) if (!/^description$/i.test(c.name)) walk(c, [...path, c.name], section);
  };
  for (const sec of kids(root)) if (/^(reserved_parameters|model_specific)$/i.test(sec.name)) for (const c of kids(sec)) walk(c, [c.name], /model_specific/i.test(sec.name) ? 'Model_Specific' : 'Reserved_Parameters');
  const flag = (k: string) => /^true$/i.test(unq(reserved[k] ?? ''));
  const ignore = Number(reserved.Ignore_Bits), maxAgg = Number(reserved.Max_Init_Aggressors);
  const bciInterval = Number(reserved.BCI_Message_Interval_UI), bciTraining = Number(reserved.BCI_Training_UI);
  const bci = reserved.BCI_Protocol ? { protocol: unq(reserved.BCI_Protocol), interval: bciInterval > 0 ? Math.round(bciInterval) : 1024, training: bciTraining >= 0 ? Math.round(bciTraining) : 0 } : undefined;
  return { root: root.name, params, reservedParams, ...(bci ? { bci } : {}), reserved, initReturnsImpulse: flag('Init_Returns_Impulse') || (!('Init_Returns_Impulse' in reserved) && flag('Use_Init_Output')), getWaveExists: flag('GetWave_Exists'), ignoreBits: Number.isFinite(ignore) && ignore > 0 ? Math.round(ignore) : 0, modulation: unq(reserved.Modulation ?? 'NRZ').toUpperCase(), maxAggressors: Number.isFinite(maxAgg) && maxAgg >= 0 ? Math.round(maxAgg) : 16 };
}

/** The settings string AMI_Init takes, (root (name value) (branch (name value))), for the In and InOut parameters:
 * each its default, or the person's choice (given by its name, or its path joined with dots) checked against its list
 * or range. Strings go in quotes. Names chosen that the model doesn't have are refused. */
export function paramString(m: AmiInfo, choices: Map<string, string>): string {
  const used = new Set<string>(), pick = (p: Param) => {
    const key = [...choices.keys()].find((k) => k === p.path.join('.') || k === p.name);
    if (key === undefined) return p.value;
    used.add(key);
    const v = choices.get(key)!;
    if (p.list && !p.list.some((x) => unq(x) === unq(v) || Number(x) === Number(v))) throw new LabError(`${p.name} is one of ${p.list.join(', ')}.`);
    if (p.range && !(Number(v) >= p.range[1] && Number(v) <= p.range[2])) throw new LabError(`${p.name} is between ${p.range[1]} and ${p.range[2]}.`);
    if (/^integer$/i.test(p.type) && !Number.isInteger(Number(v))) throw new LabError(`${p.name} is a whole number.`);
    return v;
  };
  type T = Map<string, T | string>;
  const tree: T = new Map();
  for (const p of [...(m.reservedParams ?? []), ...m.params]) {
    if (!/^(in|inout)$/i.test(p.usage)) continue;
    // The tool names the back-channel link (M579): both ends get the same BCI_ID, files in a folder of their own.
    const v = p.name === 'BCI_ID' && ![...choices.keys()].includes('BCI_ID') ? 'hyperion_link' : pick(p);
    if (v === undefined) continue;
    let at = tree;
    for (const seg of p.path.slice(0, -1)) { if (!at.has(seg)) at.set(seg, new Map()); at = at.get(seg) as T; }
    at.set(p.name, /^string$/i.test(p.type) ? `"${unq(v)}"` : v);
  }
  const extra = [...choices.keys()].filter((k) => !used.has(k));
  if (extra.length) throw new LabError(`The model has no input parameter called ${extra.join(', ')} (see its list with amiModel and no output).`);
  const write = (t: T): string => [...t].map(([k, v]) => (typeof v === 'string' ? `(${k} ${v})` : `(${k} ${write(v)})`)).join(' ');
  return `(${m.root}${tree.size ? ' ' + write(tree) : ''})`;
}

export interface Model { name: string; file: { name: string; bytes?: string; path?: string }; params: string; info: AmiInfo; analog?: Analog }
export interface Session { impulse: number[]; columns: number[][]; wave?: number[]; clocks: number[]; paramsOut: string; message: string; hasGetWave: boolean }
/** One model session in the computer app: AMI_Init on the impulse matrix (the victim's response then each aggressor's,
 * V/s; at most the model's Max_Init_Aggressors), then AMI_GetWave on the waveform in blocks of 128 UI if one is given
 * and the model has it. Aggressor columns the model wasn't given come back as they went in. */
export function session(m: Model, cols: number[][], dt: number, ui: number, wave?: number[]): Session {
  const rows = cols[0].length, n = Math.min(cols.length - 1, m.info.maxAggressors), flat = new Array(rows * (1 + n));
  for (let c = 0; c <= n; c++) for (let r = 0; r < rows; r++) flat[c * rows + r] = cols[c][r] ?? 0;
  const r = native('ami', { executable: m.file, params: m.params, impulse: f64ToB64(flat), rows, aggressors: n, dt, ui, ...(wave ? { wave: f64ToB64(wave), block: Math.round((128 * ui) / dt) } : {}) });
  const back = b64ToF64(String(r.impulse)), columns = cols.map((col, c) => (c <= n ? back.slice(c * rows, (c + 1) * rows) : col));
  return { impulse: columns[0], columns, wave: typeof r.wave === 'string' ? b64ToF64(r.wave) : undefined, clocks: typeof r.clocks === 'string' ? b64ToF64(r.clocks) : [], paramsOut: String(r.paramsOut ?? ''), message: String(r.message ?? ''), hasGetWave: !!r.hasGetWave };
}

/** A neighbouring line's coupling into the victim: its impulse response (V/s) and, in the time-domain flow, its signal;
 * `inner` (M588) the index of the line just inside it on the same side, the two leaking into each other in a link. */
export interface Aggressor { h: number[]; x?: number[]; inner?: number }
export interface FlowOut { h: number[]; hTx: number[]; hRx: number[]; aggRx: number[][]; z?: number[]; clocks: number[]; messages: string[]; paramsOut: string[]; usedGetWave: [boolean, boolean]; bci?: { protocol: string; history: { ui: number; tx: string; rx: string }[]; files: string[]; lanes: { tx: string; rx: string }[] } }
/**
 * The IBIS flows. Statistical: the impulse matrix (h and the aggressors') → the transmitter's AMI_Init (its output used
 * when Init_Returns_Impulse) → the receiver's AMI_Init: the equalised responses. Time-domain: the transmitter's
 * AMI_GetWave on the stimulus x (or, without GetWave, its Init output as part of the channel), convolved with the
 * channel, the aggressors' signals through their coupling added, then the receiver's AMI_GetWave (or, without it, its
 * Init output convolved), and the receiver's clock times. h in V/s every dt.
 */
export function flow(h: number[], dt: number, ui: number, tx: Model | null, rx: Model | null, x: number[] | null, aggs: Aggressor[] = []): FlowOut {
  const messages: string[] = [], paramsOut: string[] = [];
  const note = (who: string, s: Session) => { if (s.message) messages.push(`${who}: ${s.message}`); if (s.paramsOut) paramsOut.push(`${who}: ${s.paramsOut}`); };
  const cols = [h, ...aggs.map((g) => g.h)], conv = (a: number[], b: number[]) => fftConvolve(a, b).map((v) => v * dt);
  // A back-channel link (M579): both ends speak the same BCI_Protocol and have GetWave: the app runs them in turns.
  if (x && tx && rx && tx.info.bci && rx.info.bci && tx.info.bci.protocol.toLowerCase() === rx.info.bci.protocol.toLowerCase() && tx.info.getWaveExists && rx.info.getWaveExists) {
    // each neighbouring line a trained link of its own (M582): its signal and its coupling go to the app as they are
    const used = aggs.flatMap((g, i) => (g.x ? [i] : [])), lane = (i?: number) => (i === undefined ? -1 : used.indexOf(i) + 1);
    const lanes = used.map((i) => { const g = aggs[i], k = lane(g.inner); return { wave: f64ToB64(Array.from({ length: x.length }, (_, j) => g.x![j] ?? 0)), h: f64ToB64(Array.from({ length: h.length }, (_, j) => g.h[j] ?? 0)), ...(k > 0 ? { inner: k } : {}) }; });
    const r = native('link', { tx: { executable: tx.file, params: tx.params }, rx: { executable: rx.file, params: rx.params }, impulse: f64ToB64(h), rows: h.length, dt, ui, wave: f64ToB64(x), aggs: lanes, interval: Math.max(tx.info.bci.interval, rx.info.bci.interval), training: Math.max(tx.info.bci.training, rx.info.bci.training) });
    const hist = (r.history as { ui: number; tx: string; rx: string }[]) ?? [], said = (r.messages as string[]) ?? [];
    said.forEach((t, i) => { if (t) messages.push(`${[tx.name, rx.name][i]}: ${t}`); });
    ((r.paramsOut as string[]) ?? []).forEach((t, i) => { if (t) paramsOut.push(`${[tx.name, rx.name][i]}: ${t}`); });
    return { h, hTx: h, hRx: h, aggRx: aggs.map((g) => g.h), z: b64ToF64(String(r.wave)), clocks: b64ToF64(String(r.clocks)), messages, paramsOut, usedGetWave: [true, true], bci: { protocol: tx.info.bci.protocol, history: hist, files: (r.files as string[]) ?? [], lanes: (r.lanes as { tx: string; rx: string }[]) ?? [] } };
  }
  const useTxWave = !!(x && tx?.info.getWaveExists);
  const txs = tx ? session(tx, cols, dt, ui, useTxWave ? x! : undefined) : null;
  if (txs) note(tx!.name, txs);
  const txCols = txs && tx!.info.initReturnsImpulse ? txs.columns : cols;
  if (!x) {
    const rxs = rx ? session(rx, txCols, dt, ui) : null;
    if (rxs) note(rx!.name, rxs);
    const out = rxs && rx!.info.initReturnsImpulse ? rxs.columns : txCols;
    return { h, hTx: txCols[0], hRx: out[0], aggRx: out.slice(1), clocks: [], messages, paramsOut, usedGetWave: [false, false] };
  }
  // time domain: what reaches the receiver's pins; the neighbouring lines driven by the same transmitter model, each
  // its own session (M582: its own AMI_GetWave, or its Init-equalised column when the model has no GetWave)
  const sent = useTxWave && txs?.wave ? txs.wave : x, chanCols = useTxWave ? cols : txCols;
  const aggSent = aggs.map((g) => (g.x && useTxWave ? session(tx!, [h], dt, ui, g.x).wave ?? g.x : g.x));
  const atPins = conv(sent, chanCols[0]);
  aggs.forEach((g, i) => { const xs = aggSent[i]; if (xs) conv(xs, chanCols[i + 1]).forEach((v, k) => { if (k < atPins.length) atPins[k] += v; }); });
  const useRxWave = !!rx?.info.getWaveExists;
  const rxs = rx ? session(rx, chanCols, dt, ui, useRxWave ? atPins : undefined) : null;
  if (rxs) note(rx!.name, rxs);
  let z = atPins;
  if (rxs && useRxWave && rxs.wave) z = rxs.wave;
  else if (rxs && rx!.info.initReturnsImpulse) {
    z = conv(sent, rxs.columns[0]);
    aggs.forEach((g, i) => { const xs = aggSent[i]; if (xs) conv(xs, rxs.columns[i + 1]).forEach((v, k) => { if (k < z.length) z[k] += v; }); });
  }
  const out = rxs && rx!.info.initReturnsImpulse ? rxs.columns : chanCols;
  return { h, hTx: txCols[0], hRx: out[0], aggRx: out.slice(1), z, clocks: rxs?.clocks ?? [], messages, paramsOut, usedGetWave: [useTxWave, useRxWave] };
}

export interface Executable { platform: string; os: string; bits: number; lib: string; ami: string; role: string }
export interface IbisModel { name: string; executables: Executable[] }
/** The IBIS file's models that have an [Algorithmic Model]: each Executable line's platform (OS_Compiler_Bits), library
 * and .ami file (Executable_Tx and Executable_Rx too, for repeaters). The comment character may be changed by
 * [Comment Char]. */
export function readIbis(text: string): IbisModel[] {
  let comment = '|', model = '', inAlgo = false;
  const out: IbisModel[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const cc = /^\s*\[comment char\]\s*(\S)_char/i.exec(raw);
    if (cc) { comment = cc[1]; continue; }
    const at = raw.indexOf(comment), line = (at >= 0 ? raw.slice(0, at) : raw).trim();
    if (!line) continue;
    const kw = /^\[([^\]]+)\]\s*(.*)$/.exec(line);
    if (kw) {
      const k = kw[1].trim().toLowerCase().replace(/\s+/g, ' ');
      if (k === 'model') { model = kw[2].split(/\s+/)[0]; inAlgo = false; }
      else if (k === 'algorithmic model') { inAlgo = true; if (!out.some((m) => m.name === model)) out.push({ name: model || '(unnamed)', executables: [] }); }
      else if (k === 'end algorithmic model') inAlgo = false;
      continue;
    }
    if (!inAlgo) continue;
    const w = line.split(/\s+/);
    if (/^executable(_tx|_rx)?$/i.test(w[0]) && w.length >= 4) {
      const parts = w[1].split('_'), bits = Number(parts[parts.length - 1]);
      out.find((m) => m.name === model)!.executables.push({ platform: w[1], os: parts[0].toLowerCase(), bits: Number.isFinite(bits) ? bits : 0, lib: w[2], ami: w[3], role: /_tx$/i.test(w[0]) ? 'tx' : /_rx$/i.test(w[0]) ? 'rx' : '' });
    }
  }
  return out;
}
const OS: Record<string, string> = { win32: 'windows', linux: 'linux', darwin: 'mac' };
/** The executable for this computer: its system, 64-bit first (32-bit models run through the app's 32-bit helper);
 * in a browser the first Windows or Linux one, so its settings can still be listed. */
export function pickExecutable(m: IbisModel, role = ''): Executable {
  const here = nativePlatform(), os = here ? OS[here.platform] ?? here.platform : null;
  const fit = m.executables.filter((e) => (!role || !e.role || e.role === role) && (os ? e.os === os || (os === 'mac' && /^(mac|macos|osx|darwin)/.test(e.os)) : true));
  const best = fit.sort((a, b) => (b.bits === 64 ? 1 : 0) - (a.bits === 64 ? 1 : 0))[0];
  if (!best) throw new LabError(`The model ${m.name} has no library for ${os ?? 'this computer'} (it has: ${m.executables.map((e) => e.platform).join(', ') || 'none'}).`);
  return best;
}
