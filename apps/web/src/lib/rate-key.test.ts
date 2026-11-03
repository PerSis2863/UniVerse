import { describe, expect, it } from 'vitest';
import { claimedAccount, rateKey } from './rate-key';

const jwt = (claims: object) => `Bearer eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig${String(Math.random()).slice(2)}`;

describe('rate-limit key (M78)', () => {
  it('names the account inside the token, not the token', () => {
    expect(claimedAccount(jwt({ user_id: 'abc', sub: 'abc', iat: 1 }))).toBe('abc');
    // Two different tokens for one person share one count.
    expect(rateKey(jwt({ sub: 'abc', iat: 1 }), '1.2.3.4')).toBe(rateKey(jwt({ sub: 'abc', iat: 2 }), '1.2.3.4'));
    expect(claimedAccount(`Bearer ut1.${Buffer.from(JSON.stringify({ uid: 'u9' })).toString('base64url')}.mac`)).toBe('u9');
    expect(claimedAccount('Bearer mock-token-demo@student.com')).toBe('mock-token-demo@student.com');
  });

  it('a made-up token falls back to the address', () => {
    expect(rateKey('Bearer random-junk-1', '1.2.3.4')).toBe('ip:1.2.3.4');
    expect(rateKey('Bearer a.b.c', '1.2.3.4')).toBe('ip:1.2.3.4');
    expect(rateKey(null, '1.2.3.4')).toBe('ip:1.2.3.4');
    // A forged name is only ever counted together with the sender's address.
    expect(rateKey(jwt({ sub: 'victim' }), '6.6.6.6')).toBe('u:victim@6.6.6.6');
  });
});
