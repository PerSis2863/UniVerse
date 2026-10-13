import { route } from '@/server/assignments';
import { levelItems } from '@/server/reading-level';

// POST { items: [{ kind, id }], level: 'g8' | 'g5', to? } (Stage 5 · D9): course material sections,
// assignment instructions rewritten for a reading level, with key terms explained.
export const POST = (req: Request) => route(req, async (user) => levelItems(user, (await req.json().catch(() => ({}))) as Record<string, unknown>));
