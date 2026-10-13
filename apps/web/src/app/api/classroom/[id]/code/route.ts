import { route } from '@/server/assignments';
import { currentCode } from '@/server/classroom';

// GET: the join code to project now and seconds until it changes (Stage 5 · D7; RotatingQr).
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => currentCode((await params).id, user));
