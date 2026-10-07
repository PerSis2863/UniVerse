import { route } from '@/server/assignments';
import { flagContext, reviewFlag } from '@/server/safety';

// One flag (Stage 4 · 4.10): GET the messages around it; POST { action: 'reviewed' | 'dismiss' | 'pause' | 'unpause', note? }.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => flagContext(user, (await params).id));
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => reviewFlag(user, (await params).id, await req.json().catch(() => ({}))));
