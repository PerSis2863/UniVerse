import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { MAX_DOC_BYTES, cleanDoc, emptyDoc, mergeDocs, type Doc } from '@/lib/arrange';
import { BadRequestException } from './http';
import { publish } from './realtime';
import type { Body } from './body';

// M166: a person's page arrangements on their other devices too, when they choose it (Settings →
// Appearance). Their own row only; the document is checked and cut to size (`cleanDoc`) on the way in
// and on the way out. Two devices are joined page by page, the later change winning (`mergeDocs`).

const read = (data: string | undefined): Doc => {
  if (!data) return emptyDoc();
  try { return cleanDoc(JSON.parse(data)); } catch { return emptyDoc(); }
};

/** GET /arrange: whether my arrangements are synced, and the account's copy when they are. */
export async function arrangeGet(u: SessionUser) {
  const row = await prisma.userArrangement.findUnique({ where: { userId: u.id } });
  return row ? { sync: true, doc: read(row.data) } : { sync: false, doc: null };
}

/** PUT /arrange { doc }: turns syncing on and joins this device's copy into the account's. */
export async function arrangePut(u: SessionUser, b: Body) {
  const row = await prisma.userArrangement.findUnique({ where: { userId: u.id } });
  const doc = mergeDocs(read(row?.data), cleanDoc(b.doc));
  const data = JSON.stringify(doc);
  if (data.length > MAX_DOC_BYTES) throw new BadRequestException('That is more arranged pages than can be kept. Put a few pages back first.');
  if (data !== row?.data) {
    await prisma.userArrangement.upsert({ where: { userId: u.id }, create: { userId: u.id, data }, update: { data, updatedAt: new Date() } });
    // Their other open devices fetch the joined copy.
    publish([u.id], { type: 'refresh', keys: ['/arrange'] });
  }
  return { sync: true, doc };
}

/** DELETE /arrange: syncing off; the account's copy is removed (each device keeps its own). */
export async function arrangeOff(u: SessionUser) {
  await prisma.userArrangement.deleteMany({ where: { userId: u.id } });
  publish([u.id], { type: 'refresh', keys: ['/arrange'] });
  return { sync: false, doc: null };
}
