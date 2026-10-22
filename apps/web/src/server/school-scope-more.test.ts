import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { PATCH as patchReport } from '@/app/api/impact-reports/[id]/route';
import { groupAccess } from './spaces';
import { canReadDoc, docRights } from './docs';
import { studentParents, teacherParentChat } from './parent-messages';
import { addOfficeNote } from './office-hours';
import { canReadTaskBoard } from './tasks';
import { computeReport, issueReport } from './impact-report';
import { listAssignments } from './assignments';

// An admin of school A reaches school A's docs, task boards, students' parents, office notes,
// impact reports and assignments, and gets "not found" (or nothing in lists) for school B's
// (security fix, school-scope.ts). Teachers keep exactly their access; the platform owner sees all.

vi.mock('@/lib/db', () => ({
  default: {
    organization: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    doc: { findUnique: vi.fn() },
    conversationParticipant: { findUnique: vi.fn() },
    taskBoard: { findUnique: vi.fn() },
    guardianLink: { findMany: vi.fn(), findFirst: vi.fn() },
    officeNote: { create: vi.fn() },
    impactCertificate: { findMany: vi.fn() },
    nGO: { findMany: vi.fn() },
    impactReport: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    assignment: { findMany: vi.fn() },
    assignmentSubmission: { groupBy: vi.fn() },
  },
}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: {} }) }));
vi.mock('@/lib/server-auth', () => ({ getSessionUser: vi.fn() }));
vi.mock('./auth', () => ({ isOwner: () => false }));
vi.mock('./audit', () => ({ audit: vi.fn() }));
vi.mock('./spaces', () => ({ groupAccess: vi.fn(), groupPeople: vi.fn(async () => []), mySpaces: vi.fn(async () => ({ courses: [], groups: [] })) }));
vi.mock('./communities', () => ({ channelSendCheck: vi.fn() }));
vi.mock('./mentions', () => ({ notifyMentioned: vi.fn() }));
vi.mock('./semester', () => ({ indexDoc: vi.fn(), indexLater: vi.fn(), indexWork: vi.fn() }));
vi.mock('./search-index', () => ({ docLink: vi.fn(), indexItem: vi.fn(), indexTitle: vi.fn(), plainText: (s: string) => s }));
vi.mock('./realtime', () => ({ publish: vi.fn(), publishChat: vi.fn() }));
vi.mock('./email', () => ({ notify: vi.fn(), notifyMany: vi.fn(), later: vi.fn() }));
vi.mock('./services/push.service', () => ({ pushService: { sendToMany: vi.fn() } }));
vi.mock('./safety', () => ({ schoolPolicy: vi.fn(async () => ({ parentMessaging: true })) }));
vi.mock('./chat-notify', () => ({ afterSend: vi.fn() }));
vi.mock('./translate', () => ({ storedTranslations: vi.fn(), translateMessages: vi.fn(), translateTexts: vi.fn() }));
vi.mock('./calls', () => ({ officeRoom: vi.fn() }));
vi.mock('./services/credential-signer', () => ({
  publicAppUrl: () => 'https://app.test',
  CredentialSigner: { signJwt: vi.fn(() => 'jwt'), jwks: () => ({ keys: [{ kid: 'k' }] }), verifyJwt: vi.fn() },
}));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as Record<string, Record<string, Fn>>;
const auth = getSessionUser as unknown as Fn;
const adminA = () => ({ id: 'a1', name: 'A', email: 'a@x', role: 'ADMIN', organizationId: 'orgA' });
const adminMain = () => ({ id: 'a0', name: 'M', email: 'm@x', role: 'ADMIN', organizationId: null });
const owner = () => ({ id: 'o1', name: 'O', email: 'o@x', role: 'ADMIN', organizationId: null, owner: true });
const teacherB = () => ({ id: 'tB', name: 'TB', email: 'tb@x', role: 'TEACHER', organizationId: 'orgB' });
const notFound = { status: 404 };

// The people, with their schools; the user lookups below apply the school filters to them.
const people: Record<string, { role: string; organizationId: string | null }> = {
  a1: { role: 'ADMIN', organizationId: 'orgA' }, aB: { role: 'ADMIN', organizationId: 'orgB' },
  tA: { role: 'TEACHER', organizationId: 'orgA' }, tB: { role: 'TEACHER', organizationId: 'orgB' },
  sA: { role: 'STUDENT', organizationId: 'orgA' }, sB: { role: 'STUDENT', organizationId: 'orgB' },
};
const teaches = new Set(['sB']); // teacherB teaches sB, not sA
type OrgWhere = { organizationId?: string | null | { in: string[] }; OR?: OrgWhere[] };
const orgOk = (w: OrgWhere, org: string | null): boolean => {
  if (w.OR) return w.OR.some((x) => orgOk(x, org));
  if (!('organizationId' in w)) return true;
  const f = w.organizationId;
  return f === null || typeof f === 'string' ? f === org : !!org && f!.in.includes(org);
};

