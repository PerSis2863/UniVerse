import { route } from '@/server/assignments';
import { createGuestLink, revokeGuestLink } from '@/server/calls';

// Guest links for a call link (Stage 4 · 2.11; its creator only). POST { hours: 1 | 24 | 168 }:
// a new link. DELETE ?token=: take one back. See src/server/calls.ts.
type Ctx = { params: Promise<{ id: string }> };
export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => createGuestLink((await params).id, user, (await req.json().catch(() => ({}))).hours));
export const DELETE = (req: Request, { params }: Ctx) =>
  route(req, async (user) => revokeGuestLink((await params).id, user, new URL(req.url).searchParams.get('token') ?? ''));
