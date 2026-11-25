import { afterEach, describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { toMat } from './values';
import { waits } from './wait';
import './wireless-lab';
import { isolationHeaders, securityHeaders } from '../../../security-headers';

// M526: Bluetooth and USB in scripts: every call is a question to the page (here a fake page with a heart-rate
// sensor and an echo device).
afterEach(() => { waits.page = null; });
const HR = '0000180d-0000-1000-8000-00805f9b34fb', MEAS = '00002a37-0000-1000-8000-00805f9b34fb';
function fakePage() {
  const asked: string[] = [], echo: number[] = [];
  let pulse = 70;
  waits.page = (kind, body) => {
    const b = body as { op: string; bytes?: number[]; n?: number; fresh?: boolean };
    asked.push(b.op);
    if (b.op === 'view') return { ble: { open: true, name: 'Pulse', chars: [{ service: HR, uuid: MEAS, name: 'Heart rate measurement', props: ['notify'] }] }, usb: { open: true, name: 'Echo', vendorId: 0x1209, productId: 1 } };
    if (b.op === 'find') return { service: HR, uuid: MEAS, name: 'Heart rate measurement', props: ['notify'] };
    if (b.op === 'read') return [0, b.fresh ? ++pulse : pulse];
    if (b.op === 'usbwrite') { echo.push(...b.bytes!); return true; }
    if (b.op === 'usbread') return echo.splice(0, b.n);
    return null;
  };
  return asked;
}
describe('Hyperion Bluetooth and USB (M526)', () => {
  it('reads a characteristic in a loop (waiting for each notification) and talks to a USB device', () => {
    const asked = fakePage(), lab = new Lab({ out: () => {} });
    lab.run("b = ble; c = characteristic(b, '180D', '2A37'); for k = 1:3, d = read(c); bpm(k) = d(2); end; last = read(c, 'latest');\nu = usbdev; write(u, 'hi'); write(u, [1 2 300]); r = read(u, 4);");
    expect([...toMat(lab.vars.get('bpm')!).d]).toEqual([71, 72, 73]);
    expect([...toMat(lab.vars.get('last')!).d]).toEqual([0, 73]);
    expect([...toMat(lab.vars.get('r')!).d]).toEqual([104, 105, 1, 2]);
    expect(asked.filter((x) => x === 'usbwrite')).toHaveLength(2);
  });
  it('says what is needed where the engine can’t ask the page, and keeps write for serial ports', () => {
    expect(() => new Lab({ out: () => {} }).run('b = ble;')).toThrow(/Chrome, Edge/);
    expect(() => new Lab({ out: () => {} }).run('read(3)')).toThrow(/Bluetooth characteristic/);
    expect(() => new Lab({ out: () => {} }).run("write(struct('a', 1), 1)")).toThrow(/device|connected/i);
  });
  it('only Hyperion’s pages may ask for USB devices', () => {
    expect(securityHeaders.find((h) => h.key === 'Permissions-Policy')!.value).toMatch(/usb=\(\)/);
    expect(isolationHeaders.find((h) => h.key === 'Permissions-Policy')!.value).toMatch(/usb=\(self\)/);
  });
});
