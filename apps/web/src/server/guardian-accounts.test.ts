import { describe, expect, it } from 'vitest';
import { newCode, normalizeCode } from './guardian-accounts';
import { guardianBlocked } from './auth';
import { homeFor } from '@/lib/role-home';

describe('guardian link codes', () => {
  it('makes 8-character codes without look-alike characters', () => {
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/);
    expect(new Set(Array.from({ length: 200 }, newCode)).size).toBe(200);
  });
  it('reads codes the way people type them', () => {
    expect(normalizeCode('abcd-2345')).toBe('ABCD2345');
    expect(normalizeCode(' AB CD 23 45 ')).toBe('ABCD2345');
    expect(normalizeCode('ABCD234')).toBeNull(); // too short
    expect(normalizeCode('ABCD234O')).toBeNull(); // O isn't used
    expect(normalizeCode(12345678)).toBeNull();
  });
});

describe('guardian allowlist', () => {
  const req = (path: string) => new Request(`https://x.test${path}`);
  const guardian = { role: 'GUARDIAN' };
  it('lets parent accounts use the parent app and their own account', () => {
    for (const p of ['/api/parent/children', '/api/parent/children/abc', '/api/parent/chats', '/api/parent/chats/abc', '/api/me', '/api/bootstrap', '/api/notifications', '/api/realtime/ticket', '/api/core/users/me', '/api/core/users/me/deletion', '/api/core/auth/register', '/api/core/auth/me', '/api/core/notifications/subscribe']) {
      expect(guardianBlocked(req(p), guardian), p).toBe(false);
    }
  });
  it('refuses everything else', () => {
    for (const p of ['/api/courses', '/api/chat/users', '/api/chat/incoming', '/api/upload', '/api/core/users', '/api/core/users/abc', '/api/core/courses', '/api/me/presence', '/api/parents', '/api/student/overview', '/api/report-cards/mine', '/api/chat/conversations', '/api/chat/conversations/abc/messages', '/api/teacher/parents', '/api/teacher/parent-hours']) {
      expect(guardianBlocked(req(p), guardian), p).toBe(true);
    }
  });
  it('never limits other roles', () => {
    expect(guardianBlocked(req('/api/courses'), { role: 'STUDENT' })).toBe(false);
  });
});

describe('homeFor', () => {
  it('sends each role to its home', () => {
    expect(homeFor({ role: 'GUARDIAN' })).toBe('/parent');
    expect(homeFor({ role: 'TEACHER' })).toBe('/teacher');
    expect(homeFor({ role: 'ADMIN', owner: true })).toBe('/console');
    expect(homeFor({ role: 'INDUSTRY_MENTOR' })).toBe('/student');
    expect(homeFor(null)).toBe('/login');
  });
});
