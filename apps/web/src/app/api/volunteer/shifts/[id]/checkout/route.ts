import { route } from '@/server/assignments';
import { checkOut } from '@/server/volunteering';

// POST: check out; hours are counted, verified and turned into impact points.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => checkOut(user, (await params).id));
