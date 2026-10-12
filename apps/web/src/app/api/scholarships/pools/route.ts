import { route } from '@/server/assignments';
import { listSponsorPools, createSponsorPool, type CreatePoolInput } from '@/server/impact-scholarships';

export const GET = (req: Request) =>
  route(req, async (user) => listSponsorPools(user));

export const POST = (req: Request) =>
  route(req, async (user) => {
    const body = (await req.json()) as CreatePoolInput;
    return createSponsorPool(body, user);
  });
