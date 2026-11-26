import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf } from './interp';
import { mat, num, str, toMat, type Cell, type Mat, type Struct, type Value } from './values';
import { askPage } from './wait';
import { cast } from './types';
import { writeFileBytes } from './files';
import { fromJs, toJs } from './data-lab';
import './wireless-lab'; // read and write are wrapped below
import './plot'; // axis and close too

// Hyperion on the web and with game controllers (M560, the GNU Octave packages' fifth wave, written fresh): webread,
// webwrite, websave and weboptions like MATLAB's; mqttclient with subscribe, write, read and peek (MATLAB's Industrial
// Communication names) over secure WebSockets; vrjoystick with read, axis, button and caps. The engine's thread asks
// the page and waits (M521). The page asks the person once per site before anything goes there, and other sites are
// reached from a sealed frame with nothing of this site's (src/components/lab/net-link.ts). A browser can't open raw
// TCP or UDP sockets, so tcpclient and udpport aren't here.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const NEED = 'The web functions need the Code window open in a browser that can wait for them (Chrome, Edge or Firefox).';
function ask<T>(kind: string, body: unknown, ms: number): T {
  const r = askPage<T>(kind, body, ms);
  if (r === null) throw new LabError(NEED);
  return r;
}
const is = (v: Value | undefined, mark: string): v is Struct => v?.k === 'struct' && v.f.has(mark);
const fieldText = (s: Struct, f: string) => { const v = s.f.get(f); return v ? textOf(v) : ''; };
const enc = new TextEncoder(), dec = new TextDecoder();

// ——— weboptions ———
const OPTION_NAMES = ['Timeout', 'ContentType', 'MediaType', 'RequestMethod', 'HeaderFields', 'Username', 'Password', 'CharacterEncoding', 'KeyName', 'KeyValue'];
function defaultOptions(): Struct {
  return { k: 'struct', f: new Map<string, Value>([
    ['Timeout', num(15)], ['ContentType', str('auto')], ['MediaType', str('auto')], ['RequestMethod', str('auto')],
    ['HeaderFields', { k: 'cell', r: 0, c: 2, d: [] }], ['Username', str('')], ['Password', str('')], ['CharacterEncoding', str('auto')],
    ['KeyName', str('')], ['KeyValue', str('')], ['IsWebOptions', { ...num(1), logical: true }],
  ]) };
}
def('weboptions', (a) => {
  const o = defaultOptions();
  if (a.length % 2) throw new LabError('weboptions takes name–value pairs, such as weboptions(\'Timeout\', 30).');
  for (let i = 0; i < a.length; i += 2) {
    const name = OPTION_NAMES.find((n) => n.toLowerCase() === textOf(a[i]).toLowerCase());
    if (!name) throw new LabError(`weboptions has no “${textOf(a[i])}”: it has ${OPTION_NAMES.join(', ')}.`);
    o.f.set(name, a[i + 1]);
  }
  return [o];
});

