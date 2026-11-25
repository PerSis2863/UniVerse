'use client';

import { encode, Parser, SimBoard, type Event, type Mode } from '@/lib/lab/firmata';

// Hyperion's link to one serial device (M474): a real port through Web Serial (Chrome, Edge and Opera on computers,
// and Hyperion's computer app; not Firefox or Safari), or a simulated Arduino. One link for the whole visit (a
// module-level object), so it stays open while the person moves between Signals → Devices and the Code window, whose
// scripts read and write it (serial-lab.ts). Text mode keeps lines; Firmata mode keeps the board's pins.

type Kind = 'serial' | 'sim-text' | 'sim-firmata';
export interface PinState { modes: Partial<Record<Mode, number>>; mode?: Mode; value: number }
export interface LinkState {
  open: boolean; kind: Kind | null; name: string; baud: number; firmata: boolean;
  firmware: string; pins: PinState[]; analogMap: number[]; error: string;
}
type Listener = (e: { lines?: string[]; state?: LinkState }) => void;

/** The Web Serial API as far as Hyperion uses it (TypeScript's DOM types don't include it yet). */
interface Port { open(o: { baudRate: number }): Promise<void>; close(): Promise<void>; readable: ReadableStream<Uint8Array> | null; writable: WritableStream<Uint8Array> | null; getInfo(): { usbVendorId?: number; usbProductId?: number } }
interface SerialApi { requestPort(o?: { filters?: { usbVendorId: number }[] }): Promise<Port> }
export const serialSupported = () => typeof navigator !== 'undefined' && 'serial' in navigator;
const VENDORS: Record<number, string> = { 0x2341: 'Arduino', 0x2a03: 'Arduino', 0x1a86: 'CH340 USB serial', 0x0403: 'FTDI USB serial', 0x10c4: 'Silicon Labs USB serial', 0x239a: 'Adafruit', 0x2e8a: 'Raspberry Pi Pico', 0x303a: 'Espressif ESP32' };
const MAX_LINES = 10_000;

class SerialLink {
  state: LinkState = { open: false, kind: null, name: '', baud: 115200, firmata: false, firmware: '', pins: [], analogMap: [], error: '' };
  lines: string[] = [];
  private listeners = new Set<Listener>();
  private port: Port | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private sim: SimBoard | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private parser = new Parser();
  private partial = '';
  private decoder = new TextDecoder();
  private simT = 0;
  private led = 0;

  subscribe(fn: Listener) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(e: { lines?: string[]; state?: boolean }) { const out = { lines: e.lines, state: e.state ? { ...this.state } : undefined }; for (const l of this.listeners) l(out); }
  private set(p: Partial<LinkState>) { this.state = { ...this.state, ...p }; this.emit({ state: true }); }

