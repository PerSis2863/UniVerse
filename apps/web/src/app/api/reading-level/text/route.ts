import { route } from '@/server/assignments';
import { levelText } from '@/server/reading-level';

// POST { text, level: 'g8' | 'g5', to? } (Stage 5 · D9): any text the reader selected on a page, in
// simpler words with key terms explained (Settings → Appearance → Help with selected text).
export const POST = (req: Request) => route(req, async (user) => levelText(user, (await req.json().catch(() => ({}))) as Record<string, unknown>));
