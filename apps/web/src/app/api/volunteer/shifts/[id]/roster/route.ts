import { route } from '@/server/assignments';
import { roster } from '@/server/volunteering';

// GET (admin or teacher): who signed up and checked in.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => roster(user, (await params).id));
