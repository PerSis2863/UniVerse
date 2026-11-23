import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import type { AskPlan, SocialPost } from '@/lib/ask';
import { spendAi } from '../ai-budget';
import { featureOff } from '../moderation';
import { agentJson } from './own-model';
import { short } from '../trace';

// Ghidra's Social Media Manager (M433, one of the owner's app agents, 22 Nov): for Trace brands, Relief organisations,
// Green Business companies and schools. It drafts posts for the platforms asked (Instagram, LinkedIn, X, Facebook,
// WhatsApp) in the name of what the person runs, with a suggested day each, for them to copy and post themselves:
// it never posts anything (no social accounts are connected). It never invents numbers, results or quotes.

export const PLATFORMS = ['Instagram', 'LinkedIn', 'X', 'Facebook', 'WhatsApp'] as const;

/** The names of what this person speaks for: their Trace brand, a Relief organisation they run, their school. 4 queries. */
async function voices(u: SessionUser): Promise<string[]> {
  const [brand, member, me] = await Promise.all([
    prisma.traceBrandMember.findFirst({ where: { userId: u.id }, select: { brand: { select: { name: true } } } }).catch(() => null),
    prisma.reliefOrgMember.findFirst({ where: { userId: u.id, role: { in: ['OWNER', 'COORDINATOR'] } }, select: { orgId: true } }).catch(() => null),
    prisma.user.findUnique({ where: { id: u.id }, select: { organization: { select: { name: true } } } }).catch(() => null),
  ]);
  const relief = member ? await prisma.reliefOrg.findUnique({ where: { id: member.orgId }, select: { name: true } }).catch(() => null) : null;
  return [brand?.brand.name && `the brand ${brand.brand.name} (on Trace)`, relief?.name && `the organisation ${relief.name} (on Relief)`, me?.organization?.name && `the school ${me.organization.name}`]
    .filter((x): x is string => !!x);
}

/** The posts AI wrote, checked: a known platform, some words, X within its limit. */
export function checkPosts(raw: unknown, max: number): SocialPost[] {
  if (!Array.isArray(raw)) return [];
  const out: SocialPost[] = [];
  for (const p of raw) {
    const r = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    const platform = PLATFORMS.find((x) => x.toLowerCase() === String(r.platform ?? '').toLowerCase().replace('twitter', 'x'));
    let text = short(r.text, 3000) ?? '';
    if (!platform || text.length < 10) continue;
    if (platform === 'X' && text.length > 280) text = `${text.slice(0, 279).replace(/\s+\S*$/, '')}…`;
    out.push({ platform, text, when: short(r.when, 40) || null });
    if (out.length >= max) break;
  }
  return out;
}

export async function socialPosts(u: SessionUser, topic: string, platforms: string[], count: number): Promise<AskPlan> {
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) return { action: 'answer', say: 'Writing posts needs Ghidra’s AI, which is off right now.' };
  const spend = await spendAi(u);
  if (!spend.ok) return { action: 'answer', say: spend.message ?? 'You’ve used today’s AI allowance.' };
  const as = await voices(u);
  const want = platforms.length ? platforms : ['Instagram', 'LinkedIn', 'X'];
  const prompt = `Topic: ${topic}\nPlatforms: ${want.join(', ')}\nHow many posts in all: ${Math.max(count, want.length)}\n${as.length ? `They post for: ${as.join('; ')}.` : 'They post for themselves.'}`;
  const out = await agentJson<{ posts?: unknown }>('social', prompt, 1800).catch(() => null);
  const posts = checkPosts(out?.posts, 6);
  if (!posts.length) return { action: 'answer', say: 'I couldn’t write good posts on that. Try saying what it’s about and where to post it.' };
  return { action: 'posts', say: `${posts.length} post${posts.length === 1 ? '' : 's'} ready to copy${as.length ? ` for ${as[0].replace(/^the (brand|organisation|school) /, '').replace(/ \(on \w+\)$/, '')}` : ''}. Check them, fill anything in [brackets], then post them yourself:`, posts };
}
