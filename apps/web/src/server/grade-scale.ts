import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { DEFAULT_SCALE, cleanScale, maxGpa, parseScale, type Scale } from '@/lib/gradebook';
import { audit } from './audit';
import { BadRequestException, ForbiddenException } from './http';

// A school's letter grades and GPA points (Stage 5 · B3.4, src/lib/gradebook.ts): used by gradebooks,
// students' grades, report cards and the teacher dashboard. Admins of the school set it; everyone
// else reads their school's (the default A–F on 4.0 without a school or a scale).

export async function scaleFor(organizationId: string | null | undefined): Promise<Scale> {
  if (!organizationId) return DEFAULT_SCALE;
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { gradeScale: true } });
  return parseScale(org?.gradeScale);
}

/** GET /api/grade-scale — the signed-in person's school scale. */
export async function myScale(user: SessionUser) {
  const scale = await scaleFor(user.organizationId);
  return { scale, maxGpa: maxGpa(scale), custom: scale !== DEFAULT_SCALE, canEdit: user.role === 'ADMIN' && !!user.organizationId };
}

/** PUT /api/grade-scale { scale | null } — an admin sets (or, with null, resets) their school's scale. */
export async function setScale(user: SessionUser, b: Record<string, unknown>, req: Request) {
  if (user.role !== 'ADMIN') throw new ForbiddenException('Only admins can change the grading scale.');
  if (!user.organizationId) throw new BadRequestException('This account isn’t part of a school, so it has no scale to change.');
  const scale = b.scale === null ? null : cleanScale(b.scale);
  if (b.scale !== null && !scale) throw new BadRequestException('Give 2 to 15 bands, each with a name, a lowest percentage (0–100, all different) and GPA points (0–10).');
  await prisma.organization.update({ where: { id: user.organizationId }, data: { gradeScale: scale ? JSON.stringify(scale) : null } });
  audit(user, { action: 'school.grade-scale', summary: scale ? `Set the grading scale: ${scale.map((s) => `${s.letter} ≥ ${s.min}%`).join(', ')}` : 'Reset the grading scale to A–F', targetType: 'organization', targetId: user.organizationId }, req);
  return myScale(user);
}
