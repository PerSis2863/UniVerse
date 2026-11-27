import { LabError } from './parse';
import { b64ToF64, f64ToB64, native } from './native';
import { fftConvolve } from './si';

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
export interface AmiInfo { root: string; params: Param[]; reserved: Record<string, string>; initReturnsImpulse: boolean; getWaveExists: boolean; ignoreBits: number; modulation: string }

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
  const root = parseAmi(text), params: Param[] = [], reserved: Record<string, string> = {};
  const walk = (n: Node, path: string[], section: string) => {
    const isLeaf = kids(n).some((c) => /^(usage|type|format)$/i.test(c.name));
    if (isLeaf) { const p = leaf(n, path); if (section === 'Reserved_Parameters') reserved[p.name] = p.value ?? ''; else params.push(p); return; }
    for (const c of kids(n)) if (!/^description$/i.test(c.name)) walk(c, [...path, c.name], section);
  };
  for (const sec of kids(root)) if (/^(reserved_parameters|model_specific)$/i.test(sec.name)) for (const c of kids(sec)) walk(c, [c.name], /model_specific/i.test(sec.name) ? 'Model_Specific' : 'Reserved_Parameters');
  const flag = (k: string) => /^true$/i.test(unq(reserved[k] ?? ''));
  const ignore = Number(reserved.Ignore_Bits);
  return { root: root.name, params, reserved, initReturnsImpulse: flag('Init_Returns_Impulse') || (!('Init_Returns_Impulse' in reserved) && flag('Use_Init_Output')), getWaveExists: flag('GetWave_Exists'), ignoreBits: Number.isFinite(ignore) && ignore > 0 ? Math.round(ignore) : 0, modulation: unq(reserved.Modulation ?? 'NRZ').toUpperCase() };
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
  for (const p of m.params) {
    if (!/^(in|inout)$/i.test(p.usage)) continue;
    const v = pick(p);
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

export interface Model { name: string; file: { name: string; bytes?: string; path?: string }; params: string; info: AmiInfo }
export interface Session { impulse: number[]; wave?: number[]; clocks: number[]; paramsOut: string; message: string; hasGetWave: boolean }
/** One model session in the computer app: AMI_Init on the impulse response (V/s), then AMI_GetWave on the waveform in
 * blocks of 128 UI if one is given and the model has it. */
export function session(m: Model, h: number[], dt: number, ui: number, wave?: number[]): Session {
  const r = native('ami', { executable: m.file, params: m.params, impulse: f64ToB64(h), rows: h.length, aggressors: 0, dt, ui, ...(wave ? { wave: f64ToB64(wave), block: Math.round((128 * ui) / dt) } : {}) });
  return { impulse: b64ToF64(String(r.impulse)), wave: typeof r.wave === 'string' ? b64ToF64(r.wave) : undefined, clocks: typeof r.clocks === 'string' ? b64ToF64(r.clocks) : [], paramsOut: String(r.paramsOut ?? ''), message: String(r.message ?? ''), hasGetWave: !!r.hasGetWave };
}

export interface FlowOut { h: number[]; hTx: number[]; hRx: number[]; z?: number[]; clocks: number[]; messages: string[]; paramsOut: string[]; usedGetWave: [boolean, boolean] }
/**
 * The IBIS flows. Statistical: h → the transmitter's AMI_Init (its output used when Init_Returns_Impulse) → the
 * receiver's AMI_Init: the equalised impulse response. Time-domain: the transmitter's AMI_GetWave on the stimulus x (or,
 * without GetWave, its Init output as part of the channel), convolved with the channel, then the receiver's
 * AMI_GetWave (or, without it, its Init output convolved), and the receiver's clock times. h in V/s every dt.
 */
export function flow(h: number[], dt: number, ui: number, tx: Model | null, rx: Model | null, x: number[] | null): FlowOut {
  const messages: string[] = [], paramsOut: string[] = [];
  const note = (who: string, s: Session) => { if (s.message) messages.push(`${who}: ${s.message}`); if (s.paramsOut) paramsOut.push(`${who}: ${s.paramsOut}`); };
  const useTxWave = !!(x && tx?.info.getWaveExists);
  const txs = tx ? session(tx, h, dt, ui, useTxWave ? x! : undefined) : null;
  if (txs) note(tx!.name, txs);
  const hTx = txs && tx!.info.initReturnsImpulse ? txs.impulse : h;
  if (!x) {
    const rxs = rx ? session(rx, hTx, dt, ui) : null;
    if (rxs) note(rx!.name, rxs);
    return { h, hTx, hRx: rxs && rx!.info.initReturnsImpulse ? rxs.impulse : hTx, clocks: [], messages, paramsOut, usedGetWave: [false, false] };
  }
  // time domain: what reaches the receiver's pins
  const sent = useTxWave && txs?.wave ? txs.wave : x, chan = useTxWave ? h : hTx;
  const atPins = fftConvolve(sent, chan).map((v) => v * dt);
  const useRxWave = !!rx?.info.getWaveExists;
  const rxs = rx ? session(rx, chan, dt, ui, useRxWave ? atPins : undefined) : null;
  if (rxs) note(rx!.name, rxs);
  let z = atPins;
  if (rxs && useRxWave && rxs.wave) z = rxs.wave;
  else if (rxs && rx!.info.initReturnsImpulse) z = fftConvolve(sent, rxs.impulse).map((v) => v * dt);
  return { h, hTx, hRx: rxs && rx!.info.initReturnsImpulse ? rxs.impulse : chan, z, clocks: rxs?.clocks ?? [], messages, paramsOut, usedGetWave: [useTxWave, useRxWave] };
}
