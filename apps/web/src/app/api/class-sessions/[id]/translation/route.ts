import { route } from '@/server/assignments';
import { translatePack } from '@/server/class-companion';

// GET ?to=<language>: the class's study pack in that language (Stage 4 · 4.1), made once per
// language and kept for everyone in the course who reads it.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => translatePack((await params).id, user, new URL(req.url).searchParams.get('to') ?? ''));
