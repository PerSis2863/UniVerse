import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { recordingBlocked, schoolPolicy, setSchoolPolicy } from './safety';

// Each school its own safety policy (M190): an admin's change writes only their school's row and
// moves only their school's students' quiet hours; a school without a row has the safe defaults.

vi.mock('@/lib/db', () => ({
  default: {
    organization: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    schoolPolicy: { findUnique: vi.fn(), upsert: vi.fn() },
    quietHours: { deleteMany: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock('./auth', () => ({ isOwner: () => false }));
vi.mock('./email', () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock('./services/push.service', () => ({ pushService: { sendToMany: vi.fn() } }));
vi.mock('./gemini', () => ({ geminiJson: vi.fn() }));
vi.mock('./ai-budget', () => ({ spendAi: vi.fn() }));
vi.mock('./moderation', () => ({ featureOff: vi.fn() }));

const db = prisma as unknown as {
  organization: { findUnique: ReturnType<typeof vi.fn> };
  user: { findMany: ReturnType<typeof vi.fn> };
  schoolPolicy: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
  quietHours: { deleteMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
};
const row = (id: string, recordMinors: boolean) => ({ id, guard: true, recordMinors, quietMinors: true, quietStart: '22:00', quietEnd: '07:00', studentsMinors: true, parentMessaging: true });

beforeEach(() => {
  vi.clearAllMocks();
  db.organization.findUnique.mockResolvedValue(null);
});

describe('school policies', () => {
  it('an admin of school A changes only school A', async () => {
    db.schoolPolicy.findUnique.mockResolvedValue(null);
    await setSchoolPolicy({ id: 'adm', name: 'A', email: 'a@x', role: 'ADMIN', organizationId: 'orgA' }, { quietMinors: false });
    expect(db.schoolPolicy.upsert).toHaveBeenCalledTimes(1);
    expect(db.schoolPolicy.upsert.mock.calls[0][0].where).toEqual({ id: 'orgA' });
    expect(db.quietHours.deleteMany).toHaveBeenCalledWith({ where: { bySchool: true, user: { organizationId: { in: ['orgA'] } } } });
  });

  it('the main school is the row "main"', async () => {
    db.schoolPolicy.findUnique.mockResolvedValue(null);
    await setSchoolPolicy({ id: 'adm2', name: 'M', email: 'm@x', role: 'ADMIN', organizationId: null }, { guard: false });
    expect(db.schoolPolicy.upsert.mock.calls[0][0].where).toEqual({ id: 'main' });
  });

  it('a school with no row has the safe defaults', async () => {
    db.schoolPolicy.findUnique.mockResolvedValue(null);
    expect((await schoolPolicy('orgNew')).recordMinors).toBe(false);
  });

  it('recording follows each student’s own school', async () => {
    db.schoolPolicy.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => row(where.id, where.id === 'orgAllow'));
    db.user.findMany.mockResolvedValue([{ id: 's1', role: 'STUDENT', dateOfBirth: null, organizationId: 'orgAllow' }]);
    expect(await recordingBlocked(['s1'])).toBe(false);
    db.user.findMany.mockResolvedValue([{ id: 's2', role: 'STUDENT', dateOfBirth: null, organizationId: 'orgDeny' }]);
    expect(await recordingBlocked(['s2'])).toBe(true);
  });
});
