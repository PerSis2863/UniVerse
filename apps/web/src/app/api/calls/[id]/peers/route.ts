import { route } from '@/server/assignments';
import { roomPeers } from '@/server/calls';

// GET: who is in this room call right now (for voice channels: "2 in the room").
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => roomPeers((await params).id, user));
