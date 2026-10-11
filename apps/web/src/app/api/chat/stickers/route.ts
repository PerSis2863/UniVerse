import { route } from '@/server/assignments';
import { createPack, stickerPacks } from '@/server/stickers';

// Sticker packs (Stage 5 · B7.2). GET: the school's packs and mine. POST { name, school? }: a new pack.
export const GET = (req: Request) => route(req, (user) => stickerPacks(user));
export const POST = (req: Request) => route(req, async (user) => createPack(user, (await req.json().catch(() => ({}))) as Record<string, unknown>));
