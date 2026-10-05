import prisma from '@/lib/db';
import { route } from '@/server/assignments';
import { cachedAi, saveAi, spendAi } from '@/server/ai-budget';
import { geminiJson } from '@/server/gemini';
import { BadRequestException, ForbiddenException, HttpException } from '@/server/http';
import { featureOff } from '@/server/moderation';
import { getOrCreatePassport } from '@/server/passport';
import { evidenceGroups } from '@/server/skill-evidence';

// POST: an AI draft of the passport's strengths paragraph, from the student's evidence (one AI
// request; the same evidence gives the saved draft again without asking AI). The student can then
// edit it (PATCH /api/passport { strengths }).
export const POST = (req: Request) => route(req, async (user) => {
  if (user.role !== 'STUDENT') throw new ForbiddenException('The skills passport is for students.');
  const groups = (await evidenceGroups(user.id, false)).filter((g) => g.count > 0);
  if (!groups.length) throw new BadRequestException('Your passport has no evidence yet: it appears when your work is graded or a credential is issued.');
  const facts = groups.slice(0, 15).map((g) => `- ${g.label}: ${g.count} piece(s), best level ${g.best ?? 'n/a'}; e.g. ${g.items.filter((i) => !i.hidden).slice(0, 3).map((i) => `${i.title} (${i.detail ?? i.kind})`).join('; ')}`).join('\n');
  const key = ['passport-strengths', user.id, facts];
  let paragraph = (await cachedAi<{ paragraph: string }>(key, 30))?.paragraph;
  if (!paragraph) {
    if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('AI isn’t available right now. You can write the paragraph yourself.', 503);
    const spend = await spendAi(user);
    if (!spend.ok) throw new HttpException(spend.message, 429);
    const out = await geminiJson<{ paragraph: string }>(
      'You write the short "strengths" paragraph of a student\'s public skills passport, for employers. Use only the evidence given; never invent experience, employers, grades or numbers. 2–3 sentences, third person, warm but factual, no superlatives, no bullet points. Mention the strongest skills and what backs them.',
      `Student: ${user.name}\nEvidence (skill: pieces, best level; examples):\n${facts}`,
      { type: 'OBJECT', properties: { paragraph: { type: 'STRING' } }, required: ['paragraph'] },
      400, true,
    );
    paragraph = out?.paragraph?.replace(/\s+/g, ' ').trim().slice(0, 700);
    if (!paragraph) throw new HttpException('No draft right now. Please try again in a moment.', 503);
    await saveAi(key, { paragraph });
  }
  await getOrCreatePassport(user.id);
  await prisma.skillPassport.update({ where: { userId: user.id }, data: { strengths: paragraph, strengthsAt: new Date() } });
  return { strengths: paragraph };
});