beforeEach(() => {
  vi.clearAllMocks();
  db.organization.findUnique.mockResolvedValue(null);
  db.conversationParticipant.findUnique.mockResolvedValue(null);
  db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (people[where.id] ? { id: where.id, ...people[where.id] } : null));
  db.user.findFirst.mockImplementation(async ({ where }: { where: OrgWhere & { id: string; role?: string; enrollments?: unknown } }) => {
    const p = people[where.id];
    if (!p || (where.role && where.role !== p.role) || !orgOk(where, p.organizationId)) return null;
    if (where.enrollments && !teaches.has(where.id)) return null;
    return { id: where.id, name: where.id };
  });
  (groupAccess as unknown as Fn).mockResolvedValue(null);
});

describe('docs', () => {
  const doc = (ownerId: string, more: { conversationId?: string; groupId?: string } = {}) => ({ id: 'd', title: 'D', kind: 'doc', ownerId, courseId: null, groupId: more.groupId ?? null, conversationId: more.conversationId ?? null, parentId: null, members: [] });
  it('an admin opens a private doc of their school’s person; another school’s is not found', async () => {
    db.doc.findUnique.mockResolvedValue(doc('tA'));
    expect(await canReadDoc('d', adminA())).toBe(true);
    db.doc.findUnique.mockResolvedValue(doc('tB'));
    expect(await canReadDoc('d', adminA())).toBe(false);
    await expect(docRights('d', adminA())).rejects.toMatchObject(notFound);
  });
  it('a chat canvas: only for an admin of the school of whoever started it', async () => {
    db.doc.findUnique.mockResolvedValue(doc('tB', { conversationId: 'cv' }));
    expect(await canReadDoc('d', adminA())).toBe(false);
    db.doc.findUnique.mockResolvedValue(doc('tA', { conversationId: 'cv' }));
    expect(await canReadDoc('d', adminA())).toBe(true);
  });
  it('a group doc: an admin outside the group only for their school’s; a member keeps access', async () => {
    db.doc.findUnique.mockResolvedValue(doc('tB', { groupId: 'g' }));
    (groupAccess as unknown as Fn).mockResolvedValue({ group: { id: 'g', members: [] }, canManage: true });
    expect(await canReadDoc('d', adminA())).toBe(false);
    (groupAccess as unknown as Fn).mockResolvedValue({ group: { id: 'g', members: [{ role: 'MEMBER' }] }, canManage: false });
    expect(await canReadDoc('d', adminA())).toBe(true);
  });
  it('teachers keep exactly their access; the owner opens every school’s', async () => {
    db.doc.findUnique.mockResolvedValue(doc('tA'));
    expect(await canReadDoc('d', teacherB())).toBe(false);
    db.doc.findUnique.mockResolvedValue(doc('tB'));
    expect(await canReadDoc('d', teacherB())).toBe(true);
    expect(await canReadDoc('d', owner())).toBe(true);
  });
});

describe('parent messages', () => {
  beforeEach(() => {
    db.guardianLink.findMany.mockResolvedValue([]);
    db.guardianLink.findFirst.mockResolvedValue(null);
  });
  it('an admin lists their school’s student’s parents; another school’s student is not found', async () => {
    expect(await studentParents(adminA(), 'sA')).toMatchObject({ student: { id: 'sA' }, parents: [] });
    await expect(studentParents(adminA(), 'sB')).rejects.toMatchObject(notFound);
  });
  it('an admin can’t open a chat with another school’s parents', async () => {
    await expect(teacherParentChat(adminA(), { studentId: 'sB', guardianId: 'g' })).rejects.toMatchObject(notFound);
    expect(db.guardianLink.findFirst).not.toHaveBeenCalled();
  });
  it('a teacher still reaches only their own students; the owner any', async () => {
    expect(await studentParents(teacherB(), 'sB')).toMatchObject({ student: { id: 'sB' } });
    await expect(studentParents(teacherB(), 'sA')).rejects.toMatchObject(notFound);
    expect(await studentParents(owner(), 'sB')).toMatchObject({ student: { id: 'sB' } });
  });
});

describe('office hours notes', () => {
  it('an admin writes notes about their school’s students only', async () => {
    db.officeNote.create.mockResolvedValue({ id: 'n' });
    await expect(addOfficeNote(adminA(), { studentId: 'sB', body: 'x' })).rejects.toMatchObject(notFound);
    expect(db.officeNote.create).not.toHaveBeenCalled();
    expect(await addOfficeNote(adminA(), { studentId: 'sA', body: 'x' })).toEqual({ id: 'n' });
  });
});

