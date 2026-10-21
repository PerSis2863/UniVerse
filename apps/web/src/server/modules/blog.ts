import type { Router } from '../router';
import { first } from '../body';
import { audit } from '../audit';
import { createPost, deletePost, ownerPost, ownerPosts, publicPost, publicPosts, updatePost } from '../blog';

// The public blog (Stage 5 · Phase E, src/server/blog.ts): anyone reads published posts; the owner
// writes them in the owner console → Blog.
export default function blogModule(router: Router) {
  const pub = router.controller('blog', { public: true });
  pub.get('', ({ query }) => publicPosts(first(query.before)));
  pub.get<{ slug: string }>(':slug', ({ params }) => publicPost(params.slug));

  const r = router.controller('owner', { owner: true });
  r.get('blog', () => ownerPosts());
  r.get<{ id: string }>('blog/:id', ({ params }) => ownerPost(params.id));
  r.post('blog', async ({ body, user, req }) => {
    const p = await createPost(body ?? {});
    audit(user, { action: 'blog.created', summary: `Wrote a blog draft “${p.title}”`, targetType: 'blog_post', targetId: p.id }, req);
    return p;
  });
  r.put<{ id: string }>('blog/:id', async ({ params, body, user, req }) => {
    const p = await updatePost(params.id, body ?? {});
    const what = body?.status === 'PUBLISHED' ? 'Published' : body?.status === 'DRAFT' ? 'Took back' : 'Edited';
    audit(user, { action: 'blog.updated', summary: `${what} the blog post “${p.title}”`, targetType: 'blog_post', targetId: p.id }, req);
    return p;
  });
  r.delete<{ id: string }>('blog/:id', async ({ params, user, req }) => {
    const res = await deletePost(params.id);
    audit(user, { action: 'blog.deleted', summary: `Deleted the blog post “${res.title}”`, targetType: 'blog_post', targetId: params.id }, req);
    return res;
  });
}
