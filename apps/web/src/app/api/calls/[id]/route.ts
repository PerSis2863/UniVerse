import { route } from '@/server/assignments';
import { callAccess } from '@/server/calls';

// GET: the call (voice or video, who's in the chat) for the call screen. See src/server/calls.ts.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => callAccess((await params).id, user));
