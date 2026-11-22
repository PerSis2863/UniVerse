import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/server-auth';
import { cleanPlan, localPlan } from '@/lib/ask';
import { findSources, keepCitations, research } from './research';
import { checkPosts } from './social';

vi.mock('@/lib/db', () => ({ default: {} }));
vi.mock('../moderation', () => ({ featureOff: vi.fn().mockResolvedValue(true) }));

const me = { id: 'u1', role: 'STUDENT' } as SessionUser;
const page = (title: string) => ({ type: 'standard', title, extract: `${title} is a topic. It has two sentences. And a third.`, content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${title}` } } });

describe('Ghidra’s app agents (M374)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('the supervisor sends research and social posts to their agents, and checks what AI asks for', () => {
    expect(localPlan('Research photosynthesis')).toMatchObject({ action: 'research', topic: 'photosynthesis' });
    expect(localPlan('find sources about climate change in India')).toMatchObject({ action: 'research', topic: 'climate change in India' });
    expect(localPlan('Write 2 Instagram posts about our tree planting day')).toMatchObject({ action: 'social_posts', topic: 'our tree planting day', platforms: ['Instagram'], count: 2 });
    expect(cleanPlan({ action: 'social_posts', topic: 'our fundraiser', platforms: ['twitter', 'TikTok', 'LinkedIn'], count: 50 })).toMatchObject({ platforms: ['X', 'LinkedIn'], count: 3 });
    expect(cleanPlan({ action: 'research', topic: '' }).action).toBe('answer');
  });

  it('the Research Assistant finds sources on Wikipedia and shows them, numbered, as links', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/search/page') ? { pages: [{ key: 'Photosynthesis' }, { key: 'Chlorophyll' }] } : page(decodeURIComponent(url.split('/').pop()!))))));
    const s = await findSources('photosynthesis');
    expect(s.map((x) => [x.n, x.title])).toEqual([[1, 'Photosynthesis'], [2, 'Chlorophyll']]);
    const r = await research(me, 'photosynthesis');
    expect(r).toMatchObject({ action: 'show', items: [{ title: '[1] Photosynthesis', sub: 'Wikipedia', external: true }, { title: '[2] Chlorophyll' }] });
  });

  it('says so when Wikipedia has nothing, and drops citations that point nowhere', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ pages: [] }))));
    expect((await research(me, 'zzqx')).action).toBe('answer');
    expect(keepCitations('A [1] B [3] C [2]', 2)).toBe('A [1] B  C [2]');
  });

  it('the Social Media Manager keeps only real platforms, some words, and X within 280 characters', () => {
    const posts = checkPosts([{ platform: 'twitter', text: 'x'.repeat(400), when: 'Monday' }, { platform: 'MySpace', text: 'a good post here' }, { platform: 'LinkedIn', text: 'short' }, { platform: 'instagram', text: 'Join our tree planting day! 🌱' }], 6);
    expect(posts.map((p) => p.platform)).toEqual(['X', 'Instagram']);
    expect(posts[0].text.length).toBeLessThanOrEqual(281);
  });
});
