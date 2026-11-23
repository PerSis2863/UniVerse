import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import { route } from '@/server/assignments';
import { spendAi } from '@/server/ai-budget';
import { ghidraJson } from '@/server/ghidra/brain';
import { COURSE_SKILLS_SCHEMA, COURSE_SKILLS_SYSTEM } from '@/server/ghidra/jobs';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@/server/http';
import { featureOff } from '@/server/moderation';
import { parseSkills } from '@/server/skill-evidence';

// The skills a course builds (upgrade 2): graded work in the course becomes evidence for them on
// students' passports. PUT { skills: string[] } saves 3–6 (teacher). POST suggests some from the
// course's name and description with one AI request; the teacher confirms before saving.

type Ctx = { params: Promise<{ id: string }> };

async function teacherOf(id: string, user: Parameters<typeof courseAccess>[1]) {
  const a = await courseAccess(id, user);
  if (!a) throw new NotFoundException('Course not found.');
  if (!a.canManage) throw new ForbiddenException('Only the course’s teacher can change its skills.');
  return a.course;
}

export const PUT = (req: Request, { params }: Ctx) => route(req, async (user) => {
  const course = await teacherOf((await params).id, user);
  const b = await req.json().catch(() => ({}));
  const skills = parseSkills(JSON.stringify(Array.isArray(b.skills) ? b.skills : []));
  if (skills.length > 6) throw new BadRequestException('Choose up to 6 skills.');
  await prisma.course.update({ where: { id: course.id }, data: { skills: skills.length ? JSON.stringify(skills) : null } });
  return { skills };
});

export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => {
  const course = await teacherOf((await params).id, user);
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('AI suggestions aren’t available right now. Type the skills instead.', 503);
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  const full = await prisma.course.findUnique({ where: { id: course.id }, select: { description: true, department: true } });
  const out = await ghidraJson<{ skills: string[] }>('course-skills', 
    COURSE_SKILLS_SYSTEM,
    `Course: ${course.code} ${course.name}\nDepartment: ${full?.department ?? 'unknown'}\nDescription: ${full?.description ?? 'none'}\n\nSuggest 5 skills.`,
    COURSE_SKILLS_SCHEMA,
    300, true,
  );
  const skills = parseSkills(JSON.stringify(out?.skills ?? []));
  if (!skills.length) throw new HttpException('No suggestions right now. Please try again or type them.', 503);
  return { skills, aiLeft: spend.left };
});
