// Hyperion Signals → Bluetooth & USB (M526): Bluetooth Low Energy devices over Web Bluetooth (their services and
// characteristics: read, write, notifications) and USB devices over WebUSB (bulk transfers in and out), or a simulated
// heart-rate sensor and a simulated USB echo device to try without hardware. Browsers let only the page open them (the
// person picks the device), so this lives on the page; scripts reach it by asking (page-answers.ts, M521's waiting).
// One link for the visit (it survives moving between Hyperion's pages), like serial-link.ts.

export interface Char { service: string; uuid: string; name: string; props: string[]; value: number[] | null; count: number }
export interface WirelessState { ble: { open: boolean; name: string; sim: boolean; chars: Char[] }; usb: { open: boolean; name: string; sim: boolean; vendorId: number; productId: number }; error: string }
type Listener = () => void;

// Minimal shapes of the browser's Bluetooth and USB objects (not in TypeScript's standard library).
interface GattChar { uuid: string; properties: Record<string, boolean>; value?: DataView; readValue(): Promise<DataView>; writeValue(b: Uint8Array): Promise<void>; startNotifications(): Promise<GattChar>; addEventListener(t: string, f: () => void): void }
interface GattService { uuid: string; getCharacteristics(): Promise<GattChar[]> }
interface BleDevice { name?: string; gatt?: { connect(): Promise<{ getPrimaryServices(): Promise<GattService[]> }>; disconnect(): void }; addEventListener(t: string, f: () => void): void }
interface UsbEndpoint { endpointNumber: number; direction: 'in' | 'out'; type: string }
interface UsbDevice { productName?: string; vendorId: number; productId: number; configuration: { interfaces: { interfaceNumber: number; alternate: { endpoints: UsbEndpoint[] } }[] } | null; open(): Promise<void>; close(): Promise<void>; selectConfiguration(n: number): Promise<void>; claimInterface(n: number): Promise<void>; transferIn(ep: number, n: number): Promise<{ data?: DataView }>; transferOut(ep: number, b: Uint8Array): Promise<unknown> }

