import { describe, expect, it } from 'vitest';
import { base32, codeAt, fromBase32, matchStep, otpauthUrl, stepOf } from './totp';

// RFC 6238's SHA-1 test secret ("12345678901234567890") and its published codes (last 6 of 8 digits).
const SECRET = base32(Buffer.from('12345678901234567890'));

describe('authenticator codes', () => {
  it('round-trips base32', () => {
    expect(SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(fromBase32(SECRET).toString()).toBe('12345678901234567890');
  });

  it('matches RFC 6238', () => {
    expect(codeAt(SECRET, stepOf(59_000))).toBe('287082');
    expect(codeAt(SECRET, stepOf(1_111_111_109_000))).toBe('081804');
    expect(codeAt(SECRET, stepOf(1_234_567_890_000))).toBe('005924');
  });

  it('takes a step either side once, never twice', () => {
    const now = 1_234_567_890_000, s = stepOf(now);
    expect(matchStep(SECRET, codeAt(SECRET, s - 1), null, now)).toBe(s - 1);
    expect(matchStep(SECRET, codeAt(SECRET, s), s, now)).toBeNull();
    expect(matchStep(SECRET, codeAt(SECRET, s - 2), null, now)).toBeNull();
    expect(matchStep(SECRET, '12 34', null, now)).toBeNull();
  });

  it('builds the app’s link', () => {
    expect(otpauthUrl('ABC', 'a@b.co')).toBe('otpauth://totp/UniVerse%3Aa%40b.co?secret=ABC&issuer=UniVerse&algorithm=SHA1&digits=6&period=30');
  });
});

describe('who is asked for a second step', () => {
  const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
  it('asks admins (with email) and anyone who turned on an app', async () => {
    const { needsTwoStep } = await import('./two-step');
    const old = { s: process.env.SESSION_SECRET, r: process.env.RESEND_API_KEY, off: process.env.TWO_STEP_OFF };
    process.env.SESSION_SECRET = 'x'.repeat(40);
    delete process.env.RESEND_API_KEY; delete process.env.TWO_STEP_OFF;
    const t = jwt({ auth_time: 1_700_000_000 });
    expect(needsTwoStep('STUDENT', t)).toBe(false);
    expect(needsTwoStep('STUDENT', t, true)).toBe(true);
    expect(needsTwoStep('ADMIN', t)).toBe(false); // no email service: admins aren't asked
    process.env.RESEND_API_KEY = 're_x';
    expect(needsTwoStep('ADMIN', t)).toBe(true);
    expect(needsTwoStep('STUDENT', 'mock-token-a@b.co', true)).toBe(false); // demo tokens never
    process.env.TWO_STEP_OFF = '1';
    expect(needsTwoStep('STUDENT', t, true)).toBe(false);
    Object.assign(process.env, { SESSION_SECRET: old.s ?? '', RESEND_API_KEY: old.r ?? '', TWO_STEP_OFF: old.off ?? '' });
  });
});
