import { route } from '@/server/assignments';
import { filesHub } from '@/server/space-files';

// Files across every space someone is in (Stage 5 · B9.13): ?view=recent|starred, or ?q= to search
// names and the words inside files.
export const GET = (req: Request) => route(req, async (user) => { const p = new URL(req.url).searchParams; return filesHub(user, p.get('view'), p.get('q')); });
