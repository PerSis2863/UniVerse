import { route } from '@/server/assignments';
import { createListing, listBoard } from '@/server/campus-board';

// Stage 5 · Q17: the campus board. GET ?section=market|rides|housing&mine=1 · POST a post (students).
export const GET = (req: Request) => route(req, (user) => { const q = new URL(req.url).searchParams; return listBoard(user, q.get('section'), q.get('mine') === '1'); });
export const POST = (req: Request) => route(req, async (user) => createListing(user, await req.json().catch(() => ({}))));
