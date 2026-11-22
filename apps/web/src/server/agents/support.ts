import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import type { AskPlan } from '@/lib/ask';
import { unitDpp } from '@/lib/dpp';
import { formatCode } from '@/lib/trace';
import { spendAi } from '../ai-budget';
import { featureOff } from '../moderation';
import { geminiJson } from '../gemini';
import { short, unitOf } from '../trace';
import { BadRequestException } from '../http';
import type { Body } from '../body';
import { guard, guardReply } from '@/lib/ghidra-guard';
import { PLAYBOOKS, prompt } from './playbooks';

// Ghidra's Customer Support (M375, one of the owner's app agents, 22 Nov): a buyer asks about the product in their hand
// (its Trace passport), and Ghidra answers ONLY from that product's facts: the brand's description and story, the
// warranty, the batch's origin and date, any active recall (first, with its advice) and the EU product passport
// (materials, repair, recycling). Read here, never recording a scan; nothing from the request is taken as a fact. When the
// facts don't answer, it says so and points to the brand's page. Signed-in people only (AI costs money).

/** The product facts behind a code, read only (no scan recorded), or null for a code that isn't real. Three queries. */
export async function productFacts(code: string): Promise<{ facts: string; brand: { name: string; slug: string | null }; code: string } | null> {
  const unit = await unitOf(code).catch(() => null);
  if (!unit) return null;
  const { batch } = unit, p = batch.product;
  const [brand, recall] = await Promise.all([
    batch.brandId ? prisma.traceBrand.findUnique({ where: { id: batch.brandId }, select: { name: true, slug: true } }) : null,
    prisma.traceRecall.findFirst({ where: { batchId: batch.id, status: 'ACTIVE' }, select: { reason: true, advice: true, severity: true } }),
  ]);
  const dpp = unitDpp(p).dpp;
  const lines = [
    `Product: ${p.name}`, p.category && `Kind: ${p.category}`, `Brand: ${brand?.name ?? 'unknown'}`,
    p.description && `Description: ${p.description}`, p.story && `The brand's story: ${p.story}`,
    p.warrantyMonths > 0 ? `Warranty: ${p.warrantyMonths} months (registered on the passport)` : 'Warranty: none stated',
    `Batch: ${batch.label}${batch.origin ? `, made in ${batch.origin}` : ''}${batch.madeAt ? `, on ${new Date(batch.madeAt).toISOString().slice(0, 10)}` : ''}`,
    recall ? `ACTIVE RECALL (${recall.severity}): ${recall.reason}${recall.advice ? `. What to do: ${recall.advice}` : ''}` : 'Recall: none active',
    dpp && `EU product passport details: ${JSON.stringify(dpp).slice(0, 2500)}`,
  ].filter(Boolean);
  return { facts: lines.join('\n'), brand: { name: brand?.name ?? 'the brand', slug: brand?.slug ?? null }, code: formatCode(unit.id) };
}

const SYSTEM = prompt(PLAYBOOKS.support, 'Reply with the answer, and whether the facts fully answered it (answered: true or false).');
const SCHEMA = { type: 'OBJECT', properties: { answer: { type: 'STRING' }, answered: { type: 'BOOLEAN' } }, required: ['answer', 'answered'] };

export async function support(u: SessionUser, code: string, question: string): Promise<AskPlan> {
  const g = guard(question);
  if (g) return { action: 'answer', say: guardReply(g) };
  const f = await productFacts(code);
  if (!f) return { action: 'answer', say: 'That isn’t a real UniVerse Trace code, so I can’t tell you about it. Check the code on the label, or scan it again.' };
  const links = [
    ...(f.brand.slug ? [{ title: `Ask ${f.brand.name}`, sub: 'The brand’s page', href: `/b/${f.brand.slug}` }] : []),
    { title: 'Open the passport', sub: f.code, href: `/t/${encodeURIComponent(code)}` },
  ];
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) return { action: 'show', say: `I can’t answer questions right now. The passport has the product’s facts, and ${f.brand.name} can help.`, items: links };
  const spend = await spendAi(u);
  if (!spend.ok) return { action: 'show', say: spend.message ?? 'You’ve used today’s AI allowance.', items: links };
  const out = await geminiJson<{ answer?: unknown; answered?: unknown }>(SYSTEM, `Product facts:\n${f.facts}\n\nThe buyer asks: ${question}`, SCHEMA, 600, true).catch(() => null);
  const answer = typeof out?.answer === 'string' ? out.answer.trim().slice(0, 1500) : '';
  if (!answer) return { action: 'show', say: `I couldn’t answer that just now. ${f.brand.name} can help.`, items: links };
  return { action: 'show', say: out?.answered === false ? `${answer}\n\nFor this, please ask ${f.brand.name}.` : answer, items: links };
}

/** POST /trace/scan/:code/ask { question }: the passport page's "Ask about this product". */
export async function askProduct(u: SessionUser, code: string, b: Body) {
  const question = short(b.question, 500);
  if (!question || question.length < 3) throw new BadRequestException('Type your question.');
  return support(u, code, question);
}
