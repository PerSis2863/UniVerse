import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { getSystemUser, messageSelect } from '@/lib/chat';
import { courseAccess } from '@/lib/course-access';
import { isStorageHostUrl } from '@/lib/file-urls';
import { planLimits } from '@/lib/plan-limits';
import { hasR2Storage, r2DeleteByUrl, r2PresignPut } from '@/lib/r2';
import type { SessionUser } from '@/lib/server-auth';
import { breakoutOf, callAccess, callPeople } from './calls';
import { afterSend } from './chat-notify';
import { channelSendCheck } from './communities';
import { notifyMany } from './email';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';
import { canSeeCall } from './meeting-notes';
import { chatMuted } from './moderation';
import { publish } from './realtime';

// Recording calls. The recorder's browser records what it shows and hears (src/lib/call-recorder.ts:
// 720p at most, 2 hours at most) and uploads it straight to R2 (no Worker time spent on the bytes).
//   Class calls (c_<course id>): only the teacher records; it becomes a video in the course's
//   materials, and enrolled students get an in-app notice (no email).
//   Every other call (Stage 4 · 2.9): whoever runs the call (or either person in a one-to-one call,
//   or a call link's creator) records, with everyone told by the REC badge; it's saved where the
//   call happened: in the chat (chat calls, group voice rooms), as a post in the study group, or in
//   Calls for everyone who was in it (call links, community voice rooms). With the call's meeting
//   notes (2.8) it gets chapters, and the transcript for those who were in the call. Kept 90 days.
// The owner can turn recording off (owner console → switches → "Call recordings").

