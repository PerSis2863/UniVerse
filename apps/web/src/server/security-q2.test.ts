import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readCspReports } from '@/lib/csp-report';

// Stage 5 · A8 (security): passkey challenges, private file links and CSP reports. Throwaway
// settings only (no real secrets).
const SECRET = 'test-only-session-secret-0123456789abcdef';

describe('passkey challenges', () => {
  beforeEach(() => vi.stubEnv('SESSION_SECRET', SECRET));
  afterEach(() => vi.unstubAllEnvs());

  it('are ours, for one purpose and person, and only for 5 minutes', async () => {
    const { challengeTime, issueChallenge } = await import('./passkeys');
    const now = 1_760_000_000_000;
    const c = issueChallenge('two-step', 'u1', now);
    expect(challengeTime(c, 'two-step', 'u1', now + 1000)).toBe(now);
    expect(challengeTime(c, 'two-step', 'u2', now)).toBeNull(); // someone else
    expect(challengeTime(c, 'signin', '', now)).toBeNull(); // another purpose
    expect(challengeTime(c, 'two-step', 'u1', now + 5 * 60_000 + 1)).toBeNull(); // too old
    const forged = Buffer.from(Buffer.from(c, 'base64url').toString().replace('u1', 'u2')).toString('base64url');
    expect(challengeTime(forged, 'two-step', 'u2', now)).toBeNull(); // signature no longer matches
    expect(issueChallenge('signin', '', now)).not.toBe(issueChallenge('signin', '', now)); // random
    vi.stubEnv('SESSION_SECRET', '');
    expect(challengeTime(c, 'two-step', 'u1', now)).toBeNull(); // passkeys off without the secret
  });
});

describe('private files', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries({ R2_ACCOUNT_ID: 'acct123', R2_ACCESS_KEY_ID: 'test-key-id', R2_SECRET_ACCESS_KEY: 'test-secret', R2_BUCKET: 'files', NEXT_PUBLIC_FILES_URL: 'https://files.example.test' })) vi.stubEnv(k, v);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('knows which files are private from where they are stored', async () => {
    const { privateKind } = await import('./private-files');
    expect(privateKind('recordings/c123/2026-10-14-abc.webm')).toEqual({ kind: 'class-recording', courseId: 'c123' });
    expect(privateKind('recordings/calls/g_abc/2026-10-14-x.webm')).toEqual({ kind: 'call-recording', callId: 'g_abc' });
    expect(privateKind('uploads/u1/key/id-card.pdf')).toEqual({ kind: 'upload', ownerId: 'u1' });
    expect(privateKind('chat/x.png')).toBeNull();
  });

  it('signs a 10-minute R2 link for one of our files, and nothing else', async () => {
    const { r2KeyOf, r2PresignGet } = await import('@/lib/r2');
    expect(r2KeyOf('https://files.example.test/recordings/c1/a%20b.webm?x=1')).toBe('recordings/c1/a b.webm');
    expect(r2KeyOf('https://evil.example/recordings/c1/a.webm')).toBeNull();
    expect(r2KeyOf('https://files.example.test/recordings/../uploads/u/x')).toBeNull();
    const link = new URL(await r2PresignGet('recordings/c1/a b.webm', 600));
    expect(link.origin).toBe('https://acct123.r2.cloudflarestorage.com');
    expect(link.pathname).toBe('/files/recordings/c1/a%20b.webm');
    expect(link.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(link.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('CSP reports', () => {
  it('reads both report formats, without query strings', () => {
    const old = JSON.stringify({ 'csp-report': { 'document-uri': 'https://universeimpact.com/student?token=secret', 'violated-directive': 'script-src-elem', 'blocked-uri': 'https://evil.example/x.js?y=1', 'script-sample': '' } });
    expect(readCspReports('application/csp-report', old)).toEqual([{ key: 'script-src-elem|https://evil.example/x.js|/student', directive: 'script-src-elem', blocked: 'https://evil.example/x.js', page: '/student', sample: null }]);
    const api = JSON.stringify([
      { type: 'csp-violation', body: { documentURL: 'https://universeimpact.com/docs/a', effectiveDirective: 'img-src', blockedURL: 'https://cdn.example/p.png', sample: '' } },
      { type: 'deprecation', body: {} },
      { type: 'csp-violation', body: { documentURL: 'https://universeimpact.com/', effectiveDirective: 'script-src-attr', blockedURL: 'inline', sample: 'alert(1)' } },
    ]);
    expect(readCspReports('application/reports+json', api).map((r) => r.key)).toEqual(['img-src|https://cdn.example/p.png|/docs/a', 'script-src-attr|inline|/']);
    expect(readCspReports('application/csp-report', 'not json')).toEqual([]);
    expect(readCspReports('application/csp-report', '{}')).toEqual([]);
  });
});
