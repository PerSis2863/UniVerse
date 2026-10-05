import { route } from '@/server/assignments';
import { signUp } from '@/server/volunteering';

// POST { on: boolean }: take a place on the shift, or give it up.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => signUp(user, (await params).id, (await req.json().catch(() => ({}))).on !== false));