interface Req { url: string; options: Struct; pairs: [string, Value][] }
/** url, then name–value query pairs, then (last) a weboptions. */
function request(a: Value[], what: string): Req {
  if (!a[0]) throw new LabError(`${what} needs a web address.`);
  const url = textOf(a[0]);
  let rest = a.slice(1);
  let options = defaultOptions();
  if (is(rest[rest.length - 1], 'IsWebOptions')) { options = rest[rest.length - 1] as Struct; rest = rest.slice(0, -1); }
  if (rest.length % 2) throw new LabError(`${what}: the query comes in name–value pairs.`);
  const pairs: [string, Value][] = [];
  for (let i = 0; i < rest.length; i += 2) pairs.push([textOf(rest[i]), rest[i + 1]]);
  return { url, options, pairs };
}
const valueText = (v: Value) => (v.k === 'str' ? v.v : v.k === 'mat' ? [...v.d].map(String).join(',') : textOf(v));
function withQuery(url: string, pairs: [string, Value][]) {
  if (!pairs.length) return url;
  const q = pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(valueText(v))}`).join('&');
  return url + (url.includes('?') ? '&' : '?') + q;
}
function headersOf(o: Struct): Record<string, string> {
  const h: Record<string, string> = {};
  const hf = o.f.get('HeaderFields');
  if (hf?.k === 'cell' && hf.d.length) {
    if (hf.c !== 2) throw new LabError('HeaderFields is a cell with two columns: names and values.');
    for (let i = 0; i < hf.r; i++) h[textOf(hf.d[i])] = textOf(hf.d[i + hf.r]);
  }
  const user = fieldText(o, 'Username');
  if (user) h.Authorization = `Basic ${btoa(unescape(encodeURIComponent(`${user}:${fieldText(o, 'Password')}`)))}`;
  const key = fieldText(o, 'KeyName');
  if (key) h[key] = fieldText(o, 'KeyValue');
  return h;
}

interface Got { status: number; statusText: string; type: string; bytes: Uint8Array; pixels?: { w: number; h: number; rgba: Uint8Array } }
function fetchVia(url: string, o: Struct, method: string, body?: string | Uint8Array, extra: Record<string, string> = {}): Got {
  const secs = toMat(o.f.get('Timeout') ?? num(15)).d[0];
  const timeout = Math.max(1, Math.min(120, secs)) * 1000;
  const r = ask<Got>('web', { url, method, headers: { ...extra, ...headersOf(o) }, body, timeout }, timeout + 3000);
  if (r.status >= 400) throw new LabError(`The site answered ${r.status}${r.statusText ? ` ${r.statusText}` : ''} for ${url}.`);
  return r;
}
function picture(p: NonNullable<Got['pixels']>): Mat {
  const { w, h, rgba } = p, n = w * h, d = new Float64Array(n * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, at = x * h + y;
    d[at] = rgba[i]; d[at + n] = rgba[i + 1]; d[at + 2 * n] = rgba[i + 2];
  }
  return cast(mat(h, w, d), 'uint8') as Mat;
}
const bytesOf = (b: Uint8Array) => cast(mat(b.length, 1, b), 'uint8');
/** What came back, as MATLAB gives it: JSON as structs, text as char, pictures as images, anything else as bytes. */
function decoded(r: Got, o: Struct): Value {
  const want = fieldText(o, 'ContentType').toLowerCase() || 'auto';
  const type = r.type.toLowerCase();
  const text = () => dec.decode(r.bytes);
  if (want === 'binary') return bytesOf(r.bytes);
  if (want === 'text') return str(text());
  if (want === 'json' || (want === 'auto' && /json/.test(type))) {
    try { return fromJs(JSON.parse(text())); } catch { throw new LabError('The answer isn’t valid JSON.'); }
  }
  if ((want === 'auto' || want === 'image') && r.pixels) return picture(r.pixels);
  if (want === 'auto' && /^(text\/|application\/(xml|javascript|x-www-form-urlencoded)|$)/.test(type)) return str(text());
  return bytesOf(r.bytes);
}

def('webread', (a) => {
  const { url, options, pairs } = request(a, 'webread');
  const m = fieldText(options, 'RequestMethod').toLowerCase();
  return [decoded(fetchVia(withQuery(url, pairs), options, m && m !== 'auto' ? m.toUpperCase() : 'GET'), options)];
});
def('webwrite', (a) => {
  if (!a[0] || !a[1]) throw new LabError('webwrite(url, data) or webwrite(url, name, value, …).');
  let rest = a.slice(1), options = defaultOptions();
  if (is(rest[rest.length - 1], 'IsWebOptions')) { options = rest[rest.length - 1] as Struct; rest = rest.slice(0, -1); }
  const media = fieldText(options, 'MediaType').toLowerCase();
  let body: string | Uint8Array, type: string;
  if (rest.length >= 2 && rest.length % 2 === 0 && rest[0].k === 'str' && media !== 'application/json') {
    body = new URLSearchParams(Array.from({ length: rest.length / 2 }, (_, i) => [textOf(rest[2 * i]), valueText(rest[2 * i + 1])])).toString();
    type = 'application/x-www-form-urlencoded';
  } else if (rest[0].k === 'str' && !/json/.test(media)) { body = rest[0].v; type = media && media !== 'auto' ? media : 'text/plain; charset=utf-8'; }
  else if (rest[0].k === 'mat' && rest[0].cls === 'uint8') { body = Uint8Array.from((rest[0] as Mat).d); type = media && media !== 'auto' ? media : 'application/octet-stream'; }
  else { body = JSON.stringify(toJs(rest[0])); type = 'application/json'; }
  const m = fieldText(options, 'RequestMethod').toLowerCase();
  return [decoded(fetchVia(textOf(a[0]), options, m && m !== 'auto' ? m.toUpperCase() : 'POST', body, { 'Content-Type': type }), options)];
});
def('websave', (a, _n, lab) => {
  if (!a[0] || !a[1]) throw new LabError('websave(filename, url).');
  const name = textOf(a[0]).trim();
  if (!name) throw new LabError('Give the file a name.');
  const { url, options, pairs } = request(a.slice(1), 'websave');
  const r = fetchVia(withQuery(url, pairs), options, 'GET');
  writeFileBytes(lab, name, r.bytes);
  return [str(name)];
});
def('urlencode', (a) => [str(encodeURIComponent(textOf(a[0] ?? str(''))).replace(/%20/g, '+'))]);
def('urldecode', (a) => [str(decodeURIComponent(textOf(a[0] ?? str('')).replace(/\+/g, ' ')))]);

// ——— MQTT ———
def('mqttclient', (a) => {
  if (!a[0]) throw new LabError('mqttclient(\'wss://broker.example.com:8884/mqtt\'): a broker that takes secure WebSockets.');
  let broker = textOf(a[0]), port = 0, clientId = `hyperion-${Math.random().toString(36).slice(2, 10)}`, user = '', pass = '';
  for (let i = 1; i + 1 < a.length; i += 2) {
    const k = textOf(a[i]).toLowerCase();
    if (k === 'port') port = Math.round(toMat(a[i + 1]).d[0]);
    else if (k === 'clientid') clientId = textOf(a[i + 1]);
    else if (k === 'username') user = textOf(a[i + 1]);
    else if (k === 'password') pass = textOf(a[i + 1]);
    else if (k !== 'timeout' && k !== 'keepalive') throw new LabError(`mqttclient has no “${textOf(a[i])}”: it takes Port, ClientID, Username and Password.`);
  }
  if (!/^wss?:\/\//i.test(broker)) broker = `wss://${broker.replace(/^[a-z]+:\/\//i, '')}${port ? `:${port}` : ''}/mqtt`;
  else if (port) { const u = new URL(broker); u.port = String(port); broker = u.href; }
  const { conn } = ask<{ conn: number }>('mqtt', { op: 'open', url: broker, clientId, user, pass }, 20_000);
  return [{ k: 'struct', f: new Map<string, Value>([
    ['BrokerAddress', str(broker)], ['ClientID', str(clientId)], ['Connected', { ...num(1), logical: true }],
    ['IsMqtt', num(conn)],
  ]) } satisfies Struct];
});
const connOf = (s: Struct) => toMat(s.f.get('IsMqtt')!).d[0];
const topicArg = (v: Value | undefined, what: string) => { if (!v) throw new LabError(`${what} needs a topic, such as 'sensors/room1/#'.`); return textOf(v); };
def('subscribe', (a) => {
  if (!is(a[0], 'IsMqtt')) throw new LabError('subscribe(client, topic): client from mqttclient.');
  ask('mqtt', { op: 'subscribe', conn: connOf(a[0]), topic: topicArg(a[1], 'subscribe') }, 10_000);
  return [];
});
def('unsubscribe', (a) => {
  if (!is(a[0], 'IsMqtt')) throw new LabError('unsubscribe(client, topic): client from mqttclient.');
  ask('mqtt', { op: 'unsubscribe', conn: connOf(a[0]), topic: topicArg(a[1], 'unsubscribe') }, 10_000);
  return [];
});
/** Messages as a struct array with Time (seconds since 1970), Topic and Data (text). */
function messages(s: Struct, wait: boolean, topic?: string): Value {
  const r = ask<{ messages: { topic: string; payload: Uint8Array; at: number }[]; closed: boolean }>('mqtt', { op: 'read', conn: connOf(s), wait }, wait ? 10_000 : 3000);
  let ms = r.messages;
  if (topic) ms = ms.filter((m) => m.topic === topic);
  const rows = ms.map((m) => ({ k: 'struct', f: new Map<string, Value>([['Time', num(m.at / 1000)], ['Topic', str(m.topic)], ['Data', str(dec.decode(m.payload))]]) } satisfies Struct));
  if (!rows.length) { if (r.closed) throw new LabError('The broker closed the link.'); return { k: 'struct', f: new Map([['Time', mat(0, 0, [])], ['Topic', mat(0, 0, [])], ['Data', mat(0, 0, [])]]) } satisfies Struct; }
  if (rows.length === 1) return rows[0];
  return { k: 'cell', r: rows.length, c: 1, d: rows } satisfies Cell;
}
def('peek', (a) => { if (!is(a[0], 'IsMqtt')) throw new LabError('peek(client): client from mqttclient.'); return [messages(a[0], false, a[1] ? textOf(a[1]) : undefined)]; });

