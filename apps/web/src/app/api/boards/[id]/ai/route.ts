import { route } from '@/server/assignments';
import { boardAi } from '@/server/board-ai';

// POST { action: 'themes' | 'mindmap' | 'summary', texts?, topic? }: AI on boards (Stage 4 · 3.5).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => boardAi((await params).id, user, await req.json().catch(() => ({}))));
