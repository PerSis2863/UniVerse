import { route } from '@/server/assignments';
import { translateItems } from '@/server/text-translate';

// POST { items: [{ kind, id }], to } (Stage 5 · B7.5): translations of announcements, group posts and
// comments on tasks, docs and whiteboards that the caller may read; stored and shared per language.
export const POST = (req: Request) => route(req, async (user) => translateItems(user, (await req.json().catch(() => ({}))) as Record<string, unknown>));
