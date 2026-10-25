// Bluetooth thermometers for the cold chain (the driver's page, /carry/<key>). Works with any device
// that speaks one of the two standard Bluetooth layouts: Environmental Sensing (0x181A: temperature
// 0x2A6E in hundredths of a °C, humidity 0x2A6F in hundredths of a %; most fridge and truck loggers,
// and cheap sensors with open firmware) or Health Thermometer (0x1809: 0x2A1C, an IEEE-11073 float).
// Chrome on Android, Windows, macOS and ChromeOS have Web Bluetooth; Safari and iPhones don't.

export const ESS = 0x181a, ESS_TEMP = 0x2a6e, ESS_HUMIDITY = 0x2a6f;
export const HTS = 0x1809, HTS_MEASUREMENT = 0x2a1c;

/** Environmental Sensing temperature: signed 16-bit, 0.01 °C; 0x8000 means "not known". */
export function essTemperature(v: DataView): number | null {
  const raw = v.getInt16(0, true);
  return raw === -0x8000 ? null : Math.round(raw) / 100;
}

/** Environmental Sensing humidity: unsigned 16-bit, 0.01 %; 0xFFFF means "not known". */
export function essHumidity(v: DataView): number | null {
  const raw = v.getUint16(0, true);
  return raw === 0xffff ? null : raw / 100;
}

/** Health Thermometer measurement: a flags byte (bit 0 = °F), then a 32-bit IEEE-11073 float. */
export function htsTemperature(v: DataView): number | null {
  const flags = v.getUint8(0), raw = v.getUint32(1, true);
  let mantissa = raw & 0x00ffffff;
  if (mantissa === 0x7fffff || mantissa === 0x800000 || mantissa === 0x7ffffe || mantissa === 0x800002) return null; // NaN / ±infinity / not available
  if (mantissa & 0x800000) mantissa -= 0x1000000;
  const exponent = (raw >> 24) << 24 >> 24; // signed 8-bit
  const value = mantissa * 10 ** exponent;
  const c = flags & 1 ? ((value - 32) * 5) / 9 : value;
  return Math.round(c * 100) / 100;
}

// Just the parts of Web Bluetooth used here (it isn't in TypeScript's standard library).
interface Characteristic extends EventTarget { value?: DataView; properties: { notify: boolean; indicate: boolean; read: boolean }; startNotifications(): Promise<Characteristic>; readValue(): Promise<DataView> }
interface Service { getCharacteristic(uuid: number): Promise<Characteristic> }
interface Server { connected: boolean; getPrimaryService(uuid: number): Promise<Service>; disconnect(): void }
interface Device extends EventTarget { name?: string; gatt?: { connect(): Promise<Server> } }
type Bluetooth = { requestDevice(o: { filters: { services: number[] }[]; optionalServices: number[] }): Promise<Device> };

export const bluetoothAvailable = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator;

export interface Reading { tempC: number; humidity: number | null }

/**
 * Asks the person to pick a thermometer (the browser's own chooser), connects and calls `onReading`
 * with every new value: notified when the device supports it, otherwise read every 30 seconds.
 * Returns the device's name and a function that disconnects.
 */
export async function connectThermometer(onReading: (r: Reading) => void, onLost: () => void): Promise<{ name: string; stop: () => void }> {
  const bt = (navigator as unknown as { bluetooth: Bluetooth }).bluetooth;
  const device = await bt.requestDevice({ filters: [{ services: [ESS] }, { services: [HTS] }], optionalServices: [ESS, HTS] });
  const server = await device.gatt!.connect();
  let timer: ReturnType<typeof setInterval> | null = null;
  let humidity: number | null = null;
  const stop = () => { if (timer) clearInterval(timer); timer = null; if (server.connected) server.disconnect(); };
  device.addEventListener('gattserverdisconnected', () => { if (timer) clearInterval(timer); onLost(); });

  const watch = async (c: Characteristic, decode: (v: DataView) => number | null, handle: (n: number) => void) => {
    const take = (v?: DataView) => { const n = v ? decode(v) : null; if (n !== null) handle(n); };
    if (c.properties.notify || c.properties.indicate) {
      c.addEventListener('characteristicvaluechanged', () => take(c.value));
      await c.startNotifications();
    }
    if (c.properties.read) {
      take(await c.readValue());
      if (!(c.properties.notify || c.properties.indicate)) timer = setInterval(() => { void c.readValue().then(take).catch(() => {}); }, 30_000);
    }
  };

  const ess = await server.getPrimaryService(ESS).catch(() => null);
  if (ess) {
    const hum = await ess.getCharacteristic(ESS_HUMIDITY).catch(() => null);
    if (hum) await watch(hum, essHumidity, (h) => { humidity = h; }).catch(() => {});
    const temp = await ess.getCharacteristic(ESS_TEMP);
    await watch(temp, essTemperature, (t) => onReading({ tempC: t, humidity }));
  } else {
    const hts = await server.getPrimaryService(HTS);
    await watch(await hts.getCharacteristic(HTS_MEASUREMENT), htsTemperature, (t) => onReading({ tempC: t, humidity: null }));
  }
  return { name: device.name || 'Thermometer', stop };
}
