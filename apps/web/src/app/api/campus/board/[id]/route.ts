import { route } from '@/server/assignments';
import { deleteListing, setListingStatus } from '@/server/campus-board';

// Stage 5 · Q17: PATCH { status: DONE | ACTIVE } (the poster) · DELETE (the poster or an admin).
type Ctx = { params: Promise<{ id: string }> };
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => setListingStatus(user, (await params).id, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteListing(user, (await params).id));
