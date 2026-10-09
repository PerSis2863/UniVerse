import prisma from '@/lib/db';
import { notify } from './email';
import { publish } from './realtime';
import { guardianView } from './guardian-view';

// Parent and guardian accounts (Stage 5 · B16.1). A student makes a one-time code in Settings →
// Parent or guardian and gives it to their parent, who enters it in the parent app: the accounts
// are linked and the parent sees that child's schoolwork (src/server/guardian-view.ts). Either side
// can remove the link at any time; the other is told in the app (never by email).

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L look-alikes
const CODE_LENGTH = 8;
const CODE_DAYS = 7;
const MAX_CHILDREN = 10;
const MAX_GUARDIANS = 6;

export class GuardianAccountError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** A random code from ALPHABET (rejection sampling, so every character is equally likely). */
export function newCode(): string {
  let out = '';
  while (out.length < CODE_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < 248 && out.length < CODE_LENGTH) out += ALPHABET[b % ALPHABET.length]; // 248 = 8 × 31
    }
  }
  return out;
}

/** What someone typed ("abcd-2345", spaces, lower case) → the stored form, or null. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : null;
}

const cleanRelation = (r: unknown) => (typeof r === 'string' ? r.trim().slice(0, 40) : '') || null;

// ─── Student side ────────────────────────────────────────────────────────────────────────────────

/** The student's linked parent accounts and their current code (if one is still valid). */
export async function studentGuardians(studentId: string) {
  const [links, invite] = await Promise.all([
    prisma.guardianLink.findMany({ where: { studentId }, orderBy: { createdAt: 'asc' }, select: { id: true, relation: true, createdAt: true, guardian: { select: { name: true, email: true } } } }),
    prisma.guardianInvite.findFirst({ where: { studentId, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, select: { code: true, expiresAt: true } }),
  ]);
  return { links: links.map(({ guardian, ...l }) => ({ ...l, name: guardian.name, email: guardian.email })), code: invite };
}

/** A new code (any earlier one stops working). */
export async function makeCode(studentId: string) {
  if ((await prisma.guardianLink.count({ where: { studentId } })) >= MAX_GUARDIANS) throw new GuardianAccountError(`You can link up to ${MAX_GUARDIANS} parent accounts. Remove one first.`);
  await prisma.guardianInvite.deleteMany({ where: { studentId } });
  const expiresAt = new Date(Date.now() + CODE_DAYS * 86_400_000);
  // A clash among live codes is about 1 in 10^11; try again rather than fail.
  for (let i = 0; i < 3; i++) {
    const code = newCode();
    const made = await prisma.guardianInvite.create({ data: { code, studentId, expiresAt }, select: { code: true, expiresAt: true } }).catch(() => null);
    if (made) return made;
  }
  throw new GuardianAccountError('Couldn’t make a code. Please try again.', 500);
}

export async function cancelCode(studentId: string) {
  await prisma.guardianInvite.deleteMany({ where: { studentId } });
  return { ok: true };
}

/** The student removes a parent account. */
export async function studentUnlink(student: { id: string; name: string }, linkId: string) {
  const link = await prisma.guardianLink.findFirst({ where: { id: linkId, studentId: student.id }, select: { id: true, guardianId: true } });
  if (!link) throw new GuardianAccountError('That parent account isn’t linked any more.', 404);
  await prisma.guardianLink.delete({ where: { id: link.id } });
  const first = student.name.trim().split(/\s+/)[0] || 'A student';
  await notify(link.guardianId, { type: 'guardian', title: `${first} removed the link to your account`, body: 'You no longer see their schoolwork. Ask them for a new code if this was a mistake.', link: '/parent', email: false });
  publish([link.guardianId], { type: 'refresh', keys: ['/api/parent/children'] });
  return { ok: true };
}

// ─── Guardian side ───────────────────────────────────────────────────────────────────────────────

/** The guardian enters a code: the accounts are linked and the code is used up. */
export async function linkByCode(guardian: { id: string; name: string }, rawCode: unknown, relation: unknown) {
  const code = normalizeCode(rawCode);
  const invite = code ? await prisma.guardianInvite.findUnique({ where: { code }, select: { code: true, studentId: true, expiresAt: true, student: { select: { name: true, role: true, status: true } } } }) : null;
  if (!invite || invite.expiresAt <= new Date() || invite.student.role !== 'STUDENT' || invite.student.status === 'SUSPENDED') {
    throw new GuardianAccountError('That code doesn’t work. Codes last 7 days and work once: ask your child for a new one.');
  }
  if (invite.studentId === guardian.id) throw new GuardianAccountError('That code doesn’t work.');
  const [children, already] = await Promise.all([
    prisma.guardianLink.count({ where: { guardianId: guardian.id } }),
    prisma.guardianLink.findUnique({ where: { guardianId_studentId: { guardianId: guardian.id, studentId: invite.studentId } }, select: { id: true } }),
  ]);
  if (already) {
    await prisma.guardianInvite.delete({ where: { code: invite.code } }).catch(() => null);
    throw new GuardianAccountError(`You’re already linked to ${invite.student.name.split(/\s+/)[0]}.`);
  }
  if (children >= MAX_CHILDREN) throw new GuardianAccountError(`You can link up to ${MAX_CHILDREN} children.`);
  const rel = cleanRelation(relation);
  const [link] = await prisma.$transaction([
    prisma.guardianLink.create({ data: { guardianId: guardian.id, studentId: invite.studentId, relation: rel }, select: { id: true, studentId: true } }),
    prisma.guardianInvite.delete({ where: { code: invite.code } }),
  ]);
  await notify(invite.studentId, {
    type: 'guardian',
    title: `${guardian.name} linked to your account`,
    body: `${rel ? `As your ${rel.toLowerCase()}, they` : 'They'} now see your grades, attendance, deadlines and report cards (never your messages). You can remove them in Settings → Parent or guardian.`,
    link: '/student/settings?section=family',
    email: false,
  });
  publish([invite.studentId], { type: 'refresh', keys: ['/api/student/guardian-accounts'] });
  return { ok: true, linkId: link.id, studentId: link.studentId };
}

/** The guardian's children, each with the headline numbers. */
export async function myChildren(guardianId: string) {
  const links = await prisma.guardianLink.findMany({ where: { guardianId }, orderBy: { createdAt: 'asc' }, select: { id: true, relation: true, studentId: true } });
  const views = await Promise.all(links.map((l) => guardianView(l.studentId)));
  return links.flatMap((l, i) => {
    const v = views[i];
    return v ? [{ linkId: l.id, studentId: l.studentId, relation: l.relation, ...v }] : [];
  });
}

/** The guardian removes a child. */
export async function guardianUnlink(guardian: { id: string; name: string }, linkId: string) {
  const link = await prisma.guardianLink.findFirst({ where: { id: linkId, guardianId: guardian.id }, select: { id: true, studentId: true } });
  if (!link) throw new GuardianAccountError('That child isn’t linked any more.', 404);
  await prisma.guardianLink.delete({ where: { id: link.id } });
  await notify(link.studentId, { type: 'guardian', title: `${guardian.name} unlinked from your account`, body: 'They no longer see your schoolwork.', link: '/student/settings?section=family', email: false });
  publish([link.studentId], { type: 'refresh', keys: ['/api/student/guardian-accounts'] });
  return { ok: true };
}
