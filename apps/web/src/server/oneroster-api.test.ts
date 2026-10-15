import { beforeEach, describe, expect, it, vi } from 'vitest';

// The outbound OneRoster routes (GET /api/oneroster/v1p2/*) once answered anyone, listing every
// account's name, email and role. They now need a school's API key and give only that school's data.
const db = vi.hoisted(() => ({ user: { findMany: vi.fn() }, course: { findMany: vi.fn() }, enrollment: { findMany: vi.fn() }, organization: { findUnique: vi.fn() } }));
vi.mock('@/lib/db', () => ({ default: db }));
vi.mock('./public-api', async () => {
  const { UnauthorizedException, ForbiddenException } = await import('./http');
  return {
    verifyApiKey: vi.fn(async (header: string | null, scope: string) => {
      if (!header) throw new UnauthorizedException('Missing Authorization header.');
      if (header === 'Bearer uv_live_courses' && scope !== 'courses.read') throw new ForbiddenException(`API key does not possess required scope: ${scope}`);
      return { apiKeyId: 'k1', name: 'SIS', organization: { id: 'org_1', name: 'School', slug: 'school' }, scopes: [] };
    }),
  };
});

import { GET as users } from '@/app/api/oneroster/v1p2/users/route';
import { GET as enrollments } from '@/app/api/oneroster/v1p2/enrollments/route';
import { GET as courses } from '@/app/api/oneroster/v1p2/courses/route';

const req = (path: string, key?: string) => new Request(`https://universe.test/api/oneroster/v1p2/${path}`, { headers: key ? { authorization: `Bearer ${key}` } : {} });

describe('OneRoster REST reads', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses requests without an API key', async () => {
    for (const run of [users(req('users')), enrollments(req('enrollments')), courses(req('courses'))]) {
      const res = await run;
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('needs the right scope for people', async () => {
    const res = await users(req('users', 'uv_live_courses'));
    expect(res.status).toBe(403);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('answers with the key’s school only, never cached by others', async () => {
    db.user.findMany.mockResolvedValue([{ id: 'u1', name: 'Asha Rao', email: 'asha@school.test', role: 'STUDENT', status: 'ACTIVE', updatedAt: new Date('2026-10-01') }]);
    db.enrollment.findMany.mockResolvedValue([]);
    db.course.findMany.mockResolvedValue([]);
    const res = await users(req('users?role=student&limit=abc&offset=-5', 'uv_live_all'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect((await res.json()).users[0]).toMatchObject({ sourcedId: 'u1', givenName: 'Asha', role: 'student' });
    expect(db.user.findMany.mock.calls[0][0]).toMatchObject({ where: { organizationId: 'org_1', role: 'STUDENT' }, take: 100, skip: 0 });
    await enrollments(req('enrollments', 'uv_live_all'));
    expect(db.enrollment.findMany.mock.calls[0][0].where).toEqual({ student: { organizationId: 'org_1' } });
    await courses(req('courses', 'uv_live_courses'));
    expect(db.course.findMany.mock.calls[0][0].where).toEqual({ teacher: { organizationId: 'org_1' } });
  });
});
