import { describe, expect, it } from 'vitest';
import { decryptFile, encryptFile, fileEnvelope, kindOf, readEnvelope } from './e2e-file';

describe('private files', () => {
  it('encrypts so the bytes are unreadable, and only the key opens them', async () => {
    const plain = new TextEncoder().encode('a photo, say');
    const { data, k, iv } = await encryptFile(plain.buffer);
    expect(new TextDecoder().decode(data)).not.toContain('photo');
    expect(new TextDecoder().decode(await decryptFile(data.buffer as ArrayBuffer, k, iv))).toBe('a photo, say');
    const other = await encryptFile(plain.buffer);
    await expect(decryptFile(data.buffer as ArrayBuffer, other.k, iv)).rejects.toThrow();
    const tampered = data.slice(); tampered[0] ^= 1;
    await expect(decryptFile(tampered.buffer, k, iv)).rejects.toThrow();
  });
  it('tells a file from words, and only trusts this site’s addresses', () => {
    const f = { url: '/api/files/abcdefghijklmnop', k: 'a', iv: 'b', name: 'x.jpg', mime: 'image/jpeg', size: 3, kind: kindOf('image/jpeg') };
    expect(readEnvelope(fileEnvelope(f))).toEqual(f);
    expect(readEnvelope('hello')).toBeNull();
    expect(readEnvelope(fileEnvelope({ ...f, url: 'javascript:alert(1)' }))).toBeNull();
  });
});
