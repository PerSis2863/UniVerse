import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { createPost, postFields, publicPost, publicPosts, readMinutes, slugify, updatePost } from './blog';

vi.mock('@/lib/db', () => ({
  default: { blogPost: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() } },
}));
vi.mock('@/lib/storage', () => ({ isAppFileUrl: (u: string) => u.startsWith('/api/files/') }));

type Fn = ReturnType<typeof vi.fn>;
const db = (prisma as unknown as { blogPost: Record<string, Fn> }).blogPost;
const post = { title: 'Our new term starts!', body: 'Hello **world**' };

describe('the blog (Phase E)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('makes an address from the title', () => {
    expect(slugify('Our new term starts!')).toBe('our-new-term-starts');
    expect(slugify('  Café — été 2026 ')).toBe('cafe-ete-2026');
    expect(slugify('!!!')).toBe('');
    expect(slugify('a'.repeat(79) + ' b')).toBe('a'.repeat(79));
  });

  it('checks a post: title, text, address and cover picture', () => {
    expect(postFields(post)).toMatchObject({ slug: 'our-new-term-starts', summary: null, coverUrl: null });
    expect(() => postFields({ body: 'x' })).toThrow('title');
    expect(() => postFields({ title: 'T', body: '  ' })).toThrow('Write the post');
    expect(() => postFields({ ...post, slug: '???', title: '!!!' })).toThrow('letters or numbers');
    expect(postFields({ ...post, coverUrl: '/api/files/k/p.jpg' }).coverUrl).toBe('/api/files/k/p.jpg');
    expect(() => postFields({ ...post, coverUrl: 'javascript:alert(1)' })).toThrow('cover picture');
    expect(() => postFields({ ...post, coverUrl: 'http://x.test/a.jpg' })).toThrow('cover picture');
  });

  it('refuses an address another post uses', async () => {
    db.findFirst.mockResolvedValue({ id: 'other' });
    await expect(createPost(post)).rejects.toThrow('already uses this address');
  });

  it('dates a post the first time it is published, and keeps that date', async () => {
    db.findFirst.mockResolvedValue(null);
    db.findUnique.mockResolvedValue({ id: 'p1', publishedAt: null });
    db.update.mockResolvedValue({ id: 'p1', title: post.title });
    await updatePost('p1', { ...post, status: 'PUBLISHED' });
    expect(db.update.mock.calls[0][0].data.publishedAt).toBeInstanceOf(Date);
    db.findUnique.mockResolvedValue({ id: 'p1', publishedAt: new Date('2026-01-01') });
    await updatePost('p1', { ...post, status: 'PUBLISHED' });
    expect(db.update.mock.calls[1][0].data.publishedAt).toBeUndefined();
    await updatePost('p1', { ...post, status: 'HACKED' });
    expect(db.update.mock.calls[2][0].data.status).toBeUndefined();
  });

  it('shows only published posts, a page at a time', async () => {
    db.findFirst.mockResolvedValue(null);
    await expect(publicPost('a-draft')).rejects.toThrow('isn’t on the blog');
    expect(db.findFirst.mock.calls[0][0].where).toEqual({ slug: 'a-draft', status: 'PUBLISHED' });
    const rows = Array.from({ length: 25 }, (_, i) => ({ slug: `p${i}`, title: 'T', summary: null, coverUrl: null, authorName: null, publishedAt: new Date(Date.UTC(2026, 0, 30 - i)), body: 'word '.repeat(440) }));
    db.findMany.mockResolvedValue(rows);
    const res = await (await publicPosts(undefined)).json();
    expect(res.posts).toHaveLength(24);
    expect(res.posts[0]).not.toHaveProperty('body');
    expect(res.posts[0].minutes).toBe(2);
    expect(res.more).toBe(res.posts[23].publishedAt);
    expect(db.findMany.mock.calls[0][0].where).toEqual({ status: 'PUBLISHED' });
  });

  it('counts reading time', () => expect([readMinutes('one'), readMinutes('w '.repeat(1100))]).toEqual([1, 5]));
});
