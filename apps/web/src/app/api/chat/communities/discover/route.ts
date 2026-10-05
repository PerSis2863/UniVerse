import { route } from '@/server/assignments';
import { discoverCommunities } from '@/server/communities';

// GET: communities open to the whole network that I haven't joined (Messages → Communities → Discover).
export const GET = (req: Request) => route(req, (user) => discoverCommunities(user));