// ——— Game controllers (vrjoystick) ———
interface Pad { index: number; id: string; axes: number[]; buttons: number[]; pressed: boolean[] }
const pads = () => ask<Pad[]>('gamepad', {}, 3000);
const padOf = (s: Struct) => {
  const want = toMat(s.f.get('IsJoystick')!).d[0];
  const p = pads().find((x) => x.index === want);
  if (!p) throw new LabError('That game controller isn’t connected any more.');
  return p;
};
def('vrjoystick', (a) => {
  const id = a[0] ? Math.round(toMat(a[0]).d[0]) : 1;
  const list = pads();
  if (!list.length) throw new LabError('No game controller found: connect one and press any of its buttons (browsers show a controller only after that), then try again.');
  const p = list[id - 1];
  if (!p) throw new LabError(`There ${list.length === 1 ? 'is 1 controller' : `are ${list.length} controllers`}.`);
  return [{ k: 'struct', f: new Map<string, Value>([['Name', str(p.id)], ['IsJoystick', num(p.index)]]) } satisfies Struct];
});
const row = (xs: number[]) => mat(1, xs.length, xs);
const padRead: Builtin = (a) => {
  const p = padOf(a[0] as Struct);
  const pressed = p.pressed.map((x) => (x ? 1 : 0));
  // The standard layout's D-pad (buttons 13–16) as a point-of-view hat in degrees, −1 when not pressed.
  const [up, down, left, right] = [12, 13, 14, 15].map((i) => !!p.pressed[i]);
  const pov = up ? (right ? 45 : left ? 315 : 0) : down ? (right ? 135 : left ? 225 : 180) : right ? 90 : left ? 270 : -1;
  return [row(p.axes), { ...row(pressed), logical: true }, num(pov), row(p.buttons)];
};
def('caps', (a) => {
  if (!is(a[0], 'IsJoystick')) throw new LabError('caps(joy): joy from vrjoystick.');
  const p = padOf(a[0]);
  return [{ k: 'struct', f: new Map<string, Value>([['Axes', num(p.axes.length)], ['Buttons', num(p.buttons.length)], ['POVs', num(1)], ['Forces', num(0)]]) } satisfies Struct];
});
def('button', (a) => {
  if (!is(a[0], 'IsJoystick')) throw new LabError('button(joy, n): joy from vrjoystick.');
  const p = padOf(a[0]), which = a[1] ? [...toMat(a[1]).d] : p.pressed.map((_, i) => i + 1);
  return [{ ...row(which.map((i) => (p.pressed[i - 1] ? 1 : 0))), logical: true }];
});

