import { route } from '@/server/assignments';
import { listFlags } from '@/server/safety';

// Chat messages the safety check flagged (Stage 4 · 4.10): school admins only. ?status=OPEN|REVIEWED|DISMISSED
export const GET = (req: Request) => route(req, (user) => listFlags(user, new URL(req.url).searchParams.get('status')));
