import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import { isStorageHostUrl } from '@/lib/file-urls';
import { planLimits } from '@/lib/plan-limits';
import { hasR2Storage, r2PresignPut } from '@/lib/r2';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, HttpException } from './http';
import { publish } from './realtime';

// Recording a class call (c_<course id>). The teacher's browser records what it shows and hears
// (src/lib/call-recorder.ts) and uploads it straight to R2 (no Worker time spent on the bytes);
// then it becomes a video in the course's materials, and enrolled students get an in-app notice
// (no email).

const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB: about 2 hours at the recorder's bitrate
const TYPES = new Set(['video/webm', 'video/mp4', 'audio/webm', 'audio/mp4']);

async function hostOf(callId: string, user: SessionUser) {
  if (!callId.startsWith('c_')) throw new BadRequestException('Only class calls can be recorded.');
  const a = await courseAccess(callId.slice(2), user);
  if (!a?.canManage) throw new ForbiddenException('Only the class’s teacher can record it.');
  return a.course;
}

/** Step 1: where to upload the recording (a signed address, valid 30 minutes). */
export async function recordingUploadUrl(callId: string, user: SessionUser, body: Record<string, unknown>) {
  const course = await hostOf(callId, user);
  if (!hasR2Storage()) throw new HttpException('Recordings need file storage (R2), which isn’t set up yet.', 503);
  const type = String(body.contentType ?? '').split(';')[0].trim();
  const size = Number(body.size);
  if (!TYPES.has(type)) throw new BadRequestException('This recording format can’t be saved.');
  if (!Number.isInteger(size) || size <= 0 || size > MAX_BYTES) throw new HttpException('Recordings can be up to 1 GB (about 2 hours).', 413);
  const ext = type.endsWith('mp4') ? 'mp4' : 'webm';
  const key = `recordings/${course.id}/${new Date().toISOString().slice(0, 10)}-${randomBytes(9).toString('base64url')}.${ext}`;
  const { uploadUrl, publicUrl } = await r2PresignPut(key, type, size, 1800);
  return { uploadUrl, url: publicUrl, contentType: type };
}

/** Step 2: the upload finished; add it to the course's materials and tell the class. */
export async function saveRecording(callId: string, user: SessionUser, body: Record<string, unknown>) {
  const course = await hostOf(callId, user);
  const url = String(body.url ?? '');
  let ok = false;
  try {
    const u = new URL(url);
    ok = isStorageHostUrl(u) && u.pathname.includes(`/recordings/${course.id}/`);
  } catch { /* not a url */ }
  if (!ok) throw new BadRequestException('That isn’t this class’s recording.');
  const minutes = Math.max(1, Math.round((Number(body.durationSec) || 0) / 60));
  const mb = Math.max(1, Math.round((Number(body.size) || 0) / 1048576));
  const day = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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
  return material;
}
