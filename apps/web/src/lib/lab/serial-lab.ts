import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Cell, type Struct, type Value } from './values';
import type { Mode } from './firmata';
import { askPage } from './wait';

// Hyperion's hardware in the language (M474): serialportlist, serialport, readline, writeline, write, flush; and an
// Arduino running StandardFirmata: arduino, configurePin, writeDigitalPin, readDigitalPin, readVoltage,
// writePWMDutyCycle, writePWMVoltage. MATLAB's serialport and arduino are objects; here they are plain structs naming
// the device connected in Signals → Devices. Its writes go out as it runs. M521: where the page is cross-origin
// isolated (wait.ts), a read waits for the device: readline for its next line (up to the port's Timeout, 10 s), readVoltage
// for a fresh reading, readDigitalPin for the pin's latest; elsewhere (Safari) a script reads what had arrived before it
// started (lines not read yet, the pins' last values).

export interface SerialOut { text?: string; bytes?: number[]; pin?: number; mode?: Mode; digital?: number; analog?: number }
interface PinMirror { name: string; modes: string[]; mode?: string; value: number }
/** What the window last told the engine about the device. */
const mirror = { open: false, name: '', baud: 0, firmata: false, unread: [] as string[], pins: [] as PinMirror[] };
/** The window's news (between runs): the device's state, or new lines. */
export function serialFeed(m: { state?: { open: boolean; name: string; baud: number; firmata: boolean; pins: PinMirror[] }; lines?: string[] }) {
  if (m.state) { Object.assign(mirror, { open: m.state.open, name: m.state.name, baud: m.state.baud, firmata: m.state.firmata, pins: m.state.pins }); if (!m.state.open) mirror.unread = []; }
  if (m.lines) { mirror.unread.push(...m.lines); if (mirror.unread.length > 10_000) mirror.unread.splice(0, mirror.unread.length - 10_000); }
}

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
/** M521: news from the page mid-run (nothing where the engine can't wait). 'line' waits for one, 'analog' for a fresh
 *  report, 'peek' takes what's there. The engine's own pin modes and outputs stand; inputs take the page's values. */
type Answer = { lines?: string[]; state?: { open: boolean; name: string; baud: number; firmata: boolean; pins: PinMirror[] } };
function pull(want: 'line' | 'analog' | 'peek', ms: number) {
  const r = askPage<Answer>('serial', { want }, ms);
  if (!r) return;
  if (r.lines?.length) serialFeed({ lines: r.lines });
  if (r.state) {
    Object.assign(mirror, { open: r.state.open, name: r.state.name, baud: r.state.baud, firmata: r.state.firmata });
    if (!r.state.open) mirror.unread = [];
    if (mirror.pins.length !== r.state.pins.length) mirror.pins = r.state.pins;
    else r.state.pins.forEach((p, i) => { const mine = mirror.pins[i]; if (mine.mode === 'input' || mine.mode === 'pullup' || mine.mode === 'analog') mine.value = p.value; });
  }
}
const timeoutOf = (v: Value | undefined) => { const t = v?.k === 'struct' ? v.f.get('Timeout') : undefined; return t ? Math.max(0, toMat(t).d[0]) * 1000 : 10_000; };
const send = (lab: Lab, m: SerialOut) => {
  const out = (lab.host as { serial?: (m: SerialOut) => void }).serial;
  if (!out) throw new LabError('Devices can’t be reached here.');
  out(m);
};
const need = (firmata: boolean) => {
  if (!mirror.open) throw new LabError('No device is connected: connect one (or the simulated Arduino) in Signals → Devices first.');
  if (firmata && !mirror.firmata) throw new LabError('The device isn’t in Firmata mode: in Signals → Devices choose “Firmata (StandardFirmata sketch)”.');
  if (!firmata && mirror.firmata) throw new LabError('The device is in Firmata mode: use arduino() and its pin functions, or reconnect it as text.');
};
const struct = (fields: [string, Value][]): Struct => ({ k: 'struct', f: new Map(fields) });
const cellRow = (xs: string[]): Cell => ({ k: 'cell', r: 1, c: xs.length, d: xs.map(str) });

