import type { SessionUser } from '@/lib/server-auth';
import { simChoices, studyFrom } from '@/lib/sim/setup';
import { BadRequestException, HttpException, NotFoundException } from './http';
import { str, text, type Body } from './body';
import { featureOff } from './moderation';
import { spendAi } from './ai-budget';
import { logAiUse } from './ai-receipts';
import { ghidraAgent } from './ghidra/own-model';
import { guideText } from './travel';

// Ghidra's skills inside the apps (the owner, 26 Nov: "it should understand everything related to my project
// specially in the aether app… and for the hyperion app the ai should able to create things in the system"):
// Aether's guide answers questions about a place from its own guide (sights, food, areas, getting around, customs),
// and Hyperion's sim set-up turns a description into a Simulate → Structures study. Each is one AI request within the
// day's allowance and the owner's AI switch; nothing is saved for the person until they use it.

async function allowed(u: SessionUser, kind: 'guide' | 'sim-setup', detail: string) {
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('Ghidra is off right now.', 503);
  const spend = await spendAi(u);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  await logAiUse(u.id, { kind, detail });
  return spend.left;
}

/** POST /travel/ask { place, question }: Ghidra answers about a place from its guide. */
export async function askPlace(u: SessionUser, b: Body) {
  const place = str(b.place).trim().slice(0, 120), question = text(b.question).trim().slice(0, 500);
  if (!place || question.length < 3) throw new BadRequestException('Ask a question about a place.');
  const g = await guideText(place);
  if (!g) throw new NotFoundException(`There’s no guide for ${place} yet.`);
  const left = await allowed(u, 'guide', `Asked about ${g.name}`);
  const out = await ghidraAgent<{ answer?: unknown; answered?: unknown }>(u, 'guide', `Place: ${g.name}\nQuestion: ${question}\n\nThe guide:\n${g.text}`, 600).catch(() => null);
  const answer = typeof out?.answer === 'string' ? out.answer.trim().slice(0, 2000) : '';
  if (!answer) throw new HttpException('Ghidra couldn’t answer just now: try again in a minute.', 502);
  return { place: g.name, guide: g.guide, answer, answered: out?.answered !== false, left };
}

/** POST /hyperion/setup { text }: Ghidra sets up a Structures study from a description. */
export async function setupSim(u: SessionUser, b: Body) {
  const said = text(b.text).trim().slice(0, 1000);
  if (said.length < 8) throw new BadRequestException('Describe the part, how it is held and what pushes on it.');
  const left = await allowed(u, 'sim-setup', 'Set up a Simulate study');
  const out = await ghidraAgent<Record<string, unknown>>(u, 'sim-setup', `${simChoices()}\n\nThe person’s description: ${said}`, 700).catch(() => null);
  if (!out) throw new HttpException('Ghidra couldn’t set it up just now: try again in a minute.', 502);
  return { ...studyFrom(out), left };
}
