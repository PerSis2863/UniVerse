import { route } from '@/server/assignments';
import { profileOf } from '@/server/profile';

// Stage 5 · Q18: a person's profile for anyone signed in (no email or phone).
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => profileOf(user, decodeURIComponent((await params).id)));
