import prisma from '@/lib/db';
import { dbSchema as schema } from './db-schema';

// "Download my data" (GDPR / DPDPA / CCPA data portability): everything that belongs to one person,
// as JSON. Only follows links that mean "this is theirs" (their messages, their grades, their
// posts…), never links where they merely acted on someone else's record (e.g. an admin who
// reviewed an application), so the file never contains other people's personal data.

type Field = { name: string; type: string; kind: 'scalar' | 'enum' | 'object'; relationFields?: string[] };
type Model = { name: string; delegate: string; fields: Field[] };
const MODELS = schema.models as Model[];

const OWN_LINKS = new Set(['userId', 'studentId', 'ownerId', 'senderId', 'authorId', 'postedById', 'reporterId', 'uploadedById', 'initiatorId', 'foundedById']);
const SKIP_MODELS = new Set(['OwnerChange', 'StoredFile', 'AuditLog', 'ErrorReport']);
// Internal or security-sensitive columns people don't need (and that shouldn't sit in a download).
const SKIP_FIELDS = new Set(['firebaseUid', 'passwordHash', 'pushSubscription', 'fingerprint', 'data']);
const MAX_PER_TABLE = 5000;

const delegate = (m: Model) => (prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<unknown[]> }>)[m.delegate];
const select = (m: Model) => Object.fromEntries(m.fields.filter((f) => f.kind !== 'object' && f.type !== 'Bytes' && !SKIP_FIELDS.has(f.name)).map((f) => [f.name, true]));
const title = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2');

export async function exportUserData(userId: string) {
  const user = MODELS.find((m) => m.name === 'User')!;
  const profile = await prisma.user.findUnique({ where: { id: userId }, select: select(user) });
  const links = MODELS.flatMap((m) =>
    SKIP_MODELS.has(m.name) ? [] : m.fields.filter((f) => f.kind === 'object' && f.type === 'User' && f.relationFields?.length && OWN_LINKS.has(f.relationFields[0])).map((f) => ({ m, fk: f.relationFields![0] })),
  );
  const data: Record<string, unknown[]> = {};
  for (const { m, fk } of links) {
    const rows = await delegate(m).findMany({ where: { [fk]: userId }, select: select(m), take: MAX_PER_TABLE });
    if (rows.length) data[links.filter((l) => l.m.name === m.name).length > 1 ? `${title(m.name)} (${fk})` : title(m.name)] = rows;
  }
  return {
    exportedAt: new Date().toISOString(),
    about: 'Your personal data on UniVerse (universeimpact.com), as described in our Privacy Policy. Questions: privacy@universeimpact.com',
    profile,
    data,
  };
}
