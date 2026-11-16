import { route } from '@/server/assignments';
import { disconnect } from '@/server/connections';

type Ctx = { params: Promise<{ service: string }> };

// DELETE: disconnect one of my connections (revoked at the service where it allows that).
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => disconnect(user, (await params).service));
