import { route } from '@/server/assignments';
import { contactPoster } from '@/server/campus-board';

// Stage 5 · Q17: a one-to-one chat with a post's author.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => contactPoster(user, (await params).id));
