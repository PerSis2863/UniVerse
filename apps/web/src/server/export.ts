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
// PortfolioShare: its tokens open the person's passport; they're listed in the app, not in a file that may travel.
const SKIP_MODELS = new Set(['OwnerChange', 'StoredFile', 'AuditLog', 'ErrorReport', 'PortfolioShare']);
// Internal or security-sensitive columns people don't need (and that shouldn't sit in a download).
const SKIP_FIELDS = new Set(['firebaseUid', 'passwordHash', 'pushSubscription', 'fingerprint', 'data', 'totpSecret', 'totpStep']);
// M337: a connected account's keys (Gmail, Outlook, Slack…) stay on the server, even sealed (connections.ts).
const SKIP_MODEL_FIELDS = new Set(['OAuthConnection.access', 'OAuthConnection.refresh']);
const MAX_PER_TABLE = 5000;
// Columns named like "theirs" that aren't: a report someone else made about a message they sent.
const NOT_THEIRS = new Set(['CommunityReport.senderId']);

const delegate = (m: Model) => (prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<unknown[]> }>)[m.delegate];
const select = (m: Model) => Object.fromEntries(m.fields.filter((f) => f.kind !== 'object' && f.type !== 'Bytes' && !SKIP_FIELDS.has(f.name) && !SKIP_MODEL_FIELDS.has(`${m.name}.${f.name}`)).map((f) => [f.name, true]));
const title = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2');

export async function exportUserData(userId: string) {
  const user = MODELS.find((m) => m.name === 'User')!;
  const profile = await prisma.user.findUnique({ where: { id: userId }, select: select(user) });
  const links = MODELS.flatMap((m) =>
    SKIP_MODELS.has(m.name) ? [] : m.fields.filter((f) => f.kind === 'object' && f.type === 'User' && f.relationFields?.length && OWN_LINKS.has(f.relationFields[0])).map((f) => ({ m, fk: f.relationFields![0] })),
  );
  // M302: tables that name their person by a plain column (no relation to User): 75 were left out before (Trace,
  // Relief, Green and Travel rows, documents, task boards, portfolio work, office-hours bookings, paper-exam marks).
  for (const m of MODELS) {
    if (SKIP_MODELS.has(m.name) || m.name === 'User' || links.some((l) => l.m.name === m.name)) continue;
    for (const f of m.fields) if (f.kind === 'scalar' && f.type === 'String' && OWN_LINKS.has(f.name) && !NOT_THEIRS.has(`${m.name}.${f.name}`)) links.push({ m, fk: f.name });
  }
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
