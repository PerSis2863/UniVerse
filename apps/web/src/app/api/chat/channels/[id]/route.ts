import { route } from '@/server/assignments';
import { updateChannel } from '@/server/communities';

// PATCH { name, slowModeSec, category, private, viewRoles, postRoles } or { move: 'up' | 'down' } or { delete: true }: moderators change a channel.
export const PATCH = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => updateChannel(user, (await params).id, await req.json().catch(() => ({}))));
