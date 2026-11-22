import type { SessionUser } from '@/lib/server-auth';
import type { AskPlan } from '@/lib/ask';
import { spendAi } from '../ai-budget';
import { featureOff } from '../moderation';
import { geminiJson } from '../gemini';
import { placeOf } from '../travel';
import { PLAYBOOKS, prompt } from './playbooks';

// Ghidra's Travel Planner (M375, one of the owner's app agents, 22 Nov): "plan 3 days in Jaipur for 2 of us" becomes a
// real trip: the place found in Travel's guides (Wikivoyage, placeOf), its days, the travellers, an honest travel agent's
// tips for that place (its playbook: pacing, area to stay, getting around, customs, safety, season; never invented prices
// or hours), and, once the person taps Make the trip, the trip opens with "Plan my days" started (/travel/trip?plan=1).

const SYSTEM = prompt(PLAYBOOKS.travel, 'Give at most 5 tips, each one line starting with "- ".');
const SCHEMA = { type: 'OBJECT', properties: { tips: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['tips'] };

/** A trip proposal for a place: found in Travel's guides, with days, people and a travel agent's tips. */
export async function planTrip(u: SessionUser, plan: Extract<AskPlan, { action: 'trip_new' }>): Promise<AskPlan> {
  if (!plan.place) return plan;
  const place = await placeOf(plan.place).catch(() => null);
  if (!place) return { ...plan, place: null, say: `I couldn’t find ${plan.place} in Travel’s guides, so the trip will start without a city: add it on the trip’s page.` };
  const days = plan.days ?? 3;
  let tips: string[] = [];
  if (process.env.GEMINI_API_KEY && !(await featureOff('ai')) && (await spendAi(u)).ok) {
    const out = await geminiJson<{ tips?: unknown }>(SYSTEM, `Tips for ${days} days in ${place.name} for ${plan.travellers} ${plan.travellers === 1 ? 'person' : 'people'}${plan.startDate ? ` from ${plan.startDate}` : ''}.`, SCHEMA, 500, true).catch(() => null);
    tips = Array.isArray(out?.tips) ? out.tips.filter((t): t is string => typeof t === 'string').map((t) => t.replace(/^\s*-\s*/, '').trim()).filter(Boolean).slice(0, 5) : [];
  }
  return {
    ...plan, name: plan.name.startsWith('Trip to') ? `Trip to ${place.name}` : plan.name, place: place.guide, days,
    say: `Make a ${days}-day trip to ${place.name} for ${plan.travellers} ${plan.travellers === 1 ? 'person' : 'people'}? I’ll open it and start planning the days.${tips.length ? `\n${tips.map((t) => `- ${t}`).join('\n')}` : ''}`,
  };
}
