import { describe, expect, it } from 'vitest';
import { fingerprints, securityCode } from './call-security';

const sdp = (fp: string) => `v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\na=fingerprint:sha-256 ${fp}\r\na=setup:actpass\r\n`;
const A = 'AA:BB:CC:DD', B = '11:22:33:44', C = '99:88:77:66';

describe('call security codes', () => {
  it('reads the fingerprints of an SDP', () => {
    expect(fingerprints(sdp(A))).toEqual(['sha-256 AA:BB:CC:DD']);
    expect(fingerprints('')).toEqual([]);
  });
  it('is the same on both ends, and changes if either side is swapped', async () => {
    const mine = await securityCode(sdp(A), sdp(B));
    expect(mine).toMatch(/^\d{4} \d{4} \d{4} \d{4}$/);
    expect(await securityCode(sdp(B), sdp(A))).toBe(mine);
    expect(await securityCode(sdp(A), sdp(C))).not.toBe(mine);
    expect(await securityCode(sdp(A), '')).toBeNull();
  });
});
