import { route } from '@/server/assignments';
import { askSemester, searchSemester } from '@/server/semester';

// "Ask your semester" (Stage 4 · 4.5; src/server/semester.ts). GET ?q=&kinds=: search (no AI).
// POST { q, kinds }: an AI answer from the best passages, with citations.
export const GET = (req: Request) => route(req, async (user) => {
  const sp = new URL(req.url).searchParams;
  return searchSemester(user, sp.get('q') ?? '', sp.get('kinds'));
});
export const POST = (req: Request) => route(req, async (user) => {
  const b = await req.json().catch(() => ({}));
  return askSemester(user, String(b.q ?? ''), Array.isArray(b.kinds) ? b.kinds.join(',') : b.kinds);
});
