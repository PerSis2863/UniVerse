import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import { route } from '@/server/assignments';
import { spendAi } from '@/server/ai-budget';
import { geminiJson } from '@/server/gemini';
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
  const out = await geminiJson<{ skills: string[] }>(
    'You suggest the skills a university course builds, as employers would list them on a job ad: short (1–4 words), concrete, mixing subject skills (e.g. "Data structures", "Statistical modelling") and transferable ones (e.g. "Technical writing"). Use the course\'s language.',
    `Course: ${course.code} ${course.name}\nDepartment: ${full?.department ?? 'unknown'}\nDescription: ${full?.description ?? 'none'}\n\nSuggest 5 skills.`,
    { type: 'OBJECT', properties: { skills: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['skills'] },
    300, true,
  );
  const skills = parseSkills(JSON.stringify(out?.skills ?? []));
  if (!skills.length) throw new HttpException('No suggestions right now. Please try again or type them.', 503);
  return { skills, aiLeft: spend.left };
});
