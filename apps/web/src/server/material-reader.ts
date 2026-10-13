import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import { materialSections } from '@/lib/material-sections';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, NotFoundException } from './http';
import { prepareSources } from './tutor';

// Course materials as text to read and translate (Stage 5 · D8, language-free classroom). The text
// is the one the AI tutor reads (course_sources, made from the file once); it's shown in sections,
// each translated on request through /api/translate (kind "material-part"), or rewritten for a
// reading level through /api/reading-level (D9).

async function material(courseId: string, materialId: string, user: SessionUser) {
  const access = await courseAccess(courseId, user);
  if (!access) throw new NotFoundException('Course not found.');
  const m = await prisma.material.findFirst({ where: { id: materialId, courseId }, select: { id: true, title: true } });
  if (!m) throw new NotFoundException('Material not found.');
  return { access, m };
}

/** The material's text in sections, or why there isn't any yet. */
export async function readMaterial(courseId: string, materialId: string, user: SessionUser) {
  const { access, m } = await material(courseId, materialId, user);
  const src = await prisma.courseSource.findUnique({ where: { materialId }, select: { id: true, status: true, error: true, text: true } });
  // canManage: the teacher can also prepare the simpler versions for everyone (D9, reading levels).
  if (src?.status === 'READY' && src.text) return { title: m.title, status: 'READY' as const, sourceId: src.id, sections: materialSections(src.text), canPrepare: false, canManage: access.canManage };
  return { title: m.title, status: (src?.status ?? 'NONE') as string, error: src?.error ?? null, sourceId: null, sections: [], canPrepare: access.canManage, canManage: access.canManage };
}

/** The course's teacher turns the file into text now (one AI request), then it can be read. */
export async function prepareMaterial(courseId: string, materialId: string, user: SessionUser) {
  const { access } = await material(courseId, materialId, user);
  if (!access.canManage) throw new NotFoundException('Material not found.');
  const r = await prepareSources(courseId, 1, materialId);
  if (!r.read) throw new BadRequestException('Only PDFs and text files uploaded to UniVerse can be read.');
  return readMaterial(courseId, materialId, user);
}