  /** Asks the browser for a port (it shows its own chooser), then opens it. */
  async connect(baud: number, firmata: boolean) {
    await this.close();
    try {
      const port = await (navigator as unknown as { serial: SerialApi }).serial.requestPort();
      await port.open({ baudRate: baud });
      const info = port.getInfo();
      this.port = port;
      this.writer = port.writable?.getWriter() ?? null;
      this.set({ open: true, kind: 'serial', name: (info.usbVendorId && VENDORS[info.usbVendorId]) || 'Serial device', baud, firmata, firmware: '', pins: [], analogMap: [], error: '' });
      void this.readLoop();
      if (firmata) await this.startFirmata();
    } catch (e) {
      const err = e as Error;
      this.set({ open: false, error: err.name === 'NotFoundError' ? 'No port was chosen.' : err.name === 'NetworkError' ? 'That port is busy (is the Arduino IDE’s Serial Monitor open?).' : err.message });
    }
  }
  /** A simulated Arduino: printing sensor lines (text) or running StandardFirmata. */
  async simulate(firmata: boolean) {
    await this.close();
    this.simT = 0; this.led = 0;
    this.set({ open: true, kind: firmata ? 'sim-firmata' : 'sim-text', name: 'Simulated Arduino Uno', baud: 115200, firmata, firmware: '', pins: [], analogMap: [], error: '' });
    if (firmata) { this.sim = new SimBoard(); await this.startFirmata(); }
    this.timer = setInterval(() => this.simTick(0.05), 50);
  }
  private simTick(dt: number) {
    this.simT += dt;
    if (this.sim) { const out = this.sim.read(dt); if (out.length) this.onBytes(out); return; }
    // A sketch printing three sensors 20 times a second, as Serial.print("temp:"); … Serial.println(light);
    const t = this.simT, temp = 22 + 1.5 * Math.sin(t / 5) + 0.1 * Math.sin(17 * t), light = Math.round(500 + 300 * Math.sin(t / 2)), knob = Math.round(512 + 511 * Math.sin(t / 3));
    this.addLines([`temp:${temp.toFixed(2)},light:${light},knob:${knob},led:${this.led}`]);
  }
  async close() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.sim = null;
    try { await this.reader?.cancel(); } catch { /* already closed */ }
    try { this.writer?.releaseLock(); } catch { /* already released */ }
    try { await this.port?.close(); } catch { /* already closed */ }
    this.reader = null; this.writer = null; this.port = null; this.parser = new Parser(); this.partial = '';
    if (this.state.open) this.set({ open: false, kind: null, firmata: false, pins: [] });
  }
  private async readLoop() {
    const port = this.port;
    while (port?.readable && this.port === port) {
      this.reader = port.readable.getReader();
      try {
        for (;;) { const { value, done } = await this.reader.read(); if (done) break; if (value) this.onBytes(value); }
      } catch { /* a read error (unplugged): stop */ break; } finally { try { this.reader.releaseLock(); } catch { /* gone */ } }
    }
    if (this.port === port && this.state.open) { this.port = null; this.set({ open: false, error: 'The device was disconnected.' }); }
  }
  private onBytes(bytes: Uint8Array) {
    if (this.state.firmata) { for (const e of this.parser.feed(bytes)) this.onEvent(e); return; }
    const text = this.partial + this.decoder.decode(bytes, { stream: true }), parts = text.split(/\r?\n/);
    this.partial = parts.pop() ?? '';
    if (this.partial.length > 4096) { parts.push(this.partial); this.partial = ''; }
    if (parts.length) this.addLines(parts);
  }
  private addLines(lines: string[]) {
    this.lines.push(...lines);
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES);
    this.emit({ lines });
  }
  private onEvent(e: Event) {
    const pins = [...this.state.pins];
    if (e.type === 'firmware') this.set({ firmware: `${e.name} (Firmata ${e.major}.${e.minor})` });
    else if (e.type === 'capabilities') this.set({ pins: e.pins.map((p) => ({ modes: p.modes, value: 0 })) });
    else if (e.type === 'analogMap') this.set({ analogMap: e.map });
    else if (e.type === 'analog') { const pin = this.state.analogMap.indexOf(e.channel); if (pin >= 0 && pins[pin]) { pins[pin] = { ...pins[pin], value: e.value }; this.set({ pins }); } }
    else if (e.type === 'digital') {
      for (let b = 0; b < 8; b++) { const p = e.port * 8 + b, pin = pins[p]; if (pin && pin.mode !== 'analog' && pin.mode !== 'pwm' && pin.mode !== 'servo') pins[p] = { ...pin, value: (e.mask >> b) & 1 }; }
      this.set({ pins });
    } else if (e.type === 'string') this.addLines([e.text]);
  }
  private async startFirmata() {
    await this.writeBytes([...encode.version(), ...encode.firmware(), ...encode.capabilities(), ...encode.analogMapping(), ...encode.samplingInterval(50)]);
    // Port reports for every digital pin so inputs show as they change.
    await this.writeBytes([0, 1, 2].flatMap((p) => encode.reportDigital(p, true)));
  }
  async writeBytes(bytes: number[]) {
    if (this.sim) { this.sim.write(bytes); const out = this.sim.read(); if (out.length) this.onBytes(out); return; }
    if (this.writer) await this.writer.write(Uint8Array.from(bytes));
  }
  /** Text to the device (a script's writeline, the terminal's Send). The simulated sketch answers "LED ON" / "LED OFF". */
  async writeText(text: string) {
    if (this.state.kind === 'sim-text') {
      const t = text.trim().toUpperCase();
      if (t === 'LED ON' || t === 'LED OFF') { this.led = t === 'LED ON' ? 1 : 0; this.addLines([`ok: led ${this.led ? 'on' : 'off'}`]); } else this.addLines([`unknown command: ${text.trim()}`]);
      return;
    }
    await this.writeBytes([...new TextEncoder().encode(text)]);
  }
  /** Firmata: a pin's mode; analog pins start reporting, others are read through their port. */
  async pinMode(pin: number, mode: Mode) {
    const pins = [...this.state.pins];
    if (!pins[pin] || pins[pin].modes[mode] === undefined) throw new Error(`Pin ${pin} can’t be ${mode}.`);
    pins[pin] = { ...pins[pin], mode, value: mode === 'output' || mode === 'pwm' ? 0 : pins[pin].value };
    this.set({ pins });
    const ch = this.state.analogMap[pin] ?? -1;
    await this.writeBytes([...encode.pinMode(pin, mode), ...(ch >= 0 ? encode.reportAnalog(ch, mode === 'analog') : [])]);
  }
  async digitalWrite(pin: number, v: number) { const pins = [...this.state.pins]; if (pins[pin]) pins[pin] = { ...pins[pin], value: v ? 1 : 0 }; this.set({ pins }); await this.writeBytes(encode.digitalWrite(pin, v)); }
  async analogWrite(pin: number, v: number) { const pins = [...this.state.pins]; if (pins[pin]) pins[pin] = { ...pins[pin], value: v }; this.set({ pins }); await this.writeBytes(encode.analogWrite(pin, v)); }
  clearLines() { this.lines = []; this.emit({ lines: [] }); }
}