def('serialportlist', () => { pull('peek', 0); return [mirror.open ? cellRow([mirror.name]) : { k: 'cell', r: 1, c: 0, d: [] }]; });
def('serialport', (a) => {
  pull('peek', 0);
  need(false);
  const baud = a[1] ? toMat(a[1]).d[0] : mirror.baud;
  let timeout = 10;
  for (let i = 2; i + 1 < a.length; i += 2) if (textOf(a[i]).toLowerCase() === 'timeout') timeout = toMat(a[i + 1]).d[0];
  return [struct([['Port', str(a[0] ? textOf(a[0]) : mirror.name)], ['BaudRate', num(baud)], ['Terminator', str('LF')], ['Timeout', num(timeout)], ['NumLinesAvailable', num(mirror.unread.length)]])];
});
def('readline', (a) => {
  if (!mirror.unread.length) pull('line', timeoutOf(a[0]));
  need(false);
  const line = mirror.unread.shift();
  return [line === undefined ? mat(0, 0) : str(line)];
});
def('writeline', (a, _n, lab) => { need(false); send(lab, { text: `${a[1] ? textOf(a[1]) : ''}\n` }); return []; });
def('write', (a, _n, lab) => {
  need(false);
  const v = a[1] ?? str(''), type = a[2] ? textOf(a[2]).toLowerCase() : v.k === 'str' ? 'string' : 'uint8';
  if (type === 'string' || type === 'char') send(lab, { text: textOf(v) });
  else send(lab, { bytes: [...toMat(v).d].map((x) => Math.max(0, Math.min(255, Math.round(x)))) });
  return [];
});
def('flush', () => { pull('peek', 0); need(false); mirror.unread = []; return []; });

// ——— Arduino by Firmata ———
const MODES: Record<string, Mode> = { DigitalOutput: 'output', DigitalInput: 'input', AnalogInput: 'analog', PWM: 'pwm', Pullup: 'pullup', Servo: 'servo' };
const modeNamed = (t: string) => Object.entries(MODES).find(([k]) => k.toLowerCase() === t.toLowerCase())?.[1];
const pinOf = (v: Value | undefined) => {
  const name = v ? textOf(v).toUpperCase() : '', i = mirror.pins.findIndex((p) => p.name === name);
  if (i < 0) throw new LabError(`There’s no pin “${name}”: the board has ${mirror.pins.filter((p) => p.modes.length).map((p) => p.name).join(', ')}.`);
  return i;
};
def('arduino', () => {
  pull('peek', 0);
  need(true);
  return [struct([['Port', str(mirror.name)], ['Board', str('Uno')], ['AvailablePins', cellRow(mirror.pins.filter((p) => p.modes.length).map((p) => p.name))]])];
});
def('configurePin', (a, _n, lab) => {
  need(true);
  const i = pinOf(a[1]);
  if (!a[2]) return [str(Object.entries(MODES).find(([, m]) => m === mirror.pins[i].mode)?.[0] ?? 'Unset')];
  const mode = modeNamed(textOf(a[2]));
  if (!mode) throw new LabError("A pin's mode is 'DigitalOutput', 'DigitalInput', 'AnalogInput', 'PWM', 'Pullup' or 'Servo'.");
  if (!mirror.pins[i].modes.includes(mode)) throw new LabError(`${mirror.pins[i].name} can’t be ${textOf(a[2])}.`);
  mirror.pins[i].mode = mode;
  send(lab, { pin: i, mode });
  return [];
});
const ensure = (lab: Lab, i: number, mode: Mode) => { if (mirror.pins[i].mode !== mode) { if (!mirror.pins[i].modes.includes(mode)) throw new LabError(`${mirror.pins[i].name} can’t be used that way.`); mirror.pins[i].mode = mode; send(lab, { pin: i, mode }); } };
def('writeDigitalPin', (a, _n, lab) => {
  need(true);
  const i = pinOf(a[1]), v = a[2] ? toMat(a[2]).d[0] : 0;
  ensure(lab, i, 'output');
  mirror.pins[i].value = v ? 1 : 0;
  send(lab, { pin: i, digital: v ? 1 : 0 });
  return [];
});
def('readDigitalPin', (a, _n, lab) => {
  need(true);
  const i = pinOf(a[1]);
  if (mirror.pins[i].mode !== 'output' && mirror.pins[i].mode !== 'pullup') ensure(lab, i, 'input');
  pull('peek', 0);
  return [num(mirror.pins[i].value ? 1 : 0)];
});
def('readVoltage', (a, _n, lab) => {
  need(true);
  const i = pinOf(a[1]);
  if (!mirror.pins[i].modes.includes('analog')) throw new LabError(`${mirror.pins[i].name} isn’t an analog input (A0–A5 are).`);
  ensure(lab, i, 'analog');
  pull('analog', 300);
  return [num((mirror.pins[i].value / 1023) * 5)];
});
const pwm = (lab: Lab, a: Value[], duty: number) => {
  need(true);
  const i = pinOf(a[1]);
  ensure(lab, i, 'pwm');
  if (!(duty >= 0 && duty <= 1)) throw new LabError('The duty cycle is 0 to 1 (0 to 5 V).');
  mirror.pins[i].value = Math.round(duty * 255);
  send(lab, { pin: i, analog: mirror.pins[i].value });
  return [];
};
def('writePWMDutyCycle', (a, _n, lab) => pwm(lab, a, a[2] ? toMat(a[2]).d[0] : NaN));
def('writePWMVoltage', (a, _n, lab) => pwm(lab, a, (a[2] ? toMat(a[2]).d[0] : NaN) / 5));