const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB: about 2 hours at the recorder's bitrate
const TYPES = new Set(['video/webm', 'video/mp4', 'audio/webm', 'audio/mp4']);
export const KEEP_DAYS = 90;
const safeId = (callId: string) => callId.replace(/[^A-Za-z0-9_-]/g, '');
const parse = <T,>(v: string | null | undefined): T[] => { try { const x = JSON.parse(v ?? '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };

async function classHost(callId: string, user: SessionUser) {
  const a = await courseAccess(callId.slice(2), user);
  if (!a?.canManage) throw new ForbiddenException('Only the class’s teacher can record it.');
  return a.course;
}

/** Who may record this call, and where the recording goes. */
async function rights(callId: string, user: SessionUser) {
  if (callId.startsWith('c_')) return { kind: 'class' as const, course: await classHost(callId, user) };
  if (breakoutOf(callId)) throw new BadRequestException('Record from the main call, not a breakout room.');
  const info = await callAccess(callId, user);
  const link = callId.startsWith('l_');
  const people = await callPeople(callId);
  if (!(info.host || info.oneToOne || (link && people.creator === user.id))) throw new ForbiddenException('Only whoever runs the call can record it.');
  const kind = link ? ('link' as const) : callId.startsWith('g_') ? ('group' as const) : callId.startsWith('r_') ? ('room' as const) : ('chat' as const);
  return { kind, info, people: [...new Set([user.id, ...people.ids])] };
}

/** Step 0, before recording starts: may I record here, and can it be saved? (Not after an hour of recording.) */
export async function checkRecording(callId: string, user: SessionUser) {
  const r = await rights(callId, user);
  if (!hasR2Storage()) throw new HttpException('Recordings need file storage (R2), which isn’t set up yet.', 503);
  const goes = r.kind === 'class' ? 'the class materials' : r.kind === 'group' ? 'the group' : r.kind === 'link' ? 'Calls, for everyone in the call' : 'the chat';
  return { ok: true, goes };
}

/** Step 1: where to upload the recording (a signed address, valid 30 minutes). */
export async function recordingUploadUrl(callId: string, user: SessionUser, body: Record<string, unknown>) {
  const r = await rights(callId, user);
  if (!hasR2Storage()) throw new HttpException('Recordings need file storage (R2), which isn’t set up yet.', 503);
  const type = String(body.contentType ?? '').split(';')[0].trim();
  const size = Number(body.size);
  if (!TYPES.has(type)) throw new BadRequestException('This recording format can’t be saved.');
  if (!Number.isInteger(size) || size <= 0 || size > MAX_BYTES) throw new HttpException('Recordings can be up to 1 GB (about 2 hours).', 413);
  const ext = type.endsWith('mp4') ? 'mp4' : 'webm';
  const folder = r.kind === 'class' ? `recordings/${r.course.id}` : `recordings/calls/${safeId(callId)}`;
  const key = `${folder}/${new Date().toISOString().slice(0, 10)}-${randomBytes(9).toString('base64url')}.${ext}`;
  const { uploadUrl, publicUrl } = await r2PresignPut(key, type, size, 1800);
  return { uploadUrl, url: publicUrl, contentType: type };
}

/** Step 2: the upload finished; save it where the call happened (see the top of this file). */
export async function saveRecording(callId: string, user: SessionUser, body: Record<string, unknown>) {
  const r = await rights(callId, user);
  const url = String(body.url ?? '');
  const folder = r.kind === 'class' ? `/recordings/${r.course.id}/` : `/recordings/calls/${safeId(callId)}/`;
  let ok = false;
  try {
    const u = new URL(url);
    ok = isStorageHostUrl(u) && u.pathname.includes(folder);
  } catch { /* not a url */ }
  if (!ok) throw new BadRequestException('That isn’t this call’s recording.');
  const durationSec = Math.max(0, Math.min(3 * 3600, Math.round(Number(body.durationSec) || 0)));
  const minutes = Math.max(1, Math.round(durationSec / 60));
  const size = Math.max(0, Math.round(Number(body.size) || 0));
  const day = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  if (r.kind === 'class') {
    const course = r.course;
    const mb = Math.max(1, Math.round(size / 1048576));
    const title = String(body.title ?? '').trim().slice(0, 120) || `Class recording · ${day} · ${minutes} min`;
    const material = await prisma.material.create({
      data: { title, fileUrl: url, courseId: course.id, uploadedById: user.id, type: 'VIDEO', size: `${mb} MB` },
      select: { id: true, title: true, fileUrl: true },
    });
    // Taking class notes too? Link the recording to that class's study pack.
    await prisma.classSession.updateMany({ where: { courseId: course.id, recordingMaterialId: null, createdAt: { gte: new Date(Date.now() - 3 * 3600_000) } }, data: { recordingMaterialId: material.id } });
    const students = await prisma.enrollment.findMany({ where: { courseId: course.id }, select: { studentId: true }, take: 500 });
    if (students.length) {
      await prisma.notification.createMany({
        data: students.map((s) => ({ userId: s.studentId, title: `${course.code}: class recording`, body: `${title} is in the course materials.`, type: 'announcement', link: '/student/blackboard' })),
      });
      publish(students.slice(0, planLimits().livePushes).map((s) => s.studentId), { type: 'notification' });
    }
    return { ...material, message: `“${title}” is in the class materials` };
  }

  const mime = String(body.contentType ?? '').split(';')[0].trim();
  if (!TYPES.has(mime)) throw new BadRequestException('This recording format can’t be saved.');
  const note = await prisma.callNote.findFirst({ where: { callId, createdAt: { gte: new Date(Date.now() - 3 * 3600_000) } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  const rec = await prisma.callRecording.create({
    data: {
      callId, kind: r.kind, conversationId: r.kind === 'chat' || r.kind === 'room' ? r.info.chatId ?? null : null, groupId: r.kind === 'group' ? callId.slice(2) : null,
      noteId: note?.id ?? null, createdById: user.id, url, mime, size, durationSec, people: JSON.stringify(r.people),
    },
  });
  const title = `Call recording · ${day} · ${minutes} min`;
  const link = `/calls?recording=${rec.id}`;

  // In the chat, when I can post there.
  if (rec.conversationId) {
    const convo = await prisma.conversation.findUnique({ where: { id: rec.conversationId }, select: { disappearingSec: true, communityId: true } });
    const blocked = !convo || (await chatMuted(user.id)) || (await channelSendCheck(rec.conversationId, user.id, { slowMode: false }));
    if (!blocked) {
      const type = mime.startsWith('audio/') ? 'AUDIO' : 'VIDEO';
      const metadata = { recording: { id: rec.id, durationSec }, durationSec };
      const message = await prisma.message.create({
        data: {
          conversationId: rec.conversationId, senderId: user.id, type, body: '', attachmentUrl: url, attachmentName: `${title}.${mime.endsWith('mp4') ? 'mp4' : 'webm'}`,
          attachmentSize: size, attachmentMime: mime, metadata: metadata as unknown as Prisma.InputJsonValue,
          expiresAt: convo!.disappearingSec ? new Date(Date.now() + convo!.disappearingSec * 1000) : null,
        },
        select: { ...messageSelect, sender: { select: { id: true, name: true, avatar: true } } },
      });
      await prisma.$transaction([
        prisma.conversation.update({ where: { id: rec.conversationId }, data: { updatedAt: new Date() } }),
        prisma.callRecording.update({ where: { id: rec.id }, data: { messageId: message.id } }),
      ]);
      const system = await getSystemUser();
      afterSend({ id: message.id, conversationId: rec.conversationId, type, body: '', metadata }, user, { communityId: convo!.communityId, systemUserId: system.id });
      return { id: rec.id, title, message: 'The recording is in the chat.' };
    }
  }
  if (rec.groupId) await prisma.groupPost.create({ data: { groupId: rec.groupId, authorId: user.id, body: `🎬 ${title}. Watch it in Calls: ${link}` } });
  // Everyone else who was in the call: in the app, never by email.
  const people = parse<string>(rec.people).filter((id) => id !== user.id);
  if (people.length) await notifyMany(people, { type: 'event', title: 'Call recording', body: `${minutes}-minute recording of “${r.info.title}”`, link, email: false });
  return { id: rec.id, title, message: rec.groupId ? 'The recording is posted in the group.' : 'The recording is in Calls for everyone who was in the call.' };
}

/** GET /api/call-recordings/[id]: the recording, with chapters (and, for those who were in the call, the transcript). */
export async function getCallRecording(id: string, user: SessionUser) {
  const rec = await prisma.callRecording.findUnique({ where: { id } });
  if (!rec || !(await canSeeCall(rec, user))) throw new NotFoundException('This recording isn’t available.');
  const note = rec.noteId ? await prisma.callNote.findUnique({ where: { id: rec.noteId }, select: { id: true, title: true, chapters: true, transcript: true } }) : null;
  const wasThere = rec.createdById === user.id || parse<string>(rec.people).includes(user.id);
  return {
    id: rec.id, url: rec.url, mime: rec.mime, durationSec: rec.durationSec, createdAt: rec.createdAt, kind: rec.kind,
    title: note?.title ?? 'Call recording', noteId: note?.id ?? null,
    chapters: parse<{ t: number; title: string }>(note?.chapters),
    transcript: wasThere ? parse<{ t: number; who: string; text: string }>(note?.transcript).slice(0, 3000) : [],
    expiresAt: new Date(rec.createdAt.getTime() + KEEP_DAYS * 86_400_000),
    canDelete: rec.createdById === user.id,
  };
}

/** The file is gone (deleted, or after 90 days): its chat message says so instead of a broken player. */
async function removeRecording(rec: { id: string; url: string; messageId: string | null }, why: string) {
  await r2DeleteByUrl(rec.url).catch((e) => console.error('recording delete failed:', e));
  if (rec.messageId) {
    await prisma.message.updateMany({ where: { id: rec.messageId }, data: { type: 'TEXT', body: why, attachmentUrl: null, attachmentName: null, attachmentSize: null, attachmentMime: null, metadata: Prisma.DbNull } }).catch(() => {});
  }
  await prisma.callRecording.delete({ where: { id: rec.id } }).catch(() => {});
}

/** DELETE /api/call-recordings/[id]: whoever recorded it removes it. */
export async function deleteCallRecording(id: string, user: SessionUser) {
  const rec = await prisma.callRecording.findUnique({ where: { id }, select: { id: true, url: true, messageId: true, createdById: true } });
  if (!rec || rec.createdById !== user.id) throw new NotFoundException('This recording isn’t available.');
  await removeRecording(rec, '🎬 This call recording was deleted.');
  return { ok: true };
}

/** Daily job: recordings older than 90 days are deleted (up to 200 a day). */
export async function pruneCallRecordings() {
  const old = await prisma.callRecording.findMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } }, take: 200, select: { id: true, url: true, messageId: true } });
  for (const rec of old) await removeRecording(rec, `🎬 This call recording was removed after ${KEEP_DAYS} days.`);
  return old.length;
}
