import { describe, expect, it } from 'vitest';
import { essHumidity, essTemperature, htsTemperature } from './ble-thermometer';

const view = (...bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);

describe('Bluetooth thermometer values', () => {
  it('reads Environmental Sensing temperature and humidity', () => {
    expect(essTemperature(view(0x9a, 0x01))).toBe(4.1); // 410 → 4.10 °C
    expect(essTemperature(view(0x38, 0xff))).toBe(-2); // -200 → -2.00 °C
    expect(essTemperature(view(0x00, 0x80))).toBeNull(); // not known
    expect(essHumidity(view(0x10, 0x27))).toBe(100); // 10000 → 100 %
    expect(essHumidity(view(0xff, 0xff))).toBeNull();
  });

  it('reads Health Thermometer floats in °C and °F', () => {
    expect(htsTemperature(view(0x00, 0x29, 0x00, 0x00, 0xff))).toBe(4.1); // 41 × 10^-1 °C
    expect(htsTemperature(view(0x01, 0x8a, 0x01, 0x00, 0xff))).toBe(4.11); // 39.4 °F
    expect(htsTemperature(view(0x00, 0xff, 0xff, 0x7f, 0x00))).toBeNull(); // NaN
    expect(htsTemperature(view(0x00, 0xec, 0xff, 0xff, 0xff))).toBe(-2); // -20 × 10^-1
  });
});
