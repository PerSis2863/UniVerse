import type { SessionUser } from '@/lib/server-auth';
import type { AskPlan } from '@/lib/ask';
import { spendAi } from '../ai-budget';
import { featureOff } from '../moderation';
import { geminiJson } from '../gemini';
import { PLAYBOOKS, prompt } from './playbooks';

// Ghidra's Research Assistant (M433, one of the owner's app agents, 22 Nov): for UniVersity and Green Business. It finds
// sources on Wikipedia (free, no key: its REST search and page summaries; only the topic is sent, from the server, never
// who asks) and writes a short summary that cites them as [1], [2]… using only what they say. Without AI it shows the
// sources' own summaries. The sources come back as links.

const UA = 'UniVerse-Ghidra/1.0 (education platform research assistant)';
const MAX = 4;

export interface Source { n: number; title: string; url: string; extract: string }

/** Up to four Wikipedia articles on a topic, with their opening summary. */
export async function findSources(topic: string, lang = 'en'): Promise<Source[]> {
  const base = `https://${lang}.wikipedia.org`;
  const found = await fetch(`${base}/w/rest.php/v1/search/page?q=${encodeURIComponent(topic)}&limit=${MAX}`, { headers: { 'User-Agent': UA } })
    .then((r) => (r.ok ? (r.json() as Promise<{ pages?: { key?: string }[] }>) : null)).catch(() => null);
  const keys = (found?.pages ?? []).map((p) => p.key).filter((k): k is string => typeof k === 'string').slice(0, MAX);
  const pages = await Promise.all(keys.map((k) => fetch(`${base}/api/rest_v1/page/summary/${encodeURIComponent(k)}`, { headers: { 'User-Agent': UA } })
    .then((r) => (r.ok ? (r.json() as Promise<{ type?: string; title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } }>) : null)).catch(() => null)));
  return pages.flatMap((p) => (p && p.type === 'standard' && p.extract && p.title ? [{ title: p.title, extract: p.extract.slice(0, 1500), url: p.content_urls?.desktop?.page ?? `${base}/wiki/${encodeURIComponent(p.title)}` }] : []))
    .map((s, i) => ({ n: i + 1, ...s }));
}

/** Keeps only citation numbers that exist ([7] with four sources goes). */
export const keepCitations = (text: string, n: number) => text.replace(/\[(\d+)\]/g, (m, d) => (Number(d) >= 1 && Number(d) <= n ? m : ''));

const SYSTEM = prompt(PLAYBOOKS.research, 'Write a short summary (3–5 sentences) and up to 5 key points. Plain text, no ** or # marks.');
const SCHEMA = { type: 'OBJECT', properties: { summary: { type: 'STRING' }, points: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['summary'] };

export async function research(u: SessionUser, topic: string): Promise<AskPlan> {
  const sources = await findSources(topic);
  if (!sources.length) return { action: 'answer', say: `I couldn’t find sources on “${topic}” on Wikipedia. Try other words, or a broader topic.` };
  const items = sources.map((s) => ({ title: `[${s.n}] ${s.title}`, sub: 'Wikipedia', href: s.url, external: true }));
  const ai = process.env.GEMINI_API_KEY && !(await featureOff('ai')) && (await spendAi(u)).ok;
  if (ai) {
    const text = sources.map((s) => `[${s.n}] ${s.title}: ${s.extract}`).join('\n\n');
    const out = await geminiJson<{ summary?: unknown; points?: unknown }>(SYSTEM, `Topic: ${topic}\n\nSources:\n${text}`, SCHEMA, 900, true).catch(() => null);
    if (out && typeof out.summary === 'string' && out.summary.trim()) {
      const points = Array.isArray(out.points) ? out.points.filter((p): p is string => typeof p === 'string').slice(0, 5) : [];
      const say = keepCitations([out.summary.trim(), ...points.map((p) => `- ${p.trim()}`)].join('\n'), sources.length).slice(0, 4000);
      return { action: 'show', say: `${say}\n\nSources (Wikipedia):`, items };
    }
  }
  return { action: 'show', say: `Here’s what Wikipedia says about “${topic}”:\n${sources.map((s) => `[${s.n}] ${s.extract.split('. ').slice(0, 2).join('. ')}`).join('\n')}`, items };
}
