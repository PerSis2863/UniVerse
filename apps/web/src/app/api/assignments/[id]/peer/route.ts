import { route } from '@/server/assignments';
import { peerView, submitPeerReview } from '@/server/peer-review';

// A student's peer reviews (src/server/peer-review.ts): GET the answers to review (anonymous) and the
// reviews of their own work; POST { reviewId, criteria, comment } a review.

type Ctx = { params: Promise<{ id: string }> };

export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => peerView((await params).id, user));
export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => submitPeerReview((await params).id, user, (await req.json().catch(() => ({}))) ?? {}));
