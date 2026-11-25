import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf } from './interp';
import { mat, num, str, toMat, type Cell, type Struct, type Value } from './values';
import { askPage } from './wait';
import './serial-lab'; // its write is wrapped below

// Hyperion's Bluetooth and USB devices in the language (M526), like MATLAB's: blelist, ble, characteristic, read,
// write (Bluetooth Low Energy) and usbdevlist, usbdev, read, write (USB). The device is connected in Signals →
// Bluetooth & USB (browsers let only the page open one); a script asks the page and waits for the answer (M521), so
// these need Chrome or Edge (the browsers with Web Bluetooth and WebUSB) or the computer app.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
interface View { ble: { open: boolean; name: string; chars: { service: string; uuid: string; name: string; props: string[] }[] }; usb: { open: boolean; name: string; vendorId: number; productId: number } }
function ask<T>(body: Record<string, unknown>, ms = 10_000): T {
  const r = askPage<T>('wireless', body, ms);
  if (r === null) throw new LabError('Bluetooth and USB devices are reached from Chrome, Edge or Hyperion’s computer app (Web Bluetooth and WebUSB), with the device connected in Signals → Bluetooth & USB.');
  return r;
}
const view = () => ask<View>({ op: 'view' }, 2000);
const struct = (fields: [string, Value][], mark: string): Struct => ({ k: 'struct', f: new Map<string, Value>([...fields, [mark, { ...num(1), logical: true }]]) });
const cellRow = (xs: string[]): Cell => ({ k: 'cell', r: 1, c: xs.length, d: xs.map(str) });
const is = (v: Value | undefined, mark: string): v is Struct => v?.k === 'struct' && v.f.has(mark);
const bytesIn = (v: Value | undefined) => { if (!v) throw new LabError('Give the bytes to send (numbers 0 to 255, or text).'); return v.k === 'str' ? [...new TextEncoder().encode(v.v)] : [...toMat(v).d].map((x) => Math.max(0, Math.min(255, Math.round(x)))); };
const bytesOut = (b: number[]) => mat(1, b.length, b);
const uuidOf = (v: Value | undefined, what: string) => { if (!v) throw new LabError(`Give the ${what}: a UUID text, a 16-bit number such as "180D", or a standard name.`); return v.k === 'str' ? v.v : toMat(v).d[0].toString(16); };

def('blelist', () => { const v = view(); return [v.ble.open ? cellRow([v.ble.name]) : { k: 'cell', r: 1, c: 0, d: [] }]; });
def('ble', () => {
  const v = view();
  if (!v.ble.open) throw new LabError('No Bluetooth device is connected: connect one (or the simulated heart-rate sensor) in Signals → Bluetooth & USB.');
  const n = v.ble.chars.length;
  const table: Struct = { k: 'struct', table: true, f: new Map<string, Value>([
    ['ServiceUUID', { k: 'cell', r: n, c: 1, d: v.ble.chars.map((c) => str(c.service)) }],
    ['CharacteristicUUID', { k: 'cell', r: n, c: 1, d: v.ble.chars.map((c) => str(c.uuid)) }],
    ['Name', { k: 'cell', r: n, c: 1, d: v.ble.chars.map((c) => str(c.name)) }],
    ['Attributes', { k: 'cell', r: n, c: 1, d: v.ble.chars.map((c) => str(c.props.join(', '))) }],
  ]) };
  return [struct([['Name', str(v.ble.name)], ['Connected', { ...num(1), logical: true }], ['Characteristics', table]], 'IsBLE')];
});
def('characteristic', (a) => {
  if (!is(a[0], 'IsBLE')) throw new LabError('characteristic(b, serviceUUID, characteristicUUID): b from ble().');
  const service = uuidOf(a[1], 'service'), char = uuidOf(a[2], 'characteristic');
  const r = ask<{ service: string; uuid: string; name: string; props: string[] }>({ op: 'find', service, char }, 2000);
  return [struct([['Name', str(r.name)], ['ServiceUUID', str(r.service)], ['CharacteristicUUID', str(r.uuid)], ['Attributes', cellRow(r.props)]], 'IsBLEChar')];
});
def('usbdevlist', () => { const v = view(); return [v.usb.open ? cellRow([v.usb.name]) : { k: 'cell', r: 1, c: 0, d: [] }]; });
def('usbdev', () => {
  const v = view();
  if (!v.usb.open) throw new LabError('No USB device is connected: connect one (or the simulated echo device) in Signals → Bluetooth & USB.');
  return [struct([['Name', str(v.usb.name)], ['VendorID', num(v.usb.vendorId)], ['ProductID', num(v.usb.productId)]], 'IsUSB')];
});
def('read', (a) => {
  if (is(a[0], 'IsBLEChar')) {
    const latest = a[1]?.k === 'str' && /^latest$/i.test(a[1].v), s = a[0].f;
    return [bytesOut(ask<number[]>({ op: 'read', service: textOf(s.get('ServiceUUID')!), char: textOf(s.get('CharacteristicUUID')!), fresh: !latest }, 5000))];
  }
  if (is(a[0], 'IsUSB')) {
    const n = a[1] ? Math.round(toMat(a[1]).d[0]) : 64;
    if (!(n >= 1 && n <= 65536)) throw new LabError('read(u, n): n bytes, 1 to 65,536.');
    return [bytesOut(ask<number[]>({ op: 'usbread', n }, 5000))];
  }
  throw new LabError('read takes a Bluetooth characteristic (characteristic(…)) or a USB device (usbdev).');
});
// write: the serial port's (M474), or a Bluetooth characteristic's, or a USB device's.
const serialWrite = BUILTINS.write;
BUILTINS.write = (a, n, lab) => {
  if (is(a[0], 'IsBLEChar')) { const s = a[0].f; ask({ op: 'write', service: textOf(s.get('ServiceUUID')!), char: textOf(s.get('CharacteristicUUID')!), bytes: bytesIn(a[1]) }); return []; }
  if (is(a[0], 'IsUSB')) { ask({ op: 'usbwrite', bytes: bytesIn(a[1]) }); return []; }
  return serialWrite(a, n, lab);
};
