import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isViewAsToken, issueSessionToken, sessionSource, VIEW_AS_SRC, VIEW_AS_TTL_SEC, verifySessionToken, viewAsRefused } from './session-token';
import { viewAsBlocked } from './auth';
import { schoolHealth } from '@/lib/owner-console';

// Stage 5 · Q19 Owner console: the read-only "view as" and the schools' health. Throwaway settings only.
const SECRET = 'test-only-session-secret-0123456789abcdef';

describe('view as (read-only)', () => {
  beforeEach(() => vi.stubEnv('SESSION_SECRET', SECRET));
  afterEach(() => vi.unstubAllEnvs());

  it('is a 30-minute session for that person, marked as a view', () => {
    const t = issueSessionToken('u1', VIEW_AS_SRC, VIEW_AS_TTL_SEC);
    expect(verifySessionToken(t)).toBe('u1');
    expect(isViewAsToken(t)).toBe(true);
    expect(sessionSource(issueSessionToken('u1'))).toBe('lti');
    expect(isViewAsToken(issueSessionToken('u1'))).toBe(false);
    expect(isViewAsToken('mock-token-u1')).toBe(false);
    expect(isViewAsToken(null)).toBe(false);
    const exp = JSON.parse(Buffer.from(t.slice(4).split('.')[0], 'base64url').toString()).exp * 1000;
    expect(exp - Date.now()).toBeLessThanOrEqual(30 * 60_000);
    expect(exp - Date.now()).toBeGreaterThan(29 * 60_000);
  });

  it('can read but never change anything, nor see private messages', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(viewAsRefused(m, '/api/core/courses/c1')).toBe(true);
      expect(viewAsRefused(m, '/api/assignments/a1/submit')).toBe(true);
    }
    expect(viewAsRefused('GET', '/api/core/courses')).toBe(false);
    expect(viewAsRefused('GET', '/api/student/overview')).toBe(false);
    // The start-up batch only reads (its live-updates ticket and sign-in entry are skipped).
    expect(viewAsRefused('POST', '/api/bootstrap')).toBe(false);
    for (const p of ['/api/chat/conversations', '/api/chat/incoming', '/api/core/messages/conversations', '/api/calls/c1/ticket', '/api/realtime/ticket', '/api/call-recordings/r1', '/api/files/link']) {
      expect(viewAsRefused('GET', p)).toBe(true);
    }
  });

  it('is refused at the door for view tokens only', () => {
    const view = issueSessionToken('u1', VIEW_AS_SRC, VIEW_AS_TTL_SEC);
    const lti = issueSessionToken('u1');
    const post = new Request('https://x.test/api/core/announcements', { method: 'POST' });
    const read = new Request('https://x.test/api/core/announcements');
    expect(viewAsBlocked(post, view)).toBe(true);
    expect(viewAsBlocked(read, view)).toBe(false);
    expect(viewAsBlocked(post, lti)).toBe(false);
    expect(viewAsBlocked(post, null)).toBe(false);
    // Claiming to be a view only ever refuses more: a forged src fails verification anyway.
    const forged = `ut1.${Buffer.from(JSON.stringify({ uid: 'u1', iat: 1, exp: 9e9, src: 'lti' })).toString('base64url')}.${view.split('.')[2]}`;
    expect(verifySessionToken(forged)).toBeNull();
  });
});

describe('school health', () => {
  const now = Date.UTC(2026, 9, 20);
  const base = { subscriptionStatus: 'active', cancelAtPeriodEnd: false, trialEndsAt: null, seats: 50, members: 40, active: 30, open: 0 };

  it('says what to look at, worst first', () => {
    expect(schoolHealth(base, now)).toEqual({ health: 'good', reasons: [] });
    expect(schoolHealth({ ...base, subscriptionStatus: 'past_due' }, now).health).toBe('risk');
    expect(schoolHealth({ ...base, cancelAtPeriodEnd: true }, now).reasons).toEqual(['Cancels at the end of this period']);
    expect(schoolHealth({ ...base, active: 2 }, now)).toEqual({ health: 'watch', reasons: ['Few people active this week'] });
    expect(schoolHealth({ ...base, members: 60 }, now).reasons).toEqual(['Over its seats (60 of 50)']);
    expect(schoolHealth({ ...base, open: 7 }, now).reasons).toEqual(['7 open safety reports']);
    expect(schoolHealth({ ...base, subscriptionStatus: null, trialEndsAt: new Date(now + 36 * 3600_000) }, now).reasons).toEqual(['Trial ends in 2 days']);
    expect(schoolHealth({ ...base, subscriptionStatus: null, trialEndsAt: new Date(now + 3600_000) }, now).reasons).toEqual(['Trial ends in 1 day']);
    expect(schoolHealth({ ...base, members: 3, active: 0 }, now).health).toBe('good'); // too small to judge
  });
});
