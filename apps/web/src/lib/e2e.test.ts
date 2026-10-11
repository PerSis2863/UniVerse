import { describe, expect, it } from 'vitest';
import { decryptFrom, encryptFor, exportPublic, newDeviceKey, safetyCode, validPayload } from './e2e';

async function device(id: string) {
  const k = await newDeviceKey();
  return { deviceId: id, privateKey: k.privateKey, publicKey: await exportPublic(k.publicKey) };
}

describe('private chat encryption', () => {
  it('lets every device it was sent to read it, and nobody else', async () => {
    const asha = await device('asha-phone'), ashaLaptop = await device('asha-laptop'), ben = await device('ben-phone'), eve = await device('eve');
    const p = await encryptFor('Meet at 5 ☀️', asha, [asha, ashaLaptop, ben]);
    expect(p.ct).not.toContain('Meet');
    expect(validPayload(p)).toBe(true);
    expect(await decryptFrom(p, ben, asha.publicKey)).toBe('Meet at 5 ☀️');
    expect(await decryptFrom(p, ashaLaptop, asha.publicKey)).toBe('Meet at 5 ☀️');
    expect(await decryptFrom(p, asha, asha.publicKey)).toBe('Meet at 5 ☀️');
    await expect(decryptFrom(p, eve, asha.publicKey)).rejects.toThrow('not-for-this-device');
    // Eve can't pretend to be Ben's device either.
    await expect(decryptFrom(p, { ...eve, deviceId: 'ben-phone' }, asha.publicKey)).rejects.toThrow();
  });
  it('notices a changed message', async () => {
    const a = await device('a'), b = await device('b');
    const p = await encryptFor('hello', a, [a, b]);
    const tampered = { ...p, ct: p.ct.slice(0, -4) + (p.ct.endsWith('AAA=') ? 'BBB=' : 'AAA=') };
    await expect(decryptFrom(tampered, b, a.publicKey)).rejects.toThrow();
  });
  it('gives both people the same safety code, and checks payloads', async () => {
    const a = await device('a'), b = await device('b');
    const one = await safetyCode([a.publicKey, b.publicKey]), two = await safetyCode([b.publicKey, a.publicKey]);
    expect(one).toBe(two);
    expect(one).toMatch(/^\d{4}( \d{4}){5}$/);
    expect(validPayload({ v: 1, from: 'x', iv: 'AAAA', ct: '<script>', keys: { d: { iv: 'AA', wk: 'AA' } } })).toBe(false);
    expect(validPayload(null)).toBe(false);
  });
});
