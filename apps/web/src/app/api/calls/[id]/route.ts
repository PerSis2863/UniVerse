import { route } from '@/server/assignments';
import { callAccess } from '@/server/calls';

// GET ?kind=audio|video : the call for the call screen (group and class rooms take the kind asked for).
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => callAccess((await params).id, user, new URL(req.url).searchParams.get('kind')));
