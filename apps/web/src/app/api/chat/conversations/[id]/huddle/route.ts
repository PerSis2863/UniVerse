import { route } from '@/server/assignments';
import { startHuddle } from '@/server/huddles';

// POST: start (or join) this chat's huddle (Stage 4 · 1.11) → { callId, started }.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => startHuddle((await params).id, user));
