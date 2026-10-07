import { route } from '@/server/assignments';
import { getBoardVersion } from '@/server/board-extras';

// GET: one saved version of a board, with its elements (to preview or restore; Stage 4 · 3.4).
export const GET = (req: Request, { params }: { params: Promise<{ vid: string }> }) => route(req, async (user) => getBoardVersion((await params).vid, user));
