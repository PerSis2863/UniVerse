import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { r2KeyOf, r2PresignGet } from '@/lib/r2';
import { callAccess } from './calls';
import { ForbiddenException, NotFoundException } from './http';

// Private files behind expiring links (Stage 5 · A8): call recordings and the documents students
// upload (ID cards, certificates, report cards). The app asks for a link when someone opens one
// (POST /api/files/link) and gets an R2 address that works for 10 minutes, after checking that this
// person may see it. Other files (chat photos, course handouts…) keep their long random addresses.
//
// For recordings' permanent addresses to stop working too, the owner adds one free Cloudflare rule on the
// files domain (DEPLOY-CLOUDFLARE.md, "Private files"): until then old links still open.

export const LINK_SECONDS = 600;

/** Which private kind a file is, from where it is stored (null: not private). */
export function privateKind(key: string): { kind: 'class-recording'; courseId: string } | { kind: 'call-recording'; callId: string } | { kind: 'upload'; ownerId: string } | null {
  let m = key.match(/^recordings\/calls\/([A-Za-z0-9_-]+)\//);
  if (m) return { kind: 'call-recording', callId: m[1] };
  m = key.match(/^recordings\/([A-Za-z0-9_-]+)\//);
  if (m) return { kind: 'class-recording', courseId: m[1] };
  m = key.match(/^uploads\/([A-Za-z0-9_-]+)\//);
  if (m) return { kind: 'upload', ownerId: m[1] };
  return null;
}

/**
 * A 10-minute link to `url` for `user`, or the address itself when it isn't a private file. Throws
 * when the person may not see it.
 */
export async function privateLink(url: string, user: SessionUser): Promise<{ url: string; expiresAt: string | null }> {
  const key = r2KeyOf(url);
  if (!key) return { url, expiresAt: null };
  const p = privateKind(key);
  if (!p) return { url, expiresAt: null };
  if (p.kind === 'class-recording') {
    if (!(await courseAccess(p.courseId, user))) throw new ForbiddenException('This recording is for the class’s students and teacher.');
  } else if (p.kind === 'call-recording') {
    await callAccess(p.callId, user).catch(() => { throw new ForbiddenException('This recording is for the people in that call.'); });
  } else if (p.ownerId !== user.id && user.role !== 'ADMIN') {
    // Someone else's upload: only a student document is private (a chat photo is for its chat).
    const doc = await prisma.studentDocument.findFirst({ where: { fileUrl: url }, select: { id: true } });
    if (doc) throw new ForbiddenException('Only its owner and the school’s admins can open this document.');
    return { url, expiresAt: null };
  }
  const signed = await r2PresignGet(key, LINK_SECONDS).catch(() => null);
  if (!signed) throw new NotFoundException('This file can’t be opened right now.');
  return { url: signed, expiresAt: new Date(Date.now() + LINK_SECONDS * 1000).toISOString() };
}