export const serialLink = new SerialLink();
/** The name a script uses for a pin: D0–D13, A0–A5 on an Uno (pins 14–19). */
export const pinName = (p: number, analogMap: number[]) => (analogMap[p] >= 0 ? `A${analogMap[p]}` : `D${p}`);

/** What the engine's scripts see of the link (serial-lab.ts keeps a mirror of it). */
export function engineView(s: LinkState) {
  return { open: s.open, name: s.name, baud: s.baud, firmata: s.firmata, pins: s.pins.map((p, i) => ({ name: pinName(i, s.analogMap), modes: Object.keys(p.modes), mode: p.mode, value: p.value })) };
}
/** M521: lines kept for an engine that asks for them (one that can wait, page-answers.ts) instead of being sent. */
export const heldLines: string[] = [];
/** Keeps the Code window's engine told of the device (its state, new lines) for as long as the window is open. */
export function bridgeToEngine(engine: () => Worker | null, asks: () => boolean = () => false): () => void {
  return serialLink.subscribe((e) => {
    const w = engine();
    if (!w) return;
    if (e.state) w.postMessage({ serial: { state: engineView(e.state) } });
    if (!e.lines?.length) return;
    if (!asks()) { w.postMessage({ serial: { lines: e.lines } }); return; }
    heldLines.push(...e.lines);
    if (heldLines.length > MAX_LINES) heldLines.splice(0, heldLines.length - MAX_LINES);
  });
}
/** A script's write, done on the page (the engine's thread has no port). */
export function applySerialOut(m: { text?: string; bytes?: number[]; pin?: number; mode?: Mode; digital?: number; analog?: number }) {
  const run = async () => {
    if (m.text !== undefined) await serialLink.writeText(m.text);
    if (m.bytes) await serialLink.writeBytes(m.bytes);
    if (m.pin !== undefined && m.mode) await serialLink.pinMode(m.pin, m.mode);
    if (m.pin !== undefined && m.digital !== undefined) await serialLink.digitalWrite(m.pin, m.digital);
    if (m.pin !== undefined && m.analog !== undefined) await serialLink.analogWrite(m.pin, m.analog);
  };
  void run().catch(() => { /* the device went away: the window says so */ });
}
