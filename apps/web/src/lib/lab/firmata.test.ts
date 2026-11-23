import { describe, expect, it } from 'vitest';
import { encode, Parser, parsePlotLine, SimBoard } from './firmata';

describe('Hyperion hardware: Firmata and the plotter format (M474)', () => {
  it('reads messages split anywhere, and skips noise', () => {
    const p = new Parser(), bytes = [0x12, 0xf9, 2, 6, 0xe3, 0x7f, 0x07, 0x91, 0x05, 0x00, 0xf0, 0x71, 0x48, 0, 0x69, 0, 0xf7];
    const ev = [...p.feed(bytes.slice(0, 5)), ...p.feed(bytes.slice(5, 11)), ...p.feed(bytes.slice(11))];
    expect(ev).toEqual([{ type: 'version', major: 2, minor: 6 }, { type: 'analog', channel: 3, value: 1023 }, { type: 'digital', port: 1, mask: 5 }, { type: 'string', text: 'Hi' }]);
  });
  it('talks to the simulated Uno: capabilities, writes, analog and digital reports', () => {
    const b = new SimBoard(), p = new Parser();
    const first = p.feed(b.read());
    expect(first[0]).toEqual({ type: 'version', major: 2, minor: 6 });
    expect(first[1]).toMatchObject({ type: 'firmware', name: 'Simulated Uno' });
    b.write([...encode.capabilities(), ...encode.analogMapping()]);
    const [caps, map] = p.feed(b.read());
    expect(caps.type === 'capabilities' && caps.pins.length).toBe(20);
    expect(caps.type === 'capabilities' && caps.pins[9].modes.pwm).toBe(8);
    expect(caps.type === 'capabilities' && caps.pins[14].modes.analog).toBe(10);
    expect(map.type === 'analogMap' && map.map.slice(13, 16)).toEqual([-1, 0, 1]);
    // Pin 8 an output, pin 7 an input wired to it: writing 1 on 8 reads 1 on 7.
    b.write([...encode.pinMode(8, 'output'), ...encode.pinMode(7, 'input'), ...encode.reportDigital(0, true), ...encode.reportDigital(1, true)]);
    p.feed(b.read());
    b.write(encode.digitalWrite(8, 1));
    const port0 = p.feed(b.read()).filter((e) => e.type === 'digital' && e.port === 0).pop();
    expect(port0 && port0.type === 'digital' && (port0.mask >> 7) & 1).toBe(1);
    b.write([...encode.reportAnalog(0, true), ...encode.reportAnalog(5, true), ...encode.pinMode(9, 'pwm'), ...encode.analogWrite(9, 200)]);
    const an = p.feed(b.read(0.05)).filter((e) => e.type === 'analog');
    expect(an.map((e) => e.type === 'analog' && e.channel)).toEqual([0, 5]);
    expect(an[1].type === 'analog' && an[1].value).toBe(800);
    expect(encode.analogWrite(20, 300)).toEqual([0xf0, 0x6f, 20, 300 & 127, 2, 0xf7]);
  });
  it('the Serial Plotter format', () => {
    expect(parsePlotLine('temp:21.5,light:300')).toEqual({ names: ['temp', 'light'], values: [21.5, 300] });
    expect(parsePlotLine('1 2\t3')).toEqual({ names: [null, null, null], values: [1, 2, 3] });
    expect(parsePlotLine('hello')).toBeNull();
  });
});

import { Lab } from './interp';
import { serialFeed, type SerialOut } from './serial-lab';
import { toMat } from './values';

describe('serial devices and Arduino in scripts (M474)', () => {
  const lab = (sent: SerialOut[]) => new Lab({ out: () => {}, serial: (m) => sent.push(m as SerialOut) });
  it('reads the lines sent before the run and writes as it runs', () => {
    serialFeed({ state: { open: true, name: 'Simulated Arduino Uno', baud: 115200, firmata: false, pins: [] }, lines: ['temp:21.5,light:300', 'temp:21.6,light:310'] });
    const sent: SerialOut[] = [], l = lab(sent);
    l.run("s = serialport('x', 9600); a = readline(s); writeline(s, 'LED ON'); b = readline(s); c = readline(s); write(s, [1 2 300]);");
    expect((l.vars.get('a') as { v: string }).v).toBe('temp:21.5,light:300');
    expect(toMat(l.vars.get('c')!).d.length).toBe(0);
    expect(sent).toEqual([{ text: 'LED ON\n' }, { bytes: [1, 2, 255] }]);
    expect(() => l.run('a = arduino();')).toThrow(/Firmata/);
  });
  it('drives an Arduino by Firmata', () => {
    const pins = Array.from({ length: 20 }, (_, i) => ({ name: i >= 14 ? `A${i - 14}` : `D${i}`, modes: i < 2 ? [] : i >= 14 ? ['input', 'output', 'analog'] : [3, 5, 6, 9, 10, 11].includes(i) ? ['input', 'output', 'pwm'] : ['input', 'output'], value: i === 14 ? 1023 : 0 }));
    serialFeed({ state: { open: true, name: 'Uno', baud: 57600, firmata: true, pins } });
    const sent: SerialOut[] = [], l = lab(sent);
    l.run("a = arduino(); writeDigitalPin(a, 'D13', 1); v = readVoltage(a, 'A0'); writePWMVoltage(a, 'D9', 2.5); m = configurePin(a, 'D13');");
    expect(toMat(l.vars.get('v')!).d[0]).toBeCloseTo(5, 10);
    expect((l.vars.get('m') as { v: string }).v).toBe('DigitalOutput');
    expect(sent).toEqual([{ pin: 13, mode: 'output' }, { pin: 13, digital: 1 }, { pin: 14, mode: 'analog' }, { pin: 9, mode: 'pwm' }, { pin: 9, analog: 128 }]);
    expect(() => l.run("writePWMDutyCycle(a, 'D7', 0.5)")).toThrow(/can’t/);
    serialFeed({ state: { open: false, name: '', baud: 0, firmata: false, pins: [] } });
    expect(() => l.run('s = serialport();')).toThrow(/No device/);
  });
});
