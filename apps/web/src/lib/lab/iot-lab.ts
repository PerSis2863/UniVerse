import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf } from './interp';
import { mat, num, str, toMat, type Cell, type Value } from './values';
import { askPage } from './wait';

// Hyperion's IoT channels in the language (M522): iotread reads a channel's newest readings while the script runs
// (asked of the page, which is signed in; it needs a page that lets the engine wait, M521: Chrome, Edge, Firefox or
// the computer app); iotwrite sends a reading with the channel's write key, as a device would (straight from the
// engine's thread, so it works in every browser). Channels are made in Signals → IoT.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const opts = (a: Value[], from: number) => {
  const o = new Map<string, Value>();
  for (let i = from; i + 1 < a.length; i += 2) o.set(textOf(a[i]).toLowerCase(), a[i + 1]);
  return o;
};
interface Reading { at: string; values: (number | null)[] }
export interface IotAnswer { fields: string[]; entries: Reading[] }

def('iotread', (a) => {
  if (!a[0]) throw new LabError("iotread needs a channel: its name or number, as in iotread('Greenhouse').");
  const o = opts(a, 1), n = o.has('numpoints') ? Math.round(toMat(o.get('numpoints')!).d[0]) : 100;
  if (!(n >= 1 && n <= 2000)) throw new LabError('NumPoints is 1 to 2000.');
  const r = askPage<IotAnswer>('iot', { channel: textOf(a[0]), n }, 15_000);
  if (!r) throw new LabError('Reading a channel while a script runs needs Chrome, Edge, Firefox or Hyperion’s computer app (here the engine can’t wait). Elsewhere: Signals → IoT → Save for scripts, then readtable the file.');
  const want = o.has('fields') ? [...toMat(o.get('fields')!).d].map((f) => Math.round(f)) : r.fields.map((_, i) => i + 1);
  for (const f of want) if (!(f >= 1 && f <= r.fields.length)) throw new LabError(`The channel has fields 1 to ${r.fields.length}.`);
  const rows = r.entries.length, data = new Float64Array(rows * want.length), t = new Float64Array(rows);
  r.entries.forEach((e, i) => { t[i] = Date.parse(e.at) / 1000; want.forEach((f, j) => { data[i + j * rows] = e.values[f - 1] ?? NaN; }); });
  const names: Cell = { k: 'cell', r: 1, c: want.length, d: want.map((f) => str(r.fields[f - 1])) };
  return [mat(rows, want.length, data), mat(rows, 1, t), names];
});

def('iotwrite', (a) => {
  const key = a[0] ? textOf(a[0]).trim() : '';
  if (!/^[A-Z2-9]{20}$/.test(key)) throw new LabError("iotwrite needs the channel's write key (20 letters and digits, shown when the channel was made): iotwrite(key, [21.5 40]).");
  const v = toMat(a[1] ?? mat(0, 0), 'The reading');
  if (!v.d.length || v.d.length > 8) throw new LabError('Send 1 to 8 numbers: one per field.');
  if (typeof XMLHttpRequest === 'undefined') throw new LabError('Readings can’t be sent from here.');
  const body: Record<string, number> = {};
  v.d.forEach((x, i) => { if (Number.isFinite(x)) body[`field${i + 1}`] = x; });
  const x = new XMLHttpRequest();
  // Synchronous: allowed on the engine's own thread, so the script goes on only once the channel has answered.
  x.open('POST', `/api/core/iot/write/${key}`, false);
  x.setRequestHeader('Content-Type', 'application/json');
  try { x.send(JSON.stringify(body)); } catch { throw new LabError('The reading couldn’t be sent (offline?).'); }
  let r: { ok?: boolean; entry?: number; error?: string; message?: string } = {};
  try { r = JSON.parse(x.responseText); } catch { /* not JSON: told by the status below */ }
  if (x.status >= 400) throw new LabError(r.message ?? r.error ?? `The channel said ${x.status}.`);
  return [{ k: 'struct', f: new Map<string, Value>([['ok', { ...num(r.ok ? 1 : 0), logical: true }], ['entry', num(r.entry ?? NaN)], ['message', str(r.error ?? '')]]) }];
});
