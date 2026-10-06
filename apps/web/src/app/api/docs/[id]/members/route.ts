import { route } from '@/server/assignments';
import { setDocMember } from '@/server/docs';

// POST { email, role } to share, or { userId, remove: true } to stop sharing.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => setDocMember((await params).id, user, await req.json().catch(() => ({}))));