/** Services a device's page may open (Web Bluetooth needs them named): the common standard ones and serial bridges. */
export const SERVICES: Record<string, string> = {
  heart_rate: 'Heart rate', battery_service: 'Battery', device_information: 'Device information', environmental_sensing: 'Environmental sensing',
  health_thermometer: 'Thermometer', cycling_speed_and_cadence: 'Cycling speed and cadence', running_speed_and_cadence: 'Running speed and cadence',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e': 'Nordic UART (serial)', '0000ffe0-0000-1000-8000-00805f9b34fb': 'HM-10 serial',
};
const CHAR_NAMES: Record<string, string> = { '00002a37-0000-1000-8000-00805f9b34fb': 'Heart rate measurement', '00002a19-0000-1000-8000-00805f9b34fb': 'Battery level', '00002a29-0000-1000-8000-00805f9b34fb': 'Manufacturer name', '00002a6e-0000-1000-8000-00805f9b34fb': 'Temperature', '00002a6f-0000-1000-8000-00805f9b34fb': 'Humidity', '00002a1c-0000-1000-8000-00805f9b34fb': 'Temperature measurement' };
const SHORT: Record<string, string> = { heart_rate: '0000180d-0000-1000-8000-00805f9b34fb', battery_service: '0000180f-0000-1000-8000-00805f9b34fb' };
/** A UUID as Bluetooth writes it, from a full UUID, a 16-bit number ('180D', 0x2A37) or a standard name. */
export function fullUuid(u: string | number): string {
  if (typeof u === 'number') return `0000${u.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;
  const t = u.trim().toLowerCase();
  if (SHORT[t]) return SHORT[t];
  if (/^(0x)?[0-9a-f]{4}$/.test(t)) return `0000${t.replace(/^0x/, '')}-0000-1000-8000-00805f9b34fb`;
  return t;
}
export const bluetoothSupported = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator;
export const usbSupported = () => typeof navigator !== 'undefined' && 'usb' in navigator;
const bytesOf = (v: DataView | undefined) => (v ? Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) : []);

class WirelessLink {
  state: WirelessState = { ble: { open: false, name: '', sim: false, chars: [] }, usb: { open: false, name: '', sim: false, vendorId: 0, productId: 0 }, error: '' };
  private listeners = new Set<Listener>();
  private bleDev: BleDevice | null = null;
  private handles = new Map<string, GattChar>();
  private usbDev: UsbDevice | null = null;
  private eps = { in: 0, out: 0 };
  private echo: number[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private waiters: { key: string; done: () => void }[] = [];
  subscribe(fn: Listener) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.state = { ...this.state }; for (const l of this.listeners) l(); }
  private setBle(p: Partial<WirelessState['ble']>) { this.state.ble = { ...this.state.ble, ...p }; this.emit(); }
  private setUsb(p: Partial<WirelessState['usb']>) { this.state.usb = { ...this.state.usb, ...p }; this.emit(); }
  /** Shows a problem under the panels (a cancelled device picker isn't one). */
  fail(e: unknown) { const m = e instanceof Error ? e.message : String(e); if (!/cancel|no device selected/i.test(m)) { this.state.error = m; this.emit(); } }
  private key = (service: string, uuid: string) => `${fullUuid(service)}/${fullUuid(uuid)}`;
  private got(service: string, uuid: string, value: number[]) {
    const k = this.key(service, uuid);
    this.state.ble.chars = this.state.ble.chars.map((c) => (this.key(c.service, c.uuid) === k ? { ...c, value, count: c.count + 1 } : c));
    for (const w of this.waiters.filter((x) => x.key === k)) w.done();
    this.waiters = this.waiters.filter((x) => x.key !== k);
    this.emit();
  }

  // ——— Bluetooth ———
  async connectBle(extra = '') {
    this.state.error = '';
    try {
      const nav = navigator as unknown as { bluetooth: { requestDevice(o: unknown): Promise<BleDevice> } };
      const optional = [...Object.keys(SERVICES), ...extra.split(/[\s,]+/).filter(Boolean).map(fullUuid)];
      const dev = await nav.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: optional });
      const server = await dev.gatt!.connect();
      this.closeBle();
      this.bleDev = dev;
      dev.addEventListener('gattserverdisconnected', () => { this.handles.clear(); this.setBle({ open: false, chars: [] }); });
      const chars: Char[] = [];
      for (const s of await server.getPrimaryServices()) {
        for (const c of await s.getCharacteristics()) {
          const props = Object.entries(c.properties).filter(([, on]) => on === true).map(([k]) => k);
          chars.push({ service: s.uuid, uuid: c.uuid, name: CHAR_NAMES[c.uuid] ?? c.uuid, props, value: null, count: 0 });
          this.handles.set(this.key(s.uuid, c.uuid), c);
          if (c.properties.notify || c.properties.indicate) {
            c.addEventListener('characteristicvaluechanged', () => this.got(s.uuid, c.uuid, bytesOf(c.value)));
            await c.startNotifications().catch(() => undefined);
          }
        }
      }
      this.setBle({ open: true, name: dev.name || 'Bluetooth device', sim: false, chars });
    } catch (e) { this.fail(e); }
  }
  /** A simulated heart-rate sensor: its pulse every half second (notifications), its battery to read. */
  simulateBle() {
    this.closeBle();
    const hr = fullUuid('heart_rate'), bat = fullUuid('battery_service');
    this.setBle({ open: true, name: 'Simulated heart-rate sensor', sim: true, chars: [
      { service: hr, uuid: fullUuid('2a37'), name: 'Heart rate measurement', props: ['notify'], value: null, count: 0 },
      { service: bat, uuid: fullUuid('2a19'), name: 'Battery level', props: ['read'], value: [87], count: 0 },
    ] });
    let t = 0;
    this.timer = setInterval(() => { t += 0.5; this.got(hr, fullUuid('2a37'), [0, Math.round(72 + 8 * Math.sin(t / 3) + 3 * Math.sin(t * 1.7))]); }, 500);
  }
  closeBle() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    try { this.bleDev?.gatt?.disconnect(); } catch { /* already gone */ }
    this.bleDev = null; this.handles.clear();
    if (this.state.ble.open) this.setBle({ open: false, chars: [], sim: false });
  }
  private char(service: string, uuid: string) {
    const k = this.key(service, uuid), c = this.state.ble.chars.find((x) => this.key(x.service, x.uuid) === k);
    if (!c) throw new Error(`The device has no characteristic ${uuid} in service ${service}: it has ${this.state.ble.chars.map((x) => `${x.name}`).join(', ') || 'none'}.`);
    return c;
  }
  /** A characteristic's value: the next notification (fresh) or a read (or the latest when it can't be read). */
  async readBle(service: string, uuid: string, fresh: boolean, ms: number): Promise<number[]> {
    const c = this.char(service, uuid), k = this.key(service, uuid);
    if (c.props.includes('notify') || c.props.includes('indicate')) {
      if (fresh || !c.value) await new Promise<void>((done) => { const timer = setTimeout(done, ms); this.waiters.push({ key: k, done: () => { clearTimeout(timer); done(); } }); });
      return this.char(service, uuid).value ?? [];
    }
    if (!c.props.includes('read')) throw new Error(`${c.name} can't be read (it can: ${c.props.join(', ')}).`);
    if (this.state.ble.sim) { this.got(service, uuid, c.value ?? []); return c.value ?? []; }
    const v = bytesOf(await this.handles.get(k)!.readValue());
    this.got(service, uuid, v);
    return v;
  }
  async writeBle(service: string, uuid: string, bytes: number[]) {
    const c = this.char(service, uuid);
    if (!c.props.some((p) => p === 'write' || p === 'writeWithoutResponse')) throw new Error(`${c.name} can't be written.`);
    if (!this.state.ble.sim) await this.handles.get(this.key(service, uuid))!.writeValue(Uint8Array.from(bytes));
  }

  // ——— USB ———
  async connectUsb() {
    this.state.error = '';
    try {
      const nav = navigator as unknown as { usb: { requestDevice(o: unknown): Promise<UsbDevice> } };
      const dev = await nav.usb.requestDevice({ filters: [] });
      await dev.open();
      if (!dev.configuration) await dev.selectConfiguration(1);
      // The first interface with bulk (or interrupt) endpoints both ways.
      const iface = dev.configuration?.interfaces.find((i) => i.alternate.endpoints.some((e) => e.direction === 'in') && i.alternate.endpoints.some((e) => e.direction === 'out'));
      if (!iface) throw new Error('This device has no interface that sends and receives data (it may be a keyboard, a mouse or a disk, which the computer keeps).');
      try { await dev.claimInterface(iface.interfaceNumber); } catch { throw new Error('The computer’s own driver holds this device. A USB serial device (Arduino, CH340, FTDI) works in Signals → Devices instead.'); }
      const ep = (d: 'in' | 'out') => iface.alternate.endpoints.find((e) => e.direction === d)!.endpointNumber;
      const was = this.usbDev;
      if (was && was !== dev) await was.close().catch(() => undefined);
      this.usbDev = dev; this.eps = { in: ep('in'), out: ep('out') };
      this.setUsb({ open: true, name: dev.productName || 'USB device', sim: false, vendorId: dev.vendorId, productId: dev.productId });
    } catch (e) { this.fail(e); }
  }
  /** A simulated USB device that sends back what it's sent. */
  simulateUsb() { const was = this.usbDev; this.usbDev = null; void was?.close().catch(() => undefined); this.echo = []; this.setUsb({ open: true, name: 'Simulated USB echo device', sim: true, vendorId: 0x1209, productId: 0x0001 }); }
  async closeUsb() {
    try { await this.usbDev?.close(); } catch { /* already gone */ }
    this.usbDev = null;
    if (this.state.usb.open) this.setUsb({ open: false, sim: false });
  }
  async writeUsb(bytes: number[]) {
    if (!this.state.usb.open) throw new Error('No USB device is connected: connect one in Signals → Bluetooth & USB.');
    if (this.state.usb.sim) { this.echo.push(...bytes); return; }
    await this.usbDev!.transferOut(this.eps.out, Uint8Array.from(bytes));
  }
  async readUsb(n: number, ms: number): Promise<number[]> {
    if (!this.state.usb.open) throw new Error('No USB device is connected: connect one in Signals → Bluetooth & USB.');
    if (this.state.usb.sim) return this.echo.splice(0, n);
    const r = await Promise.race([this.usbDev!.transferIn(this.eps.in, n), new Promise<null>((ok) => setTimeout(() => ok(null), ms))]);
    return r ? bytesOf(r.data) : [];
  }
}
export const wirelessLink = new WirelessLink();
