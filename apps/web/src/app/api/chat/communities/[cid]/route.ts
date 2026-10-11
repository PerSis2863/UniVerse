import { route } from '@/server/assignments';
import { addMembers, communityRoleAction, createChannel, getCommunity, leaveCommunity, manageMember, updateCommunity } from '@/server/communities';
import { BadRequestException } from '@/server/http';

type Ctx = { params: Promise<{ cid: string }> };

// GET: members and roles. PATCH: name, description, colour, new invite link, open to everyone
// ({ discoverable }), or { delete: true }.
// POST { action: 'add' | 'member' | 'channel' | 'leave' | 'role-create' | 'role-update' | 'role-delete' | 'member-roles', ... }.
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => getCommunity(user, (await params).cid));
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => updateCommunity(user, (await params).cid, await req.json().catch(() => ({}))));
export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => {
    const id = (await params).cid;
    const b = await req.json().catch(() => ({}));
    if (b.action === 'add') return addMembers(user, id, b);
    if (b.action === 'member') return manageMember(user, id, b);
    if (b.action === 'channel') return createChannel(user, id, b);
    if (b.action === 'leave') return leaveCommunity(user, id);
    if (typeof b.action === 'string' && (b.action.startsWith('role-') || b.action === 'member-roles')) return communityRoleAction(user, id, b);
    throw new BadRequestException('Unknown action.');
  });
