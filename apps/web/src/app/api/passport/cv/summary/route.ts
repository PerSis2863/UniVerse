import prisma from '@/lib/db';
import { route } from '@/server/assignments';
import { cachedAi, saveAi, spendAi } from '@/server/ai-budget';
import { geminiJson } from '@/server/gemini';
import { BadRequestException, ForbiddenException, HttpException } from '@/server/http';
import { featureOff } from '@/server/moderation';
import { getOrCreatePassport } from '@/server/passport';
import { evidenceGroups } from '@/server/skill-evidence';

// POST: short AI CV summary from passport evidence (spendAi + cache). Student can edit before PDF.
export const POST = (req: Request) => route(req, async (user) => {
  if (user.role !== 'STUDENT') throw new ForbiddenException('The CV builder is for students.');
  const groups = (await evidenceGroups(user.id, false)).filter((g) => g.count > 0);
  const skills = await prisma.studentSkill.findMany({
    where: { userId: user.id },
    orderBy: [{ endorsements: 'desc' }, { name: 'asc' }],
    take: 20,
    select: { name: true, level: true },
  });
  if (!groups.length && !skills.length) throw new BadRequestException('Add skills or earn evidence first.');
  const facts = [
    ...groups.slice(0, 12).map((g) => `Evidence · ${g.label}: ${g.count} item(s), best ${g.best ?? 'n/a'}`),
    ...skills.slice(0, 12).map((s) => `Skill · ${s.name} (${s.level})`),
  ].join('\n');
  const key = ['passport-cv-summary', user.id, facts];
  let summary = (await cachedAi<{ summary: string }>(key, 30))?.summary;
  if (!summary) {
    if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('AI isn’t available right now. Write a short summary yourself.', 503);
    const spend = await spendAi(user);
    if (!spend.ok) throw new HttpException(spend.message, 429);
    const out = await geminiJson<{ summary: string }>(
      'You write a 2–3 sentence ATS-friendly professional summary for a student CV. Use only the facts given. First person ("I"). No buzzwords, no invented employers or grades.',
      `Student: ${user.name}\nFacts:\n${facts}`,
      { type: 'OBJECT', properties: { summary: { type: 'STRING' } }, required: ['summary'] },
      350, true,
    );
    summary = out?.summary?.replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!summary) throw new HttpException('No summary right now. Try again in a moment.', 503);
    await saveAi(key, { summary });
  }
  await getOrCreatePassport(user.id);
  return { summary };
});