// ——— Shared names: read, write, axis, close take these objects first, anything else as before ———
const prevRead = BUILTINS.read, prevWrite = BUILTINS.write, prevAxis = BUILTINS.axis, prevClose = BUILTINS.close;
BUILTINS.read = (a, n, lab) => {
  if (is(a[0], 'IsMqtt')) return [messages(a[0], true, a[1] ? textOf(a[1]) : undefined)];
  if (is(a[0], 'IsJoystick')) return padRead(a, n, lab);
  return prevRead(a, n, lab);
};
BUILTINS.write = (a, n, lab) => {
  if (is(a[0], 'IsMqtt')) {
    const topic = topicArg(a[1], 'write'), msg = a[2] ? valueText(a[2]) : '';
    let retain = false;
    for (let i = 3; i + 1 < a.length; i += 2) if (/^retain$/i.test(textOf(a[i]))) retain = !!toMat(a[i + 1]).d[0];
    ask('mqtt', { op: 'publish', conn: connOf(a[0]), topic, payload: enc.encode(msg), retain }, 10_000);
    return [];
  }
  return prevWrite(a, n, lab);
};
BUILTINS.axis = (a, n, lab) => {
  if (is(a[0], 'IsJoystick')) {
    const p = padOf(a[0]), which = a[1] ? [...toMat(a[1]).d] : p.axes.map((_, i) => i + 1);
    return [row(which.map((i) => p.axes[i - 1] ?? NaN))];
  }
  return prevAxis(a, n, lab);
};
BUILTINS.close = (a, n, lab) => {
  if (is(a[0], 'IsMqtt')) { ask('mqtt', { op: 'close', conn: connOf(a[0]) }, 5000); return []; }
  return prevClose(a, n, lab);
};
