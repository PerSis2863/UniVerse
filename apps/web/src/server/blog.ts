import prisma from '@/lib/db';
import { isAppFileUrl } from '@/lib/storage';
import { oneOf, text } from './body';
import { BadRequestException, ConflictException, NotFoundException } from './http';

// The public blog (Stage 5 · Phase E): the owner writes posts in Markdown in the owner console →
// Blog; published posts are listed at /blog and read at /blog/<slug>. Drafts are only seen in the
// console. The Markdown is shown by LegalMarkdown (headings, lists, tables, bold, italic, links):
// no HTML, so a post can't run anything on the site.

export const MAX_BODY = 60_000;
const PAGE = 24;

/** "Our new term starts!" → "our-new-term-starts" (letters and numbers, at most 80). */
export function slugify(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
}

/** Minutes to read, at about 220 words a minute. */
export const readMinutes = (body: string) => Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 220));

function cover(v: unknown) {
  const u = text(v).trim();
  if (!u) return null;
  if ((/^https:\/\/[^\s"'<>]+$/.test(u) || isAppFileUrl(u)) && u.length <= 500) return u;
  throw new BadRequestException('The cover picture must be an https address or an uploaded picture.');
}

/** The fields of a post from the console's form. */
export function postFields(b: Record<string, unknown>) {
  const title = text(b.title).trim().slice(0, 140);
  if (!title) throw new BadRequestException('Give the post a title.');
  const body = text(b.body).replace(/\r/g, '');
  if (!body.trim()) throw new BadRequestException('Write the post first.');
  if (body.length > MAX_BODY) throw new BadRequestException(`A post can be up to ${MAX_BODY.toLocaleString('en')} characters.`);
  const slug = slugify(text(b.slug) || title);
  if (!slug) throw new BadRequestException('The address needs some letters or numbers.');
  return { title, body, slug, minutes: readMinutes(body), summary: text(b.summary).trim().slice(0, 300) || null, coverUrl: cover(b.coverUrl), authorName: text(b.authorName).trim().slice(0, 80) || null };
}

async function slugFree(slug: string, id?: string) {
  const other = await prisma.blogPost.findFirst({ where: { slug, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (other) throw new ConflictException('Another post already uses this address. Change the address.');
}

const LIST = { id: true, slug: true, title: true, summary: true, coverUrl: true, authorName: true, status: true, publishedAt: true, updatedAt: true } as const;

// ─── Owner console → Blog ────────────────────────────────────────────────────

/** GET /owner/blog — every post, drafts first, then the newest. */
export async function ownerPosts() {
  const posts = await prisma.blogPost.findMany({ orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }], take: 200, select: LIST });
  return { posts };
}

/** GET /owner/blog/:id — one post with its text, to edit. */
export async function ownerPost(id: string) {
  const p = await prisma.blogPost.findUnique({ where: { id } });
  if (!p) throw new NotFoundException('That post isn’t there any more.');
  return p;
}

/** POST /owner/blog — a new draft. */
export async function createPost(b: Record<string, unknown>) {
  const data = postFields(b);
  await slugFree(data.slug);
  return prisma.blogPost.create({ data, select: LIST });
}

/** PUT /owner/blog/:id { …fields, status? } — saves, publishes (DRAFT → PUBLISHED, dated the first time) or takes back. */
export async function updatePost(id: string, b: Record<string, unknown>) {
  const p = await prisma.blogPost.findUnique({ where: { id }, select: { id: true, publishedAt: true } });
  if (!p) throw new NotFoundException('That post isn’t there any more.');
  const data = postFields(b);
  await slugFree(data.slug, id);
  const status = oneOf(['DRAFT', 'PUBLISHED'] as const, b.status) ? b.status : undefined;
  return prisma.blogPost.update({
    where: { id },
    data: { ...data, ...(status ? { status } : {}), ...(status === 'PUBLISHED' && !p.publishedAt ? { publishedAt: new Date() } : {}) },
    select: LIST,
  });
}

/** DELETE /owner/blog/:id */
export async function deletePost(id: string) {
  const p = await prisma.blogPost.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!p) throw new NotFoundException('That post isn’t there any more.');
  await prisma.blogPost.delete({ where: { id } });
  return { ok: true, title: p.title };
}

// ─── The public blog ─────────────────────────────────────────────────────────

const cached = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } });

/** GET /blog?before=<ISO date> — published posts, newest first, a page at a time. */
export async function publicPosts(beforeRaw: string | undefined) {
  const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw) : null;
  const rows = await prisma.blogPost.findMany({
    where: { status: 'PUBLISHED', ...(before ? { publishedAt: { lt: before } } : {}) },
    orderBy: { publishedAt: 'desc' },
    take: PAGE + 1,
    // Not the posts' text: the list needs only the reading time, worked out when a post is saved.
    select: { slug: true, title: true, summary: true, coverUrl: true, authorName: true, publishedAt: true, minutes: true },
  });
  const posts = rows.slice(0, PAGE);
  return cached({ posts, more: rows.length > PAGE ? posts[posts.length - 1].publishedAt : null });
}

/** GET /blog/:slug — one published post and the three newest others. */
export async function publicPost(slug: string) {
  const p = await prisma.blogPost.findFirst({ where: { slug: slugify(slug), status: 'PUBLISHED' }, select: { slug: true, title: true, summary: true, coverUrl: true, authorName: true, publishedAt: true, updatedAt: true, body: true, minutes: true } });
  if (!p) throw new NotFoundException('This post isn’t on the blog.');
  const more = await prisma.blogPost.findMany({ where: { status: 'PUBLISHED', NOT: { slug: p.slug } }, orderBy: { publishedAt: 'desc' }, take: 3, select: { slug: true, title: true, summary: true, publishedAt: true } });
  return cached({ ...p, more });
}