describe('task boards', () => {
  const board = (ownerId: string, groupId: string | null = null) => ({ id: 'b', title: 'B', ownerId, courseId: null, groupId, members: [] });
  it('an admin sees boards of their school’s people; another school’s is not found', async () => {
    db.taskBoard.findUnique.mockResolvedValue(board('tA'));
    expect(await canReadTaskBoard('b', adminA())).toBe(true);
    db.taskBoard.findUnique.mockResolvedValue(board('tB'));
    expect(await canReadTaskBoard('b', adminA())).toBe(false);
    db.taskBoard.findUnique.mockResolvedValue(board('tB', 'g'));
    (groupAccess as unknown as Fn).mockResolvedValue({ group: { id: 'g', members: [] }, canManage: true });
    expect(await canReadTaskBoard('b', adminA())).toBe(false);
  });
  it('teachers keep exactly their access; the owner sees every school’s', async () => {
    db.taskBoard.findUnique.mockResolvedValue(board('tA'));
    expect(await canReadTaskBoard('b', teacherB())).toBe(false);
    db.taskBoard.findUnique.mockResolvedValue(board('tB'));
    expect(await canReadTaskBoard('b', teacherB())).toBe(true);
    expect(await canReadTaskBoard('b', owner())).toBe(true);
  });
});

describe('impact reports', () => {
  const certs = [
    { id: 'c1', userId: 'sA', org: 'orgA', hoursCompleted: 3 },
    { id: 'c2', userId: 'sB', org: 'orgB', hoursCompleted: 5 },
    { id: 'c3', userId: 'sM', org: null, hoursCompleted: 7 },
  ];
  const period = { title: 'R', organization: null, from: new Date('2026-01-01'), to: new Date('2026-12-31') };
  beforeEach(() => {
    db.nGO.findMany.mockResolvedValue([]);
    db.impactCertificate.findMany.mockImplementation(async ({ where }: { where: { user?: OrgWhere } }) =>
      certs.filter((c) => orgOk(where.user ?? {}, c.org)).map((c) => ({ id: c.id, userId: c.userId, organization: 'NGO', projectName: 'P', hoursCompleted: c.hoursCompleted, peopleImpacted: 1, issuedAt: new Date('2026-05-01') })));
  });
  it('counts only the admin’s schools’ people’s credentials; the owner’s count everyone’s', async () => {
    expect((await computeReport({ ...period, schools: ['orgA'] })).totals).toMatchObject({ credentials: 1, verifiedHours: 3 });
    expect((await computeReport({ ...period, schools: [null, 'orgB'] })).totals).toMatchObject({ credentials: 2, verifiedHours: 12 });
    expect((await computeReport({ ...period, schools: 'all' })).totals).toMatchObject({ credentials: 3, verifiedHours: 15 });
    expect(db.impactCertificate.findMany.mock.calls[2][0].where).not.toHaveProperty('user');
  });
  it('an issued report freezes the school’s figures only', async () => {
    db.impactReport.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 'r', ...data }));
    await issueReport({ ...period, schools: ['orgA'] }, { id: 'a1', name: 'A' });
    expect(db.impactReport.create.mock.calls[0][0].data.data.totals).toMatchObject({ credentials: 1 });
  });

  const patch = (body: object) => patchReport(new Request('http://x/api/impact-reports/r', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'r' }) });
  it('an admin publishes or withdraws only reports issued in their school', async () => {
    db.impactReport.update.mockResolvedValue({ id: 'r', title: 'R' });
    auth.mockResolvedValue(adminA());
    db.impactReport.findUnique.mockResolvedValue({ createdById: 'aB' });
    expect((await patch({ isPublic: false })).status).toBe(404);
    expect(db.impactReport.update).not.toHaveBeenCalled();
    db.impactReport.findUnique.mockResolvedValue(null);
    expect((await patch({ isPublic: false })).status).toBe(404);
    db.impactReport.findUnique.mockResolvedValue({ createdById: 'a1' });
    expect((await patch({ isPublic: false })).status).toBe(200);
    expect(db.impactReport.update).toHaveBeenCalledTimes(1);
  });
  it('a report whose issuer is gone is the main school’s; the owner changes any', async () => {
    db.impactReport.update.mockResolvedValue({ id: 'r', title: 'R' });
    db.impactReport.findUnique.mockResolvedValue({ createdById: 'gone' });
    auth.mockResolvedValue(adminA());
    expect((await patch({ isPublic: true })).status).toBe(404);
    auth.mockResolvedValue(adminMain());
    expect((await patch({ isPublic: true })).status).toBe(200);
    auth.mockResolvedValue(owner());
    db.impactReport.findUnique.mockClear();
    expect((await patch({ isPublic: true })).status).toBe(200);
    expect(db.impactReport.findUnique).not.toHaveBeenCalled();
  });
});

describe('assignments list', () => {
  it('an admin lists their school’s courses’ assignments; a teacher their own; the owner every one', async () => {
    db.assignment.findMany.mockResolvedValue([]);
    await listAssignments(adminA() as never, null);
    expect(db.assignment.findMany.mock.calls[0][0].where).toEqual({ course: { teacher: { organizationId: { in: ['orgA'] } } } });
    await listAssignments(teacherB() as never, 'c');
    expect(db.assignment.findMany.mock.calls[1][0].where.courseId).toBe('c');
    expect(db.assignment.findMany.mock.calls[1][0].where.course).toBeTruthy();
    await listAssignments(owner() as never, null);
    expect(db.assignment.findMany.mock.calls[2][0].where).toEqual({});
  });
});
